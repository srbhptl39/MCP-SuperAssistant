// CSP-safe stub for `ajv-formats`.
//
// Some dependencies import `ajv-formats` (often via `ajv-formats/dist/formats`).
// The real package expects full Ajv internals/codegen to exist and can crash in MV3.
// This shim ensures those imports are no-ops.

export type AjvLike = {
  addFormat?: (name: string, format: unknown) => unknown;
  addKeyword?: (keyword: string, definition?: unknown) => unknown;
};

export default function addFormats(ajv: AjvLike, _opts?: unknown): AjvLike {
  return ajv;
}

// Common ajv-formats named exports (keep harmless).
export const formats: Record<string, unknown> = {};
export const fullFormats: Record<string, unknown> = {};
export const fastFormats: Record<string, unknown> = {};
