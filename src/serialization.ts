/**
 * Default JSON serialization adapter.
 *
 * @example
 * ```typescript
 * const storage = await createRedisStorage("id", {
 *   serializationAdapter: jsonSerializationAdapter,
 * });
 * ```
 */
export const jsonSerializationAdapter = {
  /**
   * Serializes an entity to a JSON string.
   *
   * @template T - The type of entity
   * @param {T} entry - The entry to serialize
   * @returns {string} JSON string representation
   */
  serialize<T>(entry: T): string {
    return JSON.stringify(entry);
  },

  /**
   * Deserializes a JSON string back to an entity.
   *
   * @template T - The type of entity
   * @param {string} str - The JSON string to deserialize
   * @returns {T} The deserialized entity
   */
  deserialize<T>(str: string): T {
    return JSON.parse(str);
  },
};
