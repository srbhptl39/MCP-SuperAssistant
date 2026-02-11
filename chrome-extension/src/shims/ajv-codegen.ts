// CSP-safe stub for Ajv internal codegen helpers.
//
// Some packages (notably ajv-formats) import `ajv/dist/compile/codegen` and expect
// helpers like `operators`, `str`, `_`, `or`, and `KeywordCxt` to exist.
//
// In MV3 service workers we must avoid Ajv's real codegen (it can use `new Function()`).
// This module provides just enough surface area to prevent crashes during module init.

export const operators = {
  LT: '<',
  LTE: '<=',
  GT: '>',
  GTE: '>=',
  EQ: '===',
  NEQ: '!==',
} as const;

function interpolate(strings: TemplateStringsArray, exprs: unknown[]): string {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i] ?? '';
    if (i < exprs.length) out += String(exprs[i]);
  }
  return out;
}

// Ajv's codegen exports `_` and `str` as tagged-template helpers. We return plain strings.
export function _(strings: TemplateStringsArray, ...exprs: unknown[]): string {
  return interpolate(strings, exprs);
}

export function str(strings: TemplateStringsArray, ...exprs: unknown[]): string {
  return interpolate(strings, exprs);
}

export function or(...parts: unknown[]): string {
  return parts.map((p) => String(p)).join(' || ');
}

export function and(...parts: unknown[]): string {
  return parts.map((p) => String(p)).join(' && ');
}

export function getProperty(prop: unknown): string {
  if (typeof prop === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prop)) return `.${prop}`;
  const safe = String(prop).replace(/[\\'\n\r\u2028\u2029]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case "'":
        return "\\'";
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return ch;
    }
  });
  return `['${safe}']`;
}

// Minimal KeywordCxt shape used by ajv-formats at runtime.
export class KeywordCxt {
  public $data = false;
  public schemaCode: string = '""';
  public schema: unknown = undefined;

  constructor(_it: unknown, _def: unknown, _keyword: string) {}
}
