import { db } from './db.js';

async function migrate() {
  const has = (t: string) => db.schema.hasTable(t);

  if (!(await has('users'))) {
    await db.schema.createTable('users', (t) => {
      t.increments('id');
      t.string('email').notNullable().unique();
      t.string('password_hash').notNullable();
      t.string('name').notNullable();
      t.boolean('is_app_owner').notNullable().defaultTo(false);
      t.string('status').notNullable().defaultTo('active'); // active | suspended
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  if (!(await has('companies'))) {
    await db.schema.createTable('companies', (t) => {
      t.increments('id');
      t.string('name').notNullable();
      t.string('slug').notNullable().unique();
      t.string('plan').notNullable().defaultTo('free');
      t.string('status').notNullable().defaultTo('active');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  if (!(await has('roles'))) {
    await db.schema.createTable('roles', (t) => {
      t.increments('id');
      t.integer('company_id').notNullable().references('companies.id').onDelete('CASCADE');
      t.string('name').notNullable();
      t.boolean('is_system').notNullable().defaultTo(false);
      t.jsonb('permissions').notNullable().defaultTo('[]');
      t.unique(['company_id', 'name']);
    });
  }

  if (!(await has('memberships'))) {
    await db.schema.createTable('memberships', (t) => {
      t.increments('id');
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.integer('company_id').notNullable().references('companies.id').onDelete('CASCADE');
      t.integer('role_id').notNullable().references('roles.id');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.unique(['user_id', 'company_id']);
    });
  }

  if (!(await has('invites'))) {
    await db.schema.createTable('invites', (t) => {
      t.increments('id');
      t.integer('company_id').notNullable().references('companies.id').onDelete('CASCADE');
      t.integer('role_id').notNullable().references('roles.id');
      t.string('token').notNullable().unique();
      t.integer('created_by').notNullable().references('users.id');
      t.integer('used_by').references('users.id');
      t.timestamp('expires_at').notNullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  if (!(await has('documents'))) {
    await db.schema.createTable('documents', (t) => {
      t.increments('id');
      t.string('title').notNullable().defaultTo('Untitled');
      t.jsonb('blocks').notNullable().defaultTo('[]');
      t.integer('owner_id').notNullable().references('users.id').onDelete('CASCADE');
      t.integer('company_id').references('companies.id').onDelete('CASCADE'); // null = personal doc
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }

  // Public share links: a non-null token makes the doc readable at /share.html?t=<token>
  if (!(await db.schema.hasColumn('documents', 'share_token'))) {
    await db.schema.alterTable('documents', (t) => {
      t.string('share_token').unique();
    });
  }

  // Saved presentation/deck per document (theme, slide order, per-slide overrides, edited text,
  // AI-condensed bullets, and a source-content signature) so reopening Present restores instantly
  // instead of regenerating. null = no deck built yet.
  if (!(await db.schema.hasColumn('documents', 'deck'))) {
    await db.schema.alterTable('documents', (t) => {
      t.jsonb('deck');
    });
  }

  if (!(await has('audit_logs'))) {
    await db.schema.createTable('audit_logs', (t) => {
      t.increments('id');
      t.integer('actor_id').references('users.id').onDelete('SET NULL');
      t.string('action').notNullable();
      t.string('target').notNullable();
      t.jsonb('detail').notNullable().defaultTo('{}');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  if (!(await has('settings'))) {
    await db.schema.createTable('settings', (t) => {
      t.string('key').primary();
      t.jsonb('value').notNullable();
    });
  }

  if (!(await has('ai_usage'))) {
    await db.schema.createTable('ai_usage', (t) => {
      t.increments('id');
      t.integer('user_id').references('users.id').onDelete('SET NULL');
      t.integer('company_id').references('companies.id').onDelete('SET NULL');
      t.string('provider').notNullable();
      t.string('kind').notNullable(); // complete
      t.boolean('ok').notNullable().defaultTo(true);
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  // Notification bell: events newer than this timestamp count as unread
  if (!(await db.schema.hasColumn('users', 'notif_seen_at'))) {
    await db.schema.alterTable('users', (t) => {
      t.timestamp('notif_seen_at');
    });
  }

  // Starred flag for documents
  if (!(await db.schema.hasColumn('documents', 'starred'))) {
    await db.schema.alterTable('documents', (t) => {
      t.boolean('starred').notNullable().defaultTo(false);
    });
  }

  // Soft-delete support for documents (null = live, non-null = in trash)
  if (!(await db.schema.hasColumn('documents', 'deleted_at'))) {
    await db.schema.alterTable('documents', (t) => {
      t.timestamp('deleted_at');
    });
  }

  // API keys for programmatic access
  if (!(await has('api_keys'))) {
    await db.schema.createTable('api_keys', (t) => {
      t.increments('id');
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.string('token').notNullable().unique();
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  // Per-email document shares (view-only access for specific people)
  if (!(await has('doc_shares'))) {
    await db.schema.createTable('doc_shares', (t) => {
      t.increments('id');
      t.integer('document_id').notNullable().references('documents.id').onDelete('CASCADE');
      t.string('email').notNullable(); // lowercased recipient email
      t.integer('created_by').references('users.id').onDelete('SET NULL');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.unique(['document_id', 'email']);
    });
  }

  // Comments: anchored threads on a document. A top-level comment carries an
  // anchor (the block ids it spans + the quoted text) and a `cid` matching the
  // <mark data-cid> wrapper in the document HTML. Replies set parent_id and
  // inherit the thread's anchor. resolved applies to the top-level comment.
  if (!(await has('comments'))) {
    await db.schema.createTable('comments', (t) => {
      t.increments('id');
      t.integer('document_id').notNullable().references('documents.id').onDelete('CASCADE');
      t.integer('parent_id').references('comments.id').onDelete('CASCADE'); // null = top-level
      t.string('cid'); // DOM anchor id (top-level only)
      t.integer('author_id').references('users.id').onDelete('SET NULL');
      t.jsonb('anchor').notNullable().defaultTo('{}'); // { blockIds:[], quote:'' }
      t.text('body').notNullable();
      t.boolean('resolved').notNullable().defaultTo(false);
      t.integer('resolved_by').references('users.id').onDelete('SET NULL');
      t.timestamp('resolved_at');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.index(['document_id']);
    });
  }

  // Presence: who is currently in a document, and which block they are editing
  // (a soft lock — advisory, not enforced). Stale rows are ignored by last_seen.
  if (!(await has('doc_presence'))) {
    await db.schema.createTable('doc_presence', (t) => {
      t.increments('id');
      t.integer('document_id').notNullable().references('documents.id').onDelete('CASCADE');
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.string('editing_block'); // block id currently focused, or null
      t.timestamp('last_seen').defaultTo(db.fn.now());
      t.unique(['document_id', 'user_id']);
    });
  }

  // Per-provider AI config (key / model / enabled), managed from the admin UI
  // instead of env vars. company_id = null is the platform default; a row with a
  // company_id is that company's bring-your-own-key override. API keys are stored
  // AES-256-GCM encrypted (see secrets.ts) in api_key_enc.
  if (!(await has('provider_configs'))) {
    await db.schema.createTable('provider_configs', (t) => {
      t.increments('id');
      t.integer('company_id').references('companies.id').onDelete('CASCADE'); // null = global/platform
      t.string('provider').notNullable();
      t.boolean('enabled').notNullable().defaultTo(true);
      t.text('api_key_enc'); // AES-256-GCM encrypted; null = no stored key
      t.string('model');
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.unique(['company_id', 'provider']);
    });
  }

  // Backfill: every role that can edit documents should also be able to comment,
  // and the immutable Owner role gets the full (now-larger) permission set.
  const roles = await db('roles').select('id', 'name', 'is_system', 'permissions');
  for (const r of roles) {
    const perms: string[] = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions || [];
    let next = perms;
    if (r.is_system && r.name === 'Owner') {
      // keep Owner all-powerful as the catalog grows
      const { ALL_PERMISSIONS } = await import('./permissions.js');
      next = [...ALL_PERMISSIONS];
    } else if (perms.includes('doc:edit') && !perms.includes('doc:comment')) {
      next = [...perms, 'doc:comment'];
    }
    if (next !== perms) {
      await db('roles').where({ id: r.id }).update({ permissions: JSON.stringify(next) });
    }
  }

  console.log('Migrations complete.');
  await db.destroy();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
