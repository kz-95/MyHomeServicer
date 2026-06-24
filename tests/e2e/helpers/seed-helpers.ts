// tests/e2e/helpers/seed-helpers.ts
import { execSync } from 'child_process';
import { join } from 'path';

const BACKEND_DIR = join(__dirname, '..', '..', '..', 'backend');

export async function resetTestDB(): Promise<void> {
  execSync('npm run db:reset', {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  execSync('npm run seed:test', {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}
