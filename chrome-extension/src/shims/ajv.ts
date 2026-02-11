// src/shims/ajv.ts

export class Name {
  public str: string;

  constructor(s: unknown) {
    this.str = String(s);
  }

  toString() {
    return this.str;
  }
}

export default class Ajv {
  constructor(options?: any) {}

  // CRITICAL: Return 'this' to allow method chaining (e.g. ajv.addSchema().compile())
  addSchema(schema: any, key?: string) {
    return this;
  }
  addKeyword(keyword: string, definition?: any) {
    return this;
  }
  addFormat(name: string, format: any) {
    return this;
  }

  // The actual validator
  compile(schema: any) {
    // In development, warn that this CSP-safe shim bypasses real validation.
    if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.NODE_ENV === 'development'
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Ajv shim] Using CSP-compatible Ajv shim: all validations will always pass. ' +
          'This is intended for the Chrome extension environment and may mask schema errors.',
      );
    }
    // Return a function that always says "Valid" (true)
    return (data: any) => true;
  }

  // Direct validation
  validate(schema: any, data: any) {
    return true;
  }

  // Properties
  errors = null;
}

// Export dummy codegen helpers just in case something imports them.
export const _ = () => {};
export const str = () => {};
export const nil = {};
export const CodeGen = {};
