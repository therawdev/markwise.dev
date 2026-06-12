import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, canAccessDoc, hasPermission } from '../middleware.js';

export const docsRouter = Router();
docsRouter.use(requireAuth);

// ---- list: my personal docs + docs of companies where I can view ----
docsRouter.get('/', async (req, res) => {
  const memberships = await db('memberships')
    .join('roles', 'roles.id', 'memberships.role_id')
    .where('memberships.user_id', req.user!.id)
    .select('memberships.company_id', 'roles.permissions');
  const viewableCompanyIds = memberships
    .filter((m) => {
      const perms = typeof m.permissions === 'string' ? JSON.parse(m.permissions) : m.permissions;
      return (perms as string[]).includes('doc:view');
    })
    .map((m) => m.company_id);

  const docs = await db('documents')
    .leftJoin('companies', 'companies.id', 'documents.company_id')
    .leftJoin('users', 'users.id', 'documents.owner_id')
    .where((q) => {
      q.where('documents.owner_id', req.user!.id);
      if (viewableCompanyIds.length) q.orWhereIn('documents.company_id', viewableCompanyIds);
    })
    .orderBy('documents.updated_at', 'desc')
    .select(
      'documents.id',
      'documents.title',
      'documents.company_id',
      'documents.owner_id',
      'documents.updated_at',
      'companies.name as company_name',
      'users.name as owner_name'
    );
  res.json(docs);
});

docsRouter.post('/', async (req, res) => {
  const companyId = req.body?.company_id ? Number(req.body.company_id) : null;
  if (companyId != null && !(await hasPermission(req.user!, companyId, 'doc:create'))) {
    return res.status(403).json({ error: 'You need the create-documents permission in this company' });
  }
  const [doc] = await db('documents')
    .insert({
      title: String(req.body?.title || 'Untitled').slice(0, 200),
      blocks: JSON.stringify(req.body?.blocks || []),
      owner_id: req.user!.id,
      company_id: companyId,
    })
    .returning('*');
  await audit(req.user!.id, 'doc.create', `doc:${doc.id}`, { company_id: companyId });
  res.json(doc);
});

docsRouter.get('/:id', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:view'))) return res.status(403).json({ error: 'No access' });
  res.json({ ...doc, blocks: typeof doc.blocks === 'string' ? JSON.parse(doc.blocks) : doc.blocks });
});

docsRouter.put('/:id', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:edit'))) return res.status(403).json({ error: 'No edit access' });

  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (req.body?.title != null) patch.title = String(req.body.title).slice(0, 200);
  if (req.body?.blocks != null) patch.blocks = JSON.stringify(req.body.blocks);
  await db('documents').where({ id: doc.id }).update(patch);
  res.json({ ok: true });
});

// ---- share links: a token makes the doc publicly readable (view only) ----
docsRouter.post('/:id/share', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:share'))) {
    return res.status(403).json({ error: 'You need the share permission for this document' });
  }
  let token = doc.share_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    await db('documents').where({ id: doc.id }).update({ share_token: token });
    await audit(req.user!.id, 'doc.share', `doc:${doc.id}`);
  }
  res.json({ share_token: token });
});

docsRouter.delete('/:id/share', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:share'))) {
    return res.status(403).json({ error: 'You need the share permission for this document' });
  }
  if (doc.share_token) {
    await db('documents').where({ id: doc.id }).update({ share_token: null });
    await audit(req.user!.id, 'doc.unshare', `doc:${doc.id}`);
  }
  res.json({ ok: true });
});

docsRouter.delete('/:id', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:delete'))) return res.status(403).json({ error: 'No delete access' });
  await db('documents').where({ id: doc.id }).delete();
  await audit(req.user!.id, 'doc.delete', `doc:${doc.id}`);
  res.json({ ok: true });
});
