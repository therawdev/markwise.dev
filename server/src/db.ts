import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://markwise:markwise_dev@localhost:5432/markwise',
  pool: { min: 0, max: 10 },
});

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db('settings').where({ key }).first();
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db('settings')
    .insert({ key, value: JSON.stringify(value) })
    .onConflict('key')
    .merge({ value: JSON.stringify(value) });
}

export async function audit(actorId: number | null, action: string, target: string, detail: Record<string, unknown> = {}) {
  await db('audit_logs').insert({ actor_id: actorId, action, target, detail: JSON.stringify(detail) });
}
