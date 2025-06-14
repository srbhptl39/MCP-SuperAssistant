// Miscellaneous Utility Functions

/**
 * Generates a unique ID string.
 * @param prefix - An optional prefix for the ID.
 * @returns A unique ID string.
 */
export function getUniqueId(prefix = 'id_'): string {
  const S4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  const id = `${S4()}${S4()}-${S4()}-${S4()}-${S4()}-${S4()}${S4()}${S4()}`;
  const uniqueId = prefix + id;
  console.debug(`[Utils.getUniqueId] Generated ID: ${uniqueId}`);
  return uniqueId;
}
