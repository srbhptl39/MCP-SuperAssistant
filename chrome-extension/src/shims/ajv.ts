// MV3 service workers forbid Ajv's dynamic Function() code generation.
// Interpret JSON Schema without eval, preserving real validation and errors.
import { Validator } from '@cfworker/json-schema';

type Schema = Record<string, unknown> | boolean;
type ErrorObject = {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message: string;
};
type ValidateFunction = ((data: unknown) => boolean) & {
  errors: ErrorObject[] | null;
};

export class Name {
  public str: string;
  constructor(s: unknown) { this.str = String(s); }
  toString() { return this.str; }
}

export default class Ajv {
  errors: ErrorObject[] | null = null;
  private readonly schemas = new Map<string, Schema>();
  constructor(_options?: unknown) {}

  addSchema(schema: Schema, key?: string): this {
    const id = key || (typeof schema === 'object' && schema !== null
      ? String(schema.$id || schema.id || '')
      : '');
    if (!id) throw new Error('Ajv shim requires an identifier for added schemas');
    this.schemas.set(id, schema);
    return this;
  }

  addKeyword(keyword: string): never {
    throw new Error(`Unsupported dynamic Ajv keyword: ${keyword}`);
  }

  addFormat(name: string): never {
    throw new Error(`Unsupported dynamic Ajv format: ${name}`);
  }

  compile(schema: Schema | string): ValidateFunction {
    const target = typeof schema === 'string' ? this.schemas.get(schema) : schema;
    if (target === undefined) {
      throw new Error('Ajv shim cannot compile an unknown schema identifier');
    }
    const validator = new Validator(target, '7', false);
    for (const [id, registered] of this.schemas) {
      if (typeof registered === 'object' && registered !== null) {
        validator.addSchema(registered, id);
      }
    }
    const check = ((data: unknown): boolean => {
      try {
        const result = validator.validate(data);
        check.errors = result.valid ? null : result.errors.map(error => ({
          instancePath: error.instanceLocation,
          schemaPath: error.keywordLocation,
          keyword: error.keyword,
          params: {},
          message: error.error,
        }));
        this.errors = check.errors;
        return result.valid;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'schema validation failed';
        check.errors = [{
          instancePath: '',
          schemaPath: '#',
          keyword: 'validation',
          params: {},
          message,
        }];
        this.errors = check.errors;
        return false;
      }
    }) as ValidateFunction;
    check.errors = null;
    return check;
  }

  validate(schema: Schema | string, data: unknown): boolean {
    return this.compile(schema)(data);
  }
}
// Retained for import compatibility only; no code is generated or evaluated.
export const _ = () => '';
export const str = () => '';
export const nil = {};
export const CodeGen = {};
