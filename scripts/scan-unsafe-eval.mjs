import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
const targets = roots.length ? roots : ['dist'];

const needles = [
  { label: 'new Function', re: /\bnew\s+Function\b/ },
  { label: 'eval(', re: /\beval\s*\(/ },
  { label: 'unsafe-eval', re: /unsafe-eval/ },
];

const exts = new Set(['.js', '.mjs', '.cjs', '.html']);

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

let filesScanned = 0;
const hits = [];

for (const target of targets) {
  const abs = path.resolve(process.cwd(), target);
  if (!fs.existsSync(abs)) {
    continue;
  }

  const files = [];
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    walk(abs, files);
  } else {
    files.push(abs);
  }

  for (const file of files) {
    if (!exts.has(path.extname(file))) continue;

    const text = readText(file);
    if (text == null) continue;
    filesScanned++;

    for (const { label, re } of needles) {
      const match = re.exec(text);
      if (match) {
        hits.push({ file, label, index: match.index });
      }
    }
  }
}

if (hits.length) {
  console.error(`Unsafe-eval patterns detected (${hits.length}):`);
  for (const hit of hits) {
    console.error(`- ${hit.label}: ${hit.file}`);
  }
  process.exit(1);
}

console.log(`OK: no unsafe-eval patterns found (scanned ${filesScanned} files).`);
