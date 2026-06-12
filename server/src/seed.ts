import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

async function seed() {
  const email = (process.env.APP_OWNER_EMAIL || 'admin@markwise.dev').toLowerCase();
  const existing = await db('users').where({ email }).first();
  if (existing) {
    if (!existing.is_app_owner) await db('users').where({ id: existing.id }).update({ is_app_owner: true });
    console.log(`App owner already exists: ${email}`);
  } else {
    const password = process.env.APP_OWNER_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await db('users').insert({
      email,
      password_hash: await bcrypt.hash(password, 10),
      name: 'App Owner',
      is_app_owner: true,
    });
    console.log('App owner created:');
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
    console.log('Store this password — it is not shown again.');
  }
  await db.destroy();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
