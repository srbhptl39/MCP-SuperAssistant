// //  // Doc
// Schema Notation Table

// **Notation** | **Meaning** | **Example** | **Explanation**
// ------- | -------- | -------- | --------
// o | Object | o {p {name:s}} | Indicates the schema represents a JSON object.
// p {} | Contains the object's properties. | |
// p {} | Properties block | p {name:s; age:i} | Defines the properties of an object, with each property separated by ;.
// s | String | name:s | Represents a string type.
// i | Integer | age:i | Represents an integer type.
// n | Number | score:n | Represents a number type (integer or float).
// b | Boolean | active:b | Represents a boolean type.
// a | Array | tags:a[s] | Represents an array type, with the item type specified in [ ].
// e[values] | Enum | color:e["red", "green", "blue"] | Represents an enum with specific allowed values.
// u[types] | Union | value:u[s, n] | Represents a union of multiple types.
// lit[value] | Literal | status:lit["active"] | Represents a literal value that the field must match exactly.
// r | Required | name:s r | Indicates that the property is required.
// d=value | Default value | active:b d=true | Specifies a default value for the property.
// ap f | Additional properties false | o {p {name:s} ap f} | Disallows additional properties not defined in the schema.
// type(key=value, ...) | Constrained type | name:s(minLength=1) | Adds constraints to a type, e.g., minLength for strings or min for numbers.
// a[type] | Array with item type | tags:a[s] | Specifies an array where each item is of type s (string).
// o {p {prop:type}} | Nested object | user:o {p {id:i; name:s}} | Represents a nested object with its own properties.
// ?type | Optional type | ?s | Represents an optional type, equivalent to u[type, null].
// t[type1, type2, ...] | Tuple | t[s, i] | Represents a tuple with specific types for each position.
// s[type] | Set | s[i] | Represents a set of unique values of type i (integer).
// d[key, value] | Dictionary | d[s, i] | Represents a dictionary with keys of type s and values of type i.
// ClassName | Custom class | User | Represents a custom class or type, often used for nested schemas.

// * * *

// Detailed Explanations

// Basic Types

// * s: A string type, e.g., "hello".
// * i: An integer type, e.g., 42.
// * n: A number type, which can be an integer or float, e.g., 3.14.
// * b: A boolean type, e.g., true or false.
// * a: An array type, where the type of items is specified in brackets, e.g., a[s] for an array of strings like ["apple", "banana"].

// Complex Types

// * o {p {}}: Defines a JSON object with properties listed in the p {} block, e.g., { "name": "John", "age": 30 }.
// * a[type]: An array where all items share the same type, e.g., tags:a[s] for ["tag1", "tag2"].
// * e[values]: An enum restricting values to a predefined list, e.g., color:e["red", "green", "blue"].
// * u[types]: A union allowing multiple types, e.g., value:u[s, n] could be "text" or 123.
// * lit[value]: A literal that must match exactly, e.g., status:lit["active"] only allows "active".

// Modifiers

// * r: Marks a property as required, meaning it cannot be omitted, e.g., name:s r.
// * d=value: Sets a default value if the property is not provided, e.g., active:b d=true.
// * ap f: Prevents additional properties in an object, e.g., o {p {name:s} ap f} rejects { "name": "John", "extra": 1 }.

// Constraints

// * Constraints are added in parentheses after a type, e.g., s(minLength=1) ensures a string is at least 1 character long.
// * Examples: i(min=0) for non-negative integers, n(max=100) for numbers up to 100.

// Nested Structures

// * o {p {prop:type}}: Allows nesting, e.g., user:o {p {id:i; name:s}} for { "id": 1, "name": "John" }.
// * Arrays can hold complex types, e.g., a[o {p {name:s}}] for [{ "name": "John" }, { "name": "Jane" }].

// Special Types

// * ?type: An optional type that can be the specified type or null, e.g., ?s for "text" or null.
// * t[type1, type2, ...]: A tuple with fixed positions, e.g., t[s, i] for ["text", 42].
// * s[type]: A set of unique values, e.g., s[i] for {1, 2, 3} (no duplicates).
// * d[key, value]: A dictionary, e.g., d[s, i] for { "age": 30, "score": 95 }.

// Custom Types

// * ClassName: Refers to a custom-defined type or class, e.g., User might represent a complex schema defined elsewhere.

// * * *

// Example Usage

// * Simple Object:
//     * Notation: o {p {name:s r; age:i}}
//     * Meaning: An object with a required name (string) and an optional age (integer), e.g., { "name": "John", "age": 25 }.

// * Array with Constraints:
//     * Notation: a[s(minLength=1)]
//     * Meaning: An array of strings, each at least 1 character, e.g., ["cat", "dog"].

// * Enum:
//     * Notation: color:e["red", "green", "blue"]
//     * Meaning: A color property limited to "red", "green", or "blue".

// * Union:
//     * Notation: value:u[s, n]
//     * Meaning: A value that can be a string or number, e.g., "hello" or 42.

// * Literal:
//     * Notation: status:lit["active"]
//     * Meaning: A status that must be "active".

// * Default Value:
//     * Notation: active:b d=true
//     * Meaning: A boolean active that defaults to true if not specified.

// * Disallow Additional Properties:
//     * Notation: o {p {name:s} ap f}
//     * Meaning: An object with only a name property, rejecting extras, e.g., { "name": "John" } is valid, but { "name": "John", "age": 30 } is not.

const typeMapping: Record<string, string> = {
  string: 's',
  integer: 'i',
  number: 'n',
  boolean: 'b',
  object: 'o',
  array: 'a',
};

const reverseTypeMapping: Record<string, string> = {
  s: 'string',
  i: 'integer',
  n: 'number',
  b: 'boolean',
  o: 'object',
  a: 'array',
};

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: any[];
  const?: any;
  anyOf?: JsonSchema[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  default?: any;
  [key: string]: any;
}

export function jsonSchemaToCsn(schema: JsonSchema): string {
  if (!schema || typeof schema !== 'object') {
    throw new Error('Invalid JSON Schema: must be an object');
  }

  // Enum
  if (schema.enum) {
    return `e[${schema.enum.map(val => JSON.stringify(val)).join(', ')}]`;
  }

  // Literal (const)
  if ('const' in schema) {
    return `lit[${JSON.stringify(schema.const)}]`;
  }

  // Union (anyOf)
  if (schema.anyOf) {
    return `u[${schema.anyOf.map(subSchema => jsonSchemaToCsn(subSchema)).join(', ')}]`;
  }

  // Array
  if (schema.type === 'array') {
    const itemType = schema.items ? jsonSchemaToCsn(schema.items) : 'any';
    return `a[${itemType}]`;
  }

  // Object
  if (schema.type === 'object') {
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);
    const propStrings = Object.entries(properties)
      .map(([name, propSchema]) => {
        const propCsn = jsonSchemaToCsn(propSchema);
        const requiredFlag = required.has(name) ? ' r' : '';
        const defaultFlag = 'default' in propSchema ? ` d=${JSON.stringify(propSchema.default)}` : '';
        return `${name}:${propCsn}${requiredFlag}${defaultFlag}`;
      })
      .join('; ');
    const additionalProps = schema.additionalProperties === false ? ' ap f' : '';
    return `o {p {${propStrings}}${additionalProps}}`;
  }

  // Basic types with constraints
  const baseType = typeMapping[schema.type!] || schema.type!;
  const constraints = [];
  if (schema.type === 'string') {
    if (schema.minLength !== undefined) constraints.push(`minLength=${schema.minLength}`);
    if (schema.maxLength !== undefined) constraints.push(`maxLength=${schema.maxLength}`);
    if (schema.pattern) constraints.push(`pattern="${schema.pattern}"`);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.minimum !== undefined) constraints.push(`min=${schema.minimum}`);
    if (schema.maximum !== undefined) constraints.push(`max=${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined) constraints.push(`exclusiveMin=${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined) constraints.push(`exclusiveMax=${schema.exclusiveMaximum}`);
  }
  const constraintStr = constraints.length > 0 ? `(${constraints.join(', ')})` : '';
  const defaultFlag = 'default' in schema ? ` d=${JSON.stringify(schema.default)}` : '';
  return `${baseType}${constraintStr}${defaultFlag}`;
}

export function csnToJsonSchema(csn: string): JsonSchema {
  if (typeof csn !== 'string' || !csn.trim()) {
    throw new Error('Invalid CSN: must be a non-empty string');
  }
  return parseCsnType(csn);
}

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

    const hasAdditionalProps = content.includes('ap f');
    const schema: JsonSchema = { type: 'object', properties: {}, required: [] };
    if (hasAdditionalProps) schema.additionalProperties = false;

    if (propertiesBlock) {
      const properties = splitTopLevel(propertiesBlock, ';').filter(Boolean);

      for (const prop of properties) {
        const colonIndex = prop.indexOf(':');
        if (colonIndex === -1) continue;

        const name = prop.substring(0, colonIndex).trim();
        const typeInfo = prop.substring(colonIndex + 1).trim();

        // Process type info, handling nested objects and type modifiers
        let propTypeCore = '';
        let propTypeModifiers = '';
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
          let depth = 0;
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

        // Parse the type
        const propSchema = parseCsnType(propTypeCore);

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

// --- New helper function added ---
function extractCoreAndFlags(typeInfo: string): { core: string; flags: string[] } {
  typeInfo = typeInfo.trim();
  let core = '';
  let flags: string[] = [];
  let depth = 0;
  let i = 0;
  for (; i < typeInfo.length; i++) {
    const char = typeInfo[i];
    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
    }
    core += char;
    if (depth === 0 && i < typeInfo.length - 1 && /\s/.test(typeInfo[i + 1])) {
      i++; // skip the whitespace after the core expression
      break;
    }
  }
  const remaining = typeInfo.slice(i).trim();
  if (remaining) {
    flags = remaining.split(/\s+/);
  }
  return { core, flags };
}

// --- New helper function added ---
function extractPropertiesBlock(content: string): string | null {
  const pIndex = content.indexOf('p {');
  if (pIndex === -1) return null;
  const braceStart = content.indexOf('{', pIndex);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    const char = content[i];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        return content.substring(braceStart + 1, i).trim();
      }
    }
  }
  return null;
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

// Export the JsonSchema interface
export type { JsonSchema };

// Remove or comment out the test code for production use
/*
  let jsonschematest1 = {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "edits": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "oldText": {
                "type": "string",
                "description": "Text to search for - must match exactly"
              },
              "newText": {
                "type": "string",
                "description": "Text to replace with"
              }
            },
            "required": [
              "oldText",
              "newText"
            ],
            "additionalProperties": false
          }
        },
        "dryRun": {
          "type": "boolean",
          "default": false,
          "description": "Preview changes using git-style diff format"
        }
      },
      "required": [
        "path",
        "edits"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }

    let csn = jsonSchemaToCsn(jsonschematest1);
    console.debug(csn);

    let jsonschema = csnToJsonSchema(csn);
    console.debug(jsonschema);

    let csn2 = 'o {p {path:s r; edits:l[o {p {oldText:s r "Text to search for - must match exactly"; newText:s r "Text to replace with"} ap f}] r; dryRun:b d=false "Preview changes using git-style diff format"} ap f}';
    let jsonschema2 = csnToJsonSchema(csn2);
    console.debug(jsonschema2);

    let csn3 = jsonSchemaToCsn(jsonschema2);
    console.debug(csn3);
  */
