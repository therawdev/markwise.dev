import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { orgsRouter } from './routes/orgs.js';
import { docsRouter } from './routes/docs.js';
import { aiRouter } from './routes/ai.js';
import { adminRouter } from './routes/admin.js';

const app = express();
app.use(express.json({ limit: '8mb' })); // documents carry full block JSON
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/orgs', orgsRouter);
app.use('/api/docs', docsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Static frontend: the Markwise app lives at the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');
app.use(express.static(webRoot, { index: 'index.html', extensions: ['html'] }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Markwise running at http://localhost:${port}`));
