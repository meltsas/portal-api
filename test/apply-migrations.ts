import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.portal_db, env.TEST_MIGRATIONS);
