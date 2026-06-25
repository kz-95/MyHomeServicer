#!/usr/bin/env node
// Fails if any tracked *.json / *.ts file starts with a UTF-8 BOM (EF BB BF).
//
// A BOM on package.json crashes Node's JSON.parse ("Unexpected token") and the
// backend will not boot. PowerShell's default Set-Content / Out-File writes a BOM,
// so bulk file rewrites (e.g. the em-dash replace pass) silently corrupt JSON.
// Run via `npm run check:bom` from the repo root.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

let files = [];
try {
  files = execSync('git ls-files "*.json" "*.ts"', { encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
} catch (err) {
  console.error('check:bom - could not list tracked files:', err.message);
  process.exit(2);
}

const offenders = [];
for (const f of files) {
  try {
    const head = readFileSync(f).subarray(0, 3);
    if (head.equals(BOM)) offenders.push(f);
  } catch {
    // unreadable / deleted-but-tracked - skip
  }
}

if (offenders.length) {
  console.error(`check:bom FAILED - ${offenders.length} file(s) start with a UTF-8 BOM:`);
  for (const f of offenders) console.error('  ' + f);
  console.error('\nStrip with:  sed -i \'1s/^\\xEF\\xBB\\xBF//\' <file>');
  process.exit(1);
}

console.log(`check:bom OK - ${files.length} tracked json/ts files, no BOM.`);
