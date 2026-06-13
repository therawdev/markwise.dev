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
  const [updated] = await db('documents').where({ id: doc.id }).update(patch).returning('updated_at');

  if (req.body?.title != null) {
    await audit(req.user!.id, 'doc.update', `doc:${doc.id}`, { title: String(req.body.title).slice(0, 200) });
  }

  // updated_at lets collaborators detect this save and pull the change.
  res.json({ ok: true, updated_at: (updated && (updated as any).updated_at) || null });
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

// ===================== Comments (anchored threads) =====================

function normAnchor(a: any) {
  return {
    blockIds: Array.isArray(a?.blockIds) ? a.blockIds.map((x: unknown) => String(x)).slice(0, 50) : [],
    quote: String(a?.quote || '').slice(0, 300),
  };
}

// ---- list every comment (threads + replies) on a document ----
docsRouter.get('/:id/comments', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:view'))) return res.status(403).json({ error: 'No access' });
  const rows = await db('comments')
    .leftJoin('users', 'users.id', 'comments.author_id')
    .where('comments.document_id', doc.id)
    .orderBy('comments.id', 'asc')
    .select('comments.*', 'users.name as author_name', 'users.email as author_email');
  res.json(rows.map((r) => ({ ...r, anchor: typeof r.anchor === 'string' ? JSON.parse(r.anchor) : r.anchor })));
});

// ---- create a top-level comment (with anchor + cid) or a reply (parent_id) ----
docsRouter.post('/:id/comments', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:comment'))) {
    return res.status(403).json({ error: 'You need comment access on this document' });
  }
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Comment is empty' });

  const parentId = req.body?.parent_id ? Number(req.body.parent_id) : null;
  let cid: string | null = null;
  let anchor = { blockIds: [] as string[], quote: '' };
  if (parentId) {
    const parent = await db('comments').where({ id: parentId, document_id: doc.id }).first();
    if (!parent) return res.status(404).json({ error: 'Thread not found' });
  } else {
    cid = req.body?.cid ? String(req.body.cid).slice(0, 40) : null;
    anchor = normAnchor(req.body?.anchor);
  }

  const [row] = await db('comments')
    .insert({
      document_id: doc.id,
      parent_id: parentId,
      cid,
      author_id: req.user!.id,
      anchor: JSON.stringify(anchor),
      body,
    })
    .returning('*');

  // Notify: the doc owner, everyone already in the thread, and any @mentions —
  // never the author. These land in the existing bell via audit_logs.
  const mentionIds: number[] = Array.isArray(req.body?.mentions)
    ? req.body.mentions.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n))
    : [];
  const notify = new Set<number>();
  if (doc.owner_id !== req.user!.id) notify.add(doc.owner_id);
  if (parentId) {
    const participants = await db('comments')
      .where({ document_id: doc.id })
      .andWhere((q) => q.where('id', parentId).orWhere('parent_id', parentId))
      .select('author_id');
    participants.forEach((p) => p.author_id && notify.add(p.author_id));
  }
  mentionIds.forEach((m) => notify.add(m));
  notify.delete(req.user!.id);
  for (const uid of notify) {
    const action = mentionIds.includes(uid) ? 'doc.mention' : 'doc.comment';
    await audit(req.user!.id, action, `user:${uid}`, { doc: doc.title, doc_id: doc.id, snippet: body.slice(0, 100) });
  }

  res.json({
    ...row,
    anchor,
    author_name: req.user!.name,
    author_email: req.user!.email,
  });
});

// ---- resolve / reopen a thread (top-level comment) ----
docsRouter.post('/:id/comments/:commentId/resolve', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:comment'))) return res.status(403).json({ error: 'No access' });
  const reopen = req.body?.reopen === true;
  await db('comments')
    .where({ id: Number(req.params.commentId), document_id: doc.id })
    .whereNull('parent_id')
    .update(
      reopen
        ? { resolved: false, resolved_by: null, resolved_at: null, updated_at: db.fn.now() }
        : { resolved: true, resolved_by: req.user!.id, resolved_at: db.fn.now(), updated_at: db.fn.now() }
    );
  res.json({ ok: true });
});

// ---- delete a comment (author, doc owner, or someone who can delete the doc) ----
docsRouter.delete('/:id/comments/:commentId', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const comment = await db('comments').where({ id: Number(req.params.commentId), document_id: doc.id }).first();
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  const canDelete =
    comment.author_id === req.user!.id || (await canAccessDoc(req.user!, doc, 'doc:delete'));
  if (!canDelete) return res.status(403).json({ error: 'You can only delete your own comments' });
  await db('comments').where({ id: comment.id }).delete(); // replies cascade
  res.json({ ok: true, cid: comment.cid, parent_id: comment.parent_id });
});

// ===================== Presence (heartbeat + soft locks) =====================

// One call does both: record my heartbeat (and which block I'm editing) and
// return the other active editors + the doc's current updated_at for sync.
docsRouter.post('/:id/presence', async (req, res) => {
  const doc = await db('documents').where({ id: Number(req.params.id) }).first();
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!(await canAccessDoc(req.user!, doc, 'doc:view'))) return res.status(403).json({ error: 'No access' });

  const editingBlock = req.body?.editing_block ? String(req.body.editing_block).slice(0, 60) : null;
  await db('doc_presence')
    .insert({ document_id: doc.id, user_id: req.user!.id, editing_block: editingBlock, last_seen: db.fn.now() })
    .onConflict(['document_id', 'user_id'])
    .merge({ editing_block: editingBlock, last_seen: db.fn.now() });

  const cutoff = new Date(Date.now() - 15000); // active = seen in the last 15s
  const others = await db('doc_presence')
    .join('users', 'users.id', 'doc_presence.user_id')
    .where('doc_presence.document_id', doc.id)
    .andWhere('doc_presence.last_seen', '>', cutoff)
    .andWhereNot('doc_presence.user_id', req.user!.id)
    .select('users.id', 'users.name', 'users.email', 'doc_presence.editing_block');

  res.json({ users: others, doc: { updated_at: doc.updated_at } });
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
