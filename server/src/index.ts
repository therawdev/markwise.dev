import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { orgsRouter } from './routes/orgs.js';
import { docsRouter } from './routes/docs.js';
import { aiRouter } from './routes/ai.js';
import { adminRouter } from './routes/admin.js';
import { getSetting } from './db.js';
import { sharedRouter } from './routes/shared.js';

const app = express();
// Behind a reverse proxy (Render, etc.) the client IP arrives in X-Forwarded-For;
// rate limiting keys on req.ip, so trust exactly one proxy hop.
app.set('trust proxy', 1);
app.use(
  helmet({
    // The frontend compiles JSX in the browser (Babel standalone from unpkg) and
    // uses inline scripts/styles throughout — a strict CSP would break it.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '8mb' })); // documents carry full block JSON
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/orgs', orgsRouter);
app.use('/api/docs', docsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/shared', sharedRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Public platform flags (signup gate, maintenance banner)
app.get('/api/platform', async (_req, res) => {
  res.json({
    allow_signups: (await getSetting<boolean>('allow_signups', true)) !== false,
    maintenance: (await getSetting<boolean>('maintenance', false)) === true,
  });
});

// Static frontend: the Markwise app lives at the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');
const spaShell = path.join(webRoot, 'app.html');

// Bare root → the account SPA dashboard; the editor keeps `/?doc=N` (index.html).
app.get('/', (req, res, next) => {
  if (req.query.doc !== undefined) return next();
  res.redirect('/docs');
});

app.use(express.static(webRoot, {
  index: 'index.html',
  // NB: no `extensions: ['html']` — clean SPA paths (/docs, /org/1) must reach
  // the SPA route below, not silently resolve to a stale docs.html file.
  setHeaders(res, filePath) {
    // HTML and the buildless JS/JSX modules must always revalidate, or users
    // keep interacting with yesterday's UI after a deploy.
    if (/\.(html|js|jsx)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Account SPA: one shell (app.html) backs all client-side routes. The router
// reads location.pathname, so a hard load of /org/5 must serve the shell too.
app.get(['/docs', '/admin', '/settings', '/login', '/signup', '/org/:id', '/invite/:token'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(spaShell);
});

// Public read-only doc viewer at a clean URL: /share/<token> → share.html shell
// (share.jsx reads the token from the path). Legacy /share.html?t= still works.
app.get('/share/:token', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(webRoot, 'share.html'));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Markwise running at http://localhost:${port}`));
