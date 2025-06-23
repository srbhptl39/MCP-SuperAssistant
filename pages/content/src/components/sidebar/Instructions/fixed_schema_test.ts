// Import only the type, not the actual function
import type { JsonSchema } from './schema_converter';

// Reimplemented version of csnToJsonSchema
function fixedCsnToJsonSchema(csn: string): JsonSchema {
  if (typeof csn !== 'string' || !csn.trim()) {
    throw new Error('Invalid CSN: must be a non-empty string');
  }
  return parseCsnType(csn);
}

// Type mapping
const reverseTypeMapping: Record<string, string> = {
  s: 'string',
  i: 'integer',
  n: 'number',
  b: 'boolean',
  o: 'object',
  a: 'array',
};

function parseCsnType(typeStr: string): JsonSchema {
  typeStr = typeStr.trim();

  // Enum
  if (typeStr.startsWith('e[')) {
    const valuesStr = typeStr.slice(2, -1);
    try {
      const enumValues = valuesStr.split(',').map(val => JSON.parse(val.trim()));
      return { enum: enumValues };
    } catch {
      throw new Error(`Invalid enum values: ${valuesStr}`);
    }
  }

  // Literal (const)
  if (typeStr.startsWith('lit[')) {
    const valueStr = typeStr.slice(4, -1);
    try {
      return { const: JSON.parse(valueStr) };
    } catch {
      throw new Error(`Invalid literal value: ${valueStr}`);
    }
  }

  // Union (anyOf)
  if (typeStr.startsWith('u[')) {
    const typesStr = typeStr.slice(2, -1);
    const types = splitTopLevel(typesStr, ',');
    return { anyOf: types.map(t => parseCsnType(t)) };
  }

  // Array
  if (typeStr.startsWith('a[')) {
    const itemTypeStr = typeStr.slice(2, -1);
    return { type: 'array', items: parseCsnType(itemTypeStr) };
  }

  // Object
  if (typeStr.startsWith('o {')) {
    const content = typeStr.slice(3, -1).trim();
    console.debug(`Processing object: ${typeStr}`);
    // Extract the properties block with proper brace balancing
    let propertiesBlock = null;
    const pIndex = content.indexOf('p {');
    if (pIndex !== -1) {
      const braceStart = content.indexOf('{', pIndex);
      if (braceStart !== -1) {
        let depth = 1;
        let i = braceStart + 1;
        for (; i < content.length; i++) {
          const char = content[i];
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) break;
          }
        }
        propertiesBlock = content.substring(braceStart + 1, i);
      }
    }

    console.debug(`Properties block: ${propertiesBlock}`);

    const hasAdditionalProps = content.includes('ap f');
    const schema: JsonSchema = { type: 'object', properties: {}, required: [] };
    if (hasAdditionalProps) schema.additionalProperties = false;

    if (propertiesBlock) {
      const properties = splitTopLevel(propertiesBlock, ';').filter(Boolean);
      console.debug(`Properties: ${JSON.stringify(properties)}`);

      for (const prop of properties) {
        const colonIndex = prop.indexOf(':');
        if (colonIndex === -1) continue;

        const name = prop.substring(0, colonIndex).trim();
        const typeInfo = prop.substring(colonIndex + 1).trim();

        console.debug(`Processing property: ${name} with type info: ${typeInfo}`);

        // Process type info, handling nested objects and type modifiers
        let propTypeCore = '';
        let propTypeModifiers = '';
        let depth = 0;
        let i = 0;

        // Special handling for nested objects
        if (typeInfo.startsWith('o {')) {
          // Find the matching closing brace for the object definition
          let objDepth = 0;
          let inObj = false;
          for (; i < typeInfo.length; i++) {
            const char = typeInfo[i];
            propTypeCore += char;

            if (char === '{') {
              objDepth++;
              inObj = true;
            } else if (char === '}') {
              objDepth--;
              if (objDepth === 0 && inObj) {
                i++; // Move past the closing brace
                break;
              }
            }
          }
        } else {
          // Regular extraction for non-object types
          for (; i < typeInfo.length; i++) {
            const char = typeInfo[i];
            if (char === '{' || char === '[') depth++;
            else if (char === '}' || char === ']') depth--;

            propTypeCore += char;

            // If we've reached the end of the core type, break
            if (depth === 0 && i < typeInfo.length - 1 && /\s/.test(typeInfo[i + 1])) {
              i++; // Skip the space
              break;
            }
          }
        }

        // Get the modifiers (r, d=..., etc.)
        propTypeModifiers = typeInfo.substring(i).trim();

        console.debug(`Property ${name} core type: ${propTypeCore}, modifiers: ${propTypeModifiers}`);

        // Parse the type
        const propSchema = parseCsnType(propTypeCore);

        console.debug(`Property ${name} schema: ${JSON.stringify(propSchema)}`);

        // Apply modifiers
        if (propTypeModifiers.includes('r')) {
          schema.required!.push(name);
        }

        const defaultMatch = propTypeModifiers.split(/\s+/).find(part => part.startsWith('d='));
        if (defaultMatch) {
          try {
            propSchema.default = JSON.parse(defaultMatch.slice(2));
          } catch {
            throw new Error(`Invalid default value: ${defaultMatch.slice(2)}`);
          }
        }

        // Add to properties
        schema.properties![name] = propSchema;
      }
    }

    if (schema.required!.length === 0) delete schema.required;
    console.debug(`Final schema: ${JSON.stringify(schema)}`);
    return schema;
  }

  // Constrained type
  const constrainedMatch = typeStr.match(/^([a-z]+)\((.*)\)$/);
  if (constrainedMatch) {
    const baseType = constrainedMatch[1];
    const constraintsStr = constrainedMatch[2];
    const constraints = splitTopLevel(constraintsStr, ',');
    const schema: JsonSchema = { type: reverseTypeMapping[baseType] || baseType };
    constraints.forEach(constraint => {
      const [key, valueStr] = constraint.split('=');
      const value = valueStr.startsWith('"') ? valueStr.slice(1, -1) : Number(valueStr);
      if (key === 'minLength') schema.minLength = value as number;
      else if (key === 'maxLength') schema.maxLength = value as number;
      else if (key === 'pattern') schema.pattern = value as string;
      else if (key === 'min') schema.minimum = value as number;
      else if (key === 'max') schema.maximum = value as number;
      else if (key === 'exclusiveMin') schema.exclusiveMinimum = value as number;
      else if (key === 'exclusiveMax') schema.exclusiveMaximum = value as number;
    });
    return schema;
  }

  // Basic type with possible default
  const parts = splitTopLevel(typeStr, ' ');
  const baseType = parts[0];
  const defaultMatch = parts.find(part => part.startsWith('d='));
  const schema: JsonSchema = { type: reverseTypeMapping[baseType] || baseType };
  if (defaultMatch) {
    try {
      schema.default = JSON.parse(defaultMatch.slice(2));
    } catch {
      throw new Error(`Invalid default value: ${defaultMatch.slice(2)}`);
    }
  }
  return schema;
}

// Helper to split top-level items, respecting nested brackets
function splitTopLevel(str: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of str) {
    if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') depth--;
    else if (char === delimiter && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// Test case
const testCsn =
  'o {p {params:o {p {user_id:s; recipient_email:s r; cc:a[s]; bcc:a[s]; subject:s r; body:s r; is_html:b; attachment:u[o {p {name:s r; mimetype:s r; s3key:s r} ap f}, null]} ap f} r} ap f}';

const result = fixedCsnToJsonSchema(testCsn);
console.debug(JSON.stringify(result, null, 2));
