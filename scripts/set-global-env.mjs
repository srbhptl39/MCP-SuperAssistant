import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env');

const DEFAULTS = {
  CLI_CEB_DEV: 'false',
  CLI_CEB_FIREFOX: 'false',
};

function isBooleanString(value) {
  return value === 'true' || value === 'false';
}

function validateKey(key, editableSection) {
  if (!key || key.startsWith('#')) return;
  if (editableSection) {
    if (!key.startsWith('CEB_')) {
      throw new Error(`Invalid key: <${key}>. All keys in the editable section must start with 'CEB_'.`);
    }
    return;
  }
  if (!key.startsWith('CLI_CEB_')) {
    throw new Error(`Invalid key: <${key}>. All CLI keys must start with 'CLI_CEB_'.`);
  }
}

function parseArgs(argv) {
  const cliValues = { ...DEFAULTS };
  const extraCliValues = [];

  for (const arg of argv) {
    const idx = arg.indexOf('=');
    if (idx <= 0) continue;

    const key = arg.slice(0, idx);
    const value = arg.slice(idx + 1);

    validateKey(key, false);

    if (key === 'CLI_CEB_DEV' || key === 'CLI_CEB_FIREFOX') {
      if (!isBooleanString(value)) {
        throw new Error(`Invalid value for <${key}>. Please use 'true' or 'false'.`);
      }
      cliValues[key] = value;
    } else {
      extraCliValues.push(`${key}=${value}`);
    }
  }

  return { cliValues, extraCliValues };
}

function readEnvLines() {
  if (!fs.existsSync(envPath)) return [];
  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
}

function validateExistingEnv(lines) {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);

    if (key.startsWith('CLI_CEB_')) {
      validateKey(key, false);
    } else if (key.startsWith('CEB_')) {
      validateKey(key, true);
    }
    // allow all other keys (e.g. FIREBASE_*)
  }
}

function stripCliSection(lines) {
  const out = [];
  let skipCliSection = false;

  for (const line of lines) {
    if (line === '# THOSE VALUES ARE EDITABLE ONLY VIA CLI') {
      skipCliSection = true;
      continue;
    }
    if (line === '# THOSE VALUES ARE EDITABLE') {
      skipCliSection = false;
      continue;
    }
    if (skipCliSection) continue;
    if (/^CLI_CEB_/.test(line)) continue;
    out.push(line);
  }

  return out;
}

const { cliValues, extraCliValues } = parseArgs(process.argv.slice(2));
const existing = readEnvLines();
validateExistingEnv(existing);

const preserved = stripCliSection(existing);

const next = [
  '# THOSE VALUES ARE EDITABLE ONLY VIA CLI',
  `CLI_CEB_DEV=${cliValues.CLI_CEB_DEV}`,
  `CLI_CEB_FIREFOX=${cliValues.CLI_CEB_FIREFOX}`,
  ...extraCliValues,
  '',
  '# THOSE VALUES ARE EDITABLE',
  ...preserved,
].join('\n');

fs.writeFileSync(envPath, next, 'utf8');
