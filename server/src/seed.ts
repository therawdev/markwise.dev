import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { DEFAULT_ROLES } from './permissions.js';

async function seed() {
  const email = (process.env.APP_OWNER_EMAIL || 'admin@markwise.dev').toLowerCase();
  const existing = await db('users').where({ email }).first();
  if (existing) {
    if (!existing.is_app_owner) await db('users').where({ id: existing.id }).update({ is_app_owner: true });
    console.log(`App owner already exists: ${email}`);
  } else {
    const password = process.env.APP_OWNER_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await db('users').insert({
      email,
      password_hash: await bcrypt.hash(password, 10),
      name: 'App Owner',
      is_app_owner: true,
    });
    console.log('App owner created:');
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
    console.log('Store this password — it is not shown again.');
  }

  // Default company with email-domain auto-join. Signups on these domains become
  // pending members of this company until an owner approves them.
  const coName = process.env.DEFAULT_COMPANY_NAME || 'Markwise';
  const domains = (process.env.DEFAULT_COMPANY_DOMAINS || 'markwise.dev,dyleris.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const existingCo = await db('companies').whereRaw('lower(name) = ?', coName.toLowerCase()).first();
  if (existingCo) {
    await db('companies').where({ id: existingCo.id }).update({ email_domains: JSON.stringify(domains) });
    console.log(`Default company "${existingCo.name}" email domains set: ${domains.join(', ')}`);
  } else {
    const slug = (coName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company');
    const [co] = await db('companies').insert({ name: coName, slug, email_domains: JSON.stringify(domains) }).returning('*');
    await db('roles').insert(DEFAULT_ROLES.map((r) => ({
      company_id: co.id, name: r.name, is_system: true, permissions: JSON.stringify(r.permissions),
    })));
    console.log(`Default company created: ${coName} (domains: ${domains.join(', ')})`);
  }

  await db.destroy();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
