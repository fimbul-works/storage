import type { SerializationAdapter } from "../types";

/**
 * Creates a JSON serialization adapter.
 * @template T - The type of entity to serialize/deserialize
 * @param {object} options - Optional configuration for JSON serialization
 * @param {(key: string, value: any) => any} [options.replacer] - Replacer function for JSON.stringify
 * @param {string | number} [options.space] - Space argument for JSON.stringify (pretty print)
 * @returns {SerializationAdapter<T, string>} JSON serialization adapter
 */
export function createJsonSerializationAdapter<T = any>(options?: {
  /** Replacer function for JSON.stringify */
  replacer?: (key: string, value: any) => any;
  /** Space argument for JSON.stringify (pretty print) */
  space?: string | number;
}): SerializationAdapter<T, string> {
  return {
    /**
     * Serializes an entity to a JSON string.
     *
     * @template T - The type of entity
     * @param {T} entry - The entry to serialize
     * @returns {string} JSON string representation
     */
    serialize<T>(entry: T): string {
      return JSON.stringify(entry, options?.replacer, options?.space);
    },

    /**
     * Deserializes a JSON string back to an entity.
     *
     * @template T - The type of entity
     * @param {T} str - The JSON string to deserialize
     * @returns {T} The deserialized entity
     */
    deserialize<T>(str: string): T {
      return JSON.parse(str);
    },
  };
}
