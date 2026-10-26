import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from '../chrome-extension/src/shims/ajv.ts';

const schema = {
  type: 'object',
  required: ['name', 'options'],
  properties: {
    name: { type: 'string', minLength: 1 },
    options: {
      type: 'object', required: ['count'],
      properties: { count: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

test('accepts valid nested tool arguments', () => {
  const validate = new Ajv().compile(schema);
  assert.equal(validate({ name: 'search', options: { count: 2 } }), true);
  assert.equal(validate.errors, null);
});
test('rejects missing fields, wrong nested types, extra properties', () => {
  const validate = new Ajv().compile(schema);
  for (const invalid of [
    { name: 'search' },
    { name: 'search', options: { count: 'two' } },
    { name: 'search', options: { count: 2, unknown: true } },
    { name: 'search', options: { count: 2 }, unauthorized: true },
  ]) {
    assert.equal(validate(invalid), false, JSON.stringify(invalid));
    assert(validate.errors?.length, 'invalid payload must expose validation errors');
    assert(typeof validate.errors[0].keyword === 'string');
  }
});

test('supports unions and arrays without code generation', () => {
  const validate = new Ajv().compile({
    type: 'array',
    items: { anyOf: [{ type: 'integer' }, { type: 'string', enum: ['ok'] }] },
  });
  assert.equal(validate([1, 'ok']), true);
  assert.equal(validate([false]), false);
  assert.equal(validate([2, 'bad']), false);
});
test('unknown schemas and custom keywords fail closed', () => {
  const ajv = new Ajv();
  assert.throws(() => ajv.compile('unknown'), /unknown schema/);
  assert.throws(() => ajv.addKeyword('untrusted'), /Unsupported/);
  assert.throws(() => ajv.addFormat('untrusted'), /Unsupported/);
});

test('direct validation exposes errors on the instance', () => {
  const ajv = new Ajv();
  assert.equal(ajv.validate({ type: 'number' }, 'invalid'), false);
  assert(ajv.errors?.length);
});

test('rejects values against false schemas', () => {
  const validate = new Ajv().compile(false);
  assert.equal(validate({ anything: true }), false);
  assert(validate.errors?.length);
});

test('supports referenced registered schemas without evaluating code', () => {
  const ajv = new Ajv();
  ajv.addSchema({ $id: 'https://schemas.example/field', type: 'integer' });
  const check = ajv.compile({ $ref: 'https://schemas.example/field' });
  assert.equal(check(7), true);
  assert.equal(check('seven'), false);
});
