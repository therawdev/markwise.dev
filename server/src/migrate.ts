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

  // Full AI request log — prompt, response, provider/model, status, latency. Stored
  // in full (no retention window) so the app admin can review and improve prompts.
  // One row per provider attempt (failovers included).
  if (!(await has('ai_requests'))) {
    await db.schema.createTable('ai_requests', (t) => {
      t.increments('id');
      t.integer('user_id').references('users.id').onDelete('SET NULL');
      t.integer('company_id').references('companies.id').onDelete('SET NULL');
      t.string('provider').notNullable();
      t.string('model');
      t.string('status').notNullable(); // 'ok' | 'error'
      t.boolean('failover').notNullable().defaultTo(false);
      t.integer('latency_ms');
      t.integer('input_tokens');
      t.integer('output_tokens');
      t.text('prompt');
      t.text('response');
      t.text('error');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.index(['created_at']);
    });
  }

  // AI credits — a "credit" is one successful AI generation in the current month.
  // Per-company monthly pool override (null = plan default from quota.ts) that the
  // app owner can top up. Per-org behaviour when a limit is hit ('block' refuses &
  // tells the user; 'fallback' silently uses the offline parser; null = global
  // default). org_can_set_limit_behavior lets the app owner delegate that choice to
  // the org owner. Per-member monthly cap (null = no personal cap; draws the pool).
  if (!(await db.schema.hasColumn('companies', 'ai_credit_limit'))) {
    await db.schema.alterTable('companies', (t) => { t.integer('ai_credit_limit'); });
  }
  if (!(await db.schema.hasColumn('companies', 'ai_limit_behavior'))) {
    await db.schema.alterTable('companies', (t) => { t.string('ai_limit_behavior'); });
  }
  if (!(await db.schema.hasColumn('companies', 'org_can_set_limit_behavior'))) {
    await db.schema.alterTable('companies', (t) => { t.boolean('org_can_set_limit_behavior').notNullable().defaultTo(false); });
  }
  if (!(await db.schema.hasColumn('memberships', 'ai_credit_limit'))) {
    await db.schema.alterTable('memberships', (t) => { t.integer('ai_credit_limit'); });
  }

  // Email-domain auto-join: a signup whose email domain matches a company's
  // email_domains is added to that company as a *pending* member, and can't sign in
  // (password or SSO) until an owner approves. status: 'active' | 'pending'.
  if (!(await db.schema.hasColumn('companies', 'email_domains'))) {
    await db.schema.alterTable('companies', (t) => { t.jsonb('email_domains').notNullable().defaultTo('[]'); });
  }
  if (!(await db.schema.hasColumn('memberships', 'status'))) {
    await db.schema.alterTable('memberships', (t) => { t.string('status').notNullable().defaultTo('active'); });
  }

  // Projects: a named folder that groups documents inside a company.
  if (!(await has('projects'))) {
    await db.schema.createTable('projects', (t) => {
      t.increments('id');
      t.integer('company_id').notNullable().references('companies.id').onDelete('CASCADE');
      t.string('name').notNullable();
      t.integer('created_by').references('users.id').onDelete('SET NULL');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.index(['company_id']);
    });
  }
  if (!(await db.schema.hasColumn('documents', 'project_id'))) {
    await db.schema.alterTable('documents', (t) => {
      t.integer('project_id').references('projects.id').onDelete('SET NULL'); // null = no project
    });
  }

  // SSO: JIT-provisioned users have no password, so password_hash must be nullable.
  // (Postgres ALTER ... DROP NOT NULL is idempotent in practice; guard via info schema.)
  const pwCol = await db('information_schema.columns')
    .where({ table_name: 'users', column_name: 'password_hash' })
    .first('is_nullable');
  if (pwCol && pwCol.is_nullable === 'NO') {
    await db.schema.alterTable('users', (t) => { t.string('password_hash').nullable().alter(); });
  }

  // Per-company OIDC single sign-on. client_secret is AES-256-GCM encrypted
  // (secrets.ts). allowed_domains lets the login page route a matching email to
  // this company's IdP. default_role_id is the role JIT-provisioned members get.
  // enforced (future) will disable password login for matching domains.
  if (!(await has('sso_connections'))) {
    await db.schema.createTable('sso_connections', (t) => {
      t.increments('id');
      t.integer('company_id').notNullable().unique().references('companies.id').onDelete('CASCADE');
      t.string('type').notNullable().defaultTo('oidc'); // oidc (saml later)
      t.string('issuer').notNullable();        // e.g. https://accounts.google.com
      t.string('client_id').notNullable();
      t.text('client_secret_enc');             // encrypted; null for public/PKCE-only clients
      t.jsonb('allowed_domains').notNullable().defaultTo('[]'); // lowercased email domains
      t.integer('default_role_id').references('roles.id').onDelete('SET NULL');
      t.boolean('enabled').notNullable().defaultTo(false);
      t.boolean('enforced').notNullable().defaultTo(false);
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }

  // How a user account was created / can authenticate. 'password' (default) or
  // 'sso'. Used to tailor the login error when an SSO-only user tries a password.
  if (!(await db.schema.hasColumn('users', 'auth_provider'))) {
    await db.schema.alterTable('users', (t) => { t.string('auth_provider').notNullable().defaultTo('password'); });
  }

  // App-owner gate: a company can only use SSO once the platform admin allows it.
  if (!(await db.schema.hasColumn('companies', 'sso_allowed'))) {
    await db.schema.alterTable('companies', (t) => { t.boolean('sso_allowed').notNullable().defaultTo(false); });
  }

  // Org owners can require all password members to use 2FA.
  if (!(await db.schema.hasColumn('companies', 'mfa_required'))) {
    await db.schema.alterTable('companies', (t) => { t.boolean('mfa_required').notNullable().defaultTo(false); });
  }

  // TOTP multi-factor auth for password accounts (SSO accounts defer to the IdP).
  // Secret + recovery codes are AES-256-GCM encrypted (secrets.ts).
  if (!(await db.schema.hasColumn('users', 'mfa_enabled'))) {
    await db.schema.alterTable('users', (t) => { t.boolean('mfa_enabled').notNullable().defaultTo(false); });
  }
  if (!(await db.schema.hasColumn('users', 'mfa_secret_enc'))) {
    await db.schema.alterTable('users', (t) => { t.text('mfa_secret_enc'); });
  }
  if (!(await db.schema.hasColumn('users', 'mfa_recovery_enc'))) {
    await db.schema.alterTable('users', (t) => { t.text('mfa_recovery_enc'); });
  }

  // Login lockout: consecutive password failures and a cooldown timestamp.
  if (!(await db.schema.hasColumn('users', 'failed_logins'))) {
    await db.schema.alterTable('users', (t) => { t.integer('failed_logins').notNullable().defaultTo(0); });
  }
  if (!(await db.schema.hasColumn('users', 'locked_until'))) {
    await db.schema.alterTable('users', (t) => { t.timestamp('locked_until'); });
  }

  // Server-tracked sessions (so they can be listed and revoked). The auth cookie's
  // JWT carries the session id (sid); requireAuth checks the row still exists.
  if (!(await has('sessions'))) {
    await db.schema.createTable('sessions', (t) => {
      t.string('id').primary(); // random sid embedded in the JWT
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.integer('impersonated_by').references('users.id').onDelete('CASCADE');
      t.string('user_agent', 300);
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('last_seen').defaultTo(db.fn.now());
      t.index(['user_id']);
    });
  }

  // Backfill: the immutable Owner role gets the full (now-larger) permission set;
  // every role that can edit documents should also be able to comment; and every
  // role that can create documents should also be able to manage projects (so org
  // members — not just owners — can create projects).
  const { ALL_PERMISSIONS } = await import('./permissions.js');
  const roles = await db('roles').select('id', 'name', 'is_system', 'permissions');
  for (const r of roles) {
    const perms: string[] = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions || [];
    if (r.is_system && r.name === 'Owner') {
      // Keep Owner exactly equal to the full catalog as it grows. Write unconditionally
      // (idempotent JSON) so a same-count catalog change — e.g. a renamed key — can't be
      // missed by a length/content guard.
      await db('roles').where({ id: r.id }).update({ permissions: JSON.stringify([...ALL_PERMISSIONS]) });
      continue;
    }
    // The additive backfill only ever grows the set, so a length change is an exact proxy.
    const next = [...perms];
    if (next.includes('doc:edit') && !next.includes('doc:comment')) next.push('doc:comment');
    if (next.includes('doc:create') && !next.includes('project:manage')) next.push('project:manage');
    if (next.length !== perms.length) {
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
