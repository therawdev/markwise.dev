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
app.use(express.static(webRoot, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders(res, filePath) {
    // HTML and the buildless JS/JSX modules must always revalidate, or users
    // keep interacting with yesterday's UI after a deploy.
    if (/\.(html|js|jsx)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Markwise running at http://localhost:${port}`));
