import { mkdir, writeFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { existsSync } from 'fs';

const UPLOADS_DIR = join(__dirname, '../../uploads');

export async function saveLocalFile(key: string, body: Buffer): Promise<string> {
  const safeKey = basename(key);
  const dest = join(UPLOADS_DIR, safeKey);
  const dir = dirname(dest);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(dest, new Uint8Array(body));
  return `/api/files/local/${key}`;
}

export function localFilePath(key: string): string {
  const safeKey = basename(key);
  return join(UPLOADS_DIR, safeKey);
}

export { UPLOADS_DIR };
