import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, canAccessDoc, hasPermission } from '../middleware.js';

export const docsRouter = Router();
docsRouter.use(requireAuth);

// ---- list: my personal docs + docs of companies where I can view ----
// Excludes soft-deleted docs (deleted_at IS NOT NULL).
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
    .whereNull('documents.deleted_at')
    .orderBy('documents.updated_at', 'desc')
    .select(
      'documents.id',
      'documents.title',
      'documents.company_id',
      'documents.owner_id',
      'documents.updated_at',
      'documents.starred',
      'companies.name as company_name',
      'users.name as owner_name'
    );
  res.json(docs);
});

// ---- trash: soft-deleted docs visible to the caller ----
docsRouter.get('/trash', async (req, res) => {
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
    .where((q) => {
      q.where('documents.owner_id', req.user!.id);
      if (viewableCompanyIds.length) q.orWhereIn('documents.company_id', viewableCompanyIds);
    })
    .whereNotNull('documents.deleted_at')
    .orderBy('documents.deleted_at', 'desc')
    .select(
      'documents.id',
      'documents.title',
      'documents.company_id',
      'documents.owner_id',
      'documents.updated_at',
      'documents.deleted_at',
      'companies.name as company_name'
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

// ---- docs shared with me by email (view-only) — must precede '/:id' ----
docsRouter.get('/shared-with-me', async (req, res) => {
  const docs = await db('doc_shares')
    .join('documents', 'documents.id', 'doc_shares.document_id')
    .leftJoin('users', 'users.id', 'documents.owner_id')
    .whereRaw('lower(doc_shares.email) = ?', req.user!.email.toLowerCase())
    .whereNull('documents.deleted_at')
    .orderBy('documents.updated_at', 'desc')
    .select(
      'documents.id',
      'documents.title',
      'documents.updated_at',
      'users.name as owner_name',
      'users.email as owner_email'
    );
  res.json(docs);
});

docsRouter.get('/:id', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:view'))) return res.status(403).json({ error: 'No access' });
  res.json({ ...doc, blocks: typeof doc.blocks === 'string' ? JSON.parse(doc.blocks) : doc.blocks });
});

// ---- read-only view payload for the authenticated viewer (/doc/:id) ----
docsRouter.get('/:id/view', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc || doc.deleted_at) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:view'))) return res.status(403).json({ error: 'No access' });
  res.json({
    title: doc.title,
    blocks: typeof doc.blocks === 'string' ? JSON.parse(doc.blocks) : doc.blocks,
    updated_at: doc.updated_at,
  });
});

// ---- update: accepts {title}, {blocks}, {starred}, or any combination ----
docsRouter.put('/:id', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:edit'))) return res.status(403).json({ error: 'No edit access' });

  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (req.body?.title != null) patch.title = String(req.body.title).slice(0, 200);
  if (req.body?.blocks != null) patch.blocks = JSON.stringify(req.body.blocks);
  if (req.body?.starred != null) patch.starred = Boolean(req.body.starred);
  await db('documents').where({ id: doc.id }).update(patch);

  if (req.body?.title != null) {
    await audit(req.user!.id, 'doc.update', `doc:${doc.id}`, { title: String(req.body.title).slice(0, 200) });
  }

  res.json({ ok: true });
});

// ---- duplicate ----
docsRouter.post('/:id/duplicate', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:view'))) return res.status(403).json({ error: 'No access' });

  const companyId: number | null = doc.company_id ?? null;
  if (companyId != null && !(await hasPermission(req.user!, companyId, 'doc:create'))) {
    return res.status(403).json({ error: 'You need the create-documents permission in this workspace' });
  }

  const [copy] = await db('documents')
    .insert({
      title: (String(doc.title || 'Untitled').slice(0, 193) + ' (copy)').slice(0, 200),
      blocks: doc.blocks,
      owner_id: req.user!.id,
      company_id: companyId,
    })
    .returning('*');
  await audit(req.user!.id, 'doc.create', `doc:${copy.id}`, { duplicate_of: doc.id });
  res.json(copy);
});

// ---- restore from trash ----
docsRouter.post('/:id/restore', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!doc.deleted_at) return res.status(400).json({ error: 'Document is not in the trash' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:delete'))) return res.status(403).json({ error: 'No access' });

  await db('documents').where({ id: doc.id }).update({ deleted_at: null });
  await audit(req.user!.id, 'doc.restore', `doc:${doc.id}`, { title: doc.title });
  res.json({ ok: true });
});

// ---- hard delete (purge from trash) ----
docsRouter.delete('/:id/purge', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!doc.deleted_at) return res.status(400).json({ error: 'Document must be in the trash first' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:delete'))) return res.status(403).json({ error: 'No access' });

  await db('documents').where({ id: doc.id }).delete();
  await audit(req.user!.id, 'doc.purge', `doc:${doc.id}`, { title: doc.title });
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

// ---- per-email shares: grant specific people view-only access ----
docsRouter.get('/:id/shares', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:share'))) {
    return res.status(403).json({ error: 'You need the share permission for this document' });
  }
  const shares = await db('doc_shares').where({ document_id: doc.id }).orderBy('id', 'desc').select('id', 'email');
  res.json(shares);
});

docsRouter.post('/:id/shares', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:share'))) {
    return res.status(403).json({ error: 'You need the share permission for this document' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
  const owner = await db('users').where({ id: doc.owner_id }).first();
  if (owner && owner.email.toLowerCase() === email) return res.status(400).json({ error: 'That person already owns this document' });

  const existing = await db('doc_shares').whereRaw('document_id = ? and lower(email) = ?', [doc.id, email]).first();
  if (existing) return res.status(409).json({ error: 'Already shared with this email' });

  const [row] = await db('doc_shares').insert({ document_id: doc.id, email, created_by: req.user!.id }).returning(['id', 'email']);
  // Notify the recipient if they already have an account.
  const recipient = await db('users').whereRaw('lower(email) = ?', email).first();
  await audit(req.user!.id, 'doc.share_email', recipient ? `user:${recipient.id}` : `doc:${doc.id}`, { doc: doc.title, email });
  res.json(typeof row === 'object' ? row : { id: row, email });
});

docsRouter.delete('/:id/shares/:shareId', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:share'))) {
    return res.status(403).json({ error: 'You need the share permission for this document' });
  }
  await db('doc_shares').where({ id: Number(req.params.shareId), document_id: doc.id }).delete();
  res.json({ ok: true });
});

// ---- soft delete ----
docsRouter.delete('/:id', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:delete'))) return res.status(403).json({ error: 'No delete access' });
  await db('documents').where({ id: doc.id }).update({ deleted_at: db.fn.now() });
  await audit(req.user!.id, 'doc.delete', `doc:${doc.id}`, { title: doc.title });
  res.json({ ok: true });
});
