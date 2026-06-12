import { Router } from 'express';
import { db } from '../db.js';

// Public, unauthenticated read-only access to documents via their share token.
export const sharedRouter = Router();

sharedRouter.get('/:token', async (req, res) => {
  const token = String(req.params.token || '');
  if (token.length < 16) return res.status(404).json({ error: 'Document not found' });
  const doc = await db('documents').where({ share_token: token }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({
    title: doc.title,
    blocks: typeof doc.blocks === 'string' ? JSON.parse(doc.blocks) : doc.blocks,
    updated_at: doc.updated_at,
  });
});
