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

  console.log('Migrations complete.');
  await db.destroy();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
