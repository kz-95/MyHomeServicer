/* eslint-disable */
/**
 * Structural validator. Runs without installed dependencies — useful in
 * environments where the npm registry is unavailable. Checks:
 *  1. Prisma schema: brace balance, every field type resolves to a known
 *     scalar / model / enum, every @relation `fields:` references a real
 *     scalar field, and every relation has a declared back-relation.
 *  2. TypeScript sources: every relative import path resolves to a file.
 *
 * Exit code 0 = clean, 1 = problems found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = [];
let warnings = [];

// ── Prisma schema check ──────────────────────────────────────────────────────
const SCALARS = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes',
]);

function checkPrisma() {
  const file = path.join(ROOT, 'prisma', 'schema.prisma');
  if (!fs.existsSync(file)) {
    errors.push('prisma/schema.prisma not found');
    return;
  }
  const text = fs.readFileSync(file, 'utf8');

  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;
  if (opens !== closes) errors.push(`schema.prisma brace mismatch: ${opens} { vs ${closes} }`);

  const models = {};
  const enums = new Set();
  let current = null;
  let kind = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^model\s+(\w+)\s*{/))) {
      current = m[1];
      kind = 'model';
      models[current] = { fields: {}, relations: [] };
      continue;
    }
    if ((m = line.match(/^enum\s+(\w+)\s*{/))) {
      enums.add(m[1]);
      kind = 'enum';
      current = m[1];
      continue;
    }
    if (line === '}') {
      current = null;
      kind = null;
      continue;
    }
    if (!current || kind !== 'model') continue;
    if (line.startsWith('//') || line.startsWith('@@') || line === '') continue;
    const fm = line.match(/^(\w+)\s+([A-Za-z0-9_]+)(\[\])?(\?)?/);
    if (!fm) continue;
    const [, fname, ftype] = fm;
    models[current].fields[fname] = ftype;
    if (line.includes('@relation') || (!SCALARS.has(ftype) && /^[A-Z]/.test(ftype))) {
      models[current].relations.push({ field: fname, type: ftype, line });
    }
  }

  const typeNames = new Set([...Object.keys(models), ...enums]);

  for (const [model, def] of Object.entries(models)) {
    // every field type must resolve
    for (const [fname, ftype] of Object.entries(def.fields)) {
      if (!SCALARS.has(ftype) && !typeNames.has(ftype)) {
        errors.push(`${model}.${fname}: unknown type "${ftype}"`);
      }
    }
    // @relation fields:[...] must reference real scalar fields
    for (const rel of def.relations) {
      const fm = rel.line.match(/fields:\s*\[([^\]]+)\]/);
      if (fm) {
        for (const fk of fm[1].split(',').map((s) => s.trim())) {
          if (!(fk in def.fields)) {
            errors.push(`${model}.${rel.field}: @relation fields references missing scalar "${fk}"`);
          }
        }
      }
      // back-relation must exist on the target model
      if (models[rel.type]) {
        const hasBack = Object.values(models[rel.type].fields).includes(model);
        if (!hasBack) {
          errors.push(`${model}.${rel.field} -> ${rel.type}: no back-relation field of type ${model}`);
        }
      }
    }
  }
  console.log(`Prisma: ${Object.keys(models).length} models, ${enums.size} enums parsed.`);
}

// ── TypeScript import resolution check ───────────────────────────────────────
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

function resolves(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, base + '.ts', base + '.d.ts', path.join(base, 'index.ts')];
  return candidates.some((c) => fs.existsSync(c));
}

function checkTs() {
  const srcDir = path.join(ROOT, 'src');
  if (!fs.existsSync(srcDir)) {
    errors.push('src/ not found');
    return;
  }
  const files = walk(srcDir, []);
  const importRe = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let importCount = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(text))) {
      const spec = m[1] || m[2];
      if (!spec.startsWith('.')) continue;
      importCount++;
      if (!resolves(file, spec)) {
        errors.push(`${path.relative(ROOT, file)}: unresolved import "${spec}"`);
      }
    }
  }
  console.log(`TypeScript: ${files.length} files, ${importCount} relative imports checked.`);
}

checkPrisma();
checkTs();

console.log('');
if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log('  - ' + w));
}
if (errors.length) {
  console.log(`✗ ${errors.length} error(s):`);
  errors.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
console.log('✓ Structural validation passed.');
