# Instructions Component

This directory contains components and utilities for generating and displaying instructions for using MCP tools.

## Files

- `instructionGenerator.ts`: Generates markdown instructions for using MCP tools based on available tools.
- `schema_converter.ts`: Utilities for converting between JSON Schema and Compressed Schema Notation (CSN).

## Recent Changes

- Added schema compression functionality to display tool schemas in a more compact format.
- Implemented error handling during schema conversion to ensure the application continues to work even if some schemas fail to convert.
- Added exports to schema_converter.ts to make it a proper module.

## Compressed Schema Notation (CSN)

CSN is a compact notation for representing JSON Schema. It uses short codes to represent different schema types and structures:

- `o`: Object
- `p {}`: Properties block
- `s`: String
- `i`: Integer
- `n`: Number
- `b`: Boolean
- `a`: Array
- `r`: Required
- `ap f`: Additional properties false

For example, a simple schema like:
```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string" }
  },
  "required": ["path"],
  "additionalProperties": false
}
```

Is represented in CSN as:
```
o {p {path:s r} ap f}
```

This makes it easier to quickly understand the structure of a tool's schema without having to parse the full JSON Schema. 