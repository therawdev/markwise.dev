// Public OIDC SSO flow: discovery-driven login start + callback. Account is
// JIT-provisioned (or linked by email) and enrolled in the connection's company.
// Management of connections lives in routes/orgs.ts (org:settings).
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, audit } from '../db.js';
import { setAuthCookie } from '../auth.js';
import {
  SSO_STATE_COOKIE, getConnectionByCompany, getEnabledConnectionForEmail, companySsoAllowed,
  discover, pkcePair, signState, verifyState, buildAuthUrl, exchangeCode, verifyIdToken,
} from '../sso.js';

export const ssoRouter = Router();

// The redirect URI must be identical on the auth request and the token exchange,
// and registered verbatim at the IdP. Derive from the request (honors the proxy
// via trust proxy) unless APP_URL pins it.
function callbackUrl(req: import('express').Request): string {
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return base + '/api/sso/callback';
}

const safeNext = (n: unknown): string | undefined => {
  const s = typeof n === 'string' ? n : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : undefined;
};

// Public: does this email's domain have SSO? Powers the login page.
ssoRouter.get('/providers', async (req, res) => {
  const email = String(req.query.email || '');
  const conn = email ? await getEnabledConnectionForEmail(email) : null;
  if (!conn) return res.json({ available: false });
  const company = await db('companies').where({ id: conn.company_id }).first();
  res.json({ available: true, company: company?.name || null, start_url: `/api/sso/start?company=${conn.company_id}` });
});

// Begin login: redirect the browser to the IdP.
ssoRouter.get('/start', async (req, res) => {
  try {
    let conn = null;
    if (req.query.company) conn = await getConnectionByCompany(Number(req.query.company));
    else if (req.query.email) conn = await getEnabledConnectionForEmail(String(req.query.email));
    if (!conn || !conn.enabled) return res.redirect('/login?sso_error=' + encodeURIComponent('Single sign-on is not configured'));
    if (!(await companySsoAllowed(conn.company_id))) return res.redirect('/login?sso_error=' + encodeURIComponent('Single sign-on is not enabled for this organization'));

    const doc = await discover(conn.issuer);
    const { verifier, challenge } = pkcePair();
    const nonce = randomBytes(16).toString('base64url');
    const state = signState({ companyId: conn.company_id, nonce, verifier, next: safeNext(req.query.next) });
    res.cookie(SSO_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
    res.redirect(buildAuthUrl(doc, conn, callbackUrl(req), state, nonce, challenge));
  } catch (e) {
    res.redirect('/login?sso_error=' + encodeURIComponent(e instanceof Error ? e.message : 'SSO start failed'));
  }
});

// IdP redirects back here with ?code&state.
ssoRouter.get('/callback', async (req, res) => {
  const fail = (msg: string) => res.redirect('/login?sso_error=' + encodeURIComponent(msg));
  try {
    const cookieState = req.cookies?.[SSO_STATE_COOKIE];
    res.clearCookie(SSO_STATE_COOKIE);
    if (!cookieState || cookieState !== req.query.state) return fail('SSO session expired — please try again');
    const st = verifyState(String(cookieState));
    if (!st) return fail('SSO session expired — please try again');
    if (req.query.error) return fail(String(req.query.error_description || req.query.error));
    const code = String(req.query.code || '');
    if (!code) return fail('No authorization code returned');

    const conn = await getConnectionByCompany(st.companyId);
    if (!conn || !conn.enabled) return fail('Single sign-on is no longer enabled');
    if (!(await companySsoAllowed(conn.company_id))) return fail('Single sign-on is not enabled for this organization');

    const doc = await discover(conn.issuer);
    const idToken = await exchangeCode(doc, conn, code, callbackUrl(req), st.verifier);
    const identity = await verifyIdToken(doc, conn, idToken, st.nonce);
    if (!identity.emailVerified) return fail('Your identity provider reports this email as unverified');

    // Find or JIT-provision the user, then ensure company membership.
    let user = await db('users').whereRaw('lower(email) = ?', identity.email).first();
    if (user && user.status !== 'active') return fail('This account is suspended');
    if (!user) {
      [user] = await db('users')
        .insert({
          email: identity.email,
          password_hash: null,
          name: identity.name || identity.email.split('@')[0],
          auth_provider: 'sso',
        })
        .returning('*');
      await audit(user.id, 'user.sso_provision', `user:${user.id}`, { company_id: conn.company_id });
    }

    const member = await db('memberships').where({ user_id: user.id, company_id: conn.company_id }).first();
    if (!member) {
      const roleId = conn.default_role_id
        || (await db('roles').where({ company_id: conn.company_id, name: 'User' }).first())?.id;
      if (roleId) {
        await db('memberships').insert({ user_id: user.id, company_id: conn.company_id, role_id: roleId });
        await audit(user.id, 'member.sso_join', `company:${conn.company_id}`, { via: 'sso' });
      }
    }

    setAuthCookie(res, user.id);
    res.redirect(st.next || '/docs');
  } catch (e) {
    fail(e instanceof Error ? e.message : 'Single sign-on failed');
  }
});
