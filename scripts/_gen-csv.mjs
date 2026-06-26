import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '..', 'backend', 'prisma', 'seed', 'data', 'accounts.ts'),
  'utf8'
);

const rows = [];

const arrStart = src.indexOf('export const servicers:');
let pos = arrStart;
while (true) {
  const refIdx = src.indexOf('ref:', pos);
  if (refIdx === -1) break;

  let open = refIdx;
  while (open >= 0 && src[open] !== '{') open--;
  if (open < 0) { pos = refIdx + 1; continue; }

  let depth = 1;
  let close = open + 1;
  while (close < src.length && depth > 0) {
    if (src[close] === '{') depth++;
    if (src[close] === '}') depth--;
    close++;
  }
  if (depth !== 0) break;

  const block = src.slice(open, close);
  pos = close;

  const refMatch = block.match(/ref:\s*'(M\d+)'/);
  const nameMatch = block.match(/businessName:\s*['"]([^'"]+)['"]/);
  const slugMatch = block.match(/categorySlug:\s*'([^']+)'/);
  if (!refMatch || !nameMatch || !slugMatch) continue;

  const svcTitles = [];
  const svcArrayMatch = block.match(/services:\s*\[([\s\S]*?)\]/);
  if (svcArrayMatch) {
    const titleRe = /title:\s*['"]([^'"]+)['"]/g;
    let t;
    while ((t = titleRe.exec(svcArrayMatch[1])) !== null) {
      svcTitles.push(t[1]);
    }
  }

  rows.push([refMatch[1], nameMatch[1], slugMatch[1], svcTitles.join('; ')]);
}

const q = (s) => '"' + s.replace(/"/g, '""') + '"';
const header = ['ref', 'name', 'category', 'type_of_service'].map(q).join(',');
const body = rows.map(r => r.map(q).join(',')).join('\r\n');
writeFileSync(join(__dirname, 'servicer_list.csv'), '\ufeff' + header + '\r\n' + body);
console.log('done: ' + rows.length + ' rows');
