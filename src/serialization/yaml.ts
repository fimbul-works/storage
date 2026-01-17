import {
  type CreateNodeOptions,
  type DocumentOptions,
  type ParseOptions,
  parse,
  type SchemaOptions,
  stringify,
  type ToJSOptions,
  type ToStringOptions,
} from "yaml";
import type { SerializationAdapter } from "../types";

/**
 * YAML serialization adapter.
 *
 * @example
 * ```typescript
 * const storage = await createRedisStorage("id", {
 *   serializationAdapter: yamlSerializationAdapter,
 * });
 * ```
 */
export function createYamlSerializationAdapter<T>(
  stringifyOptions?: DocumentOptions & SchemaOptions & ParseOptions & CreateNodeOptions & ToStringOptions,
  parseOptions?: ParseOptions & DocumentOptions & SchemaOptions & ToJSOptions,
): SerializationAdapter<T, string> {
  return {
    /**
     * Serializes an entity to a YAML string.
     *
     * @template T - The type of entity
     * @param {T} entry - The entry to serialize
     * @returns {string} YAML string representation
     */
    serialize<T>(entry: T): string {
      return stringify(entry, stringifyOptions);
    },

    /**
     * Deserializes a YAML string back to an entity.
     *
     * @template T - The type of entity
     * @param {string} str - The YAML string to deserialize
     * @returns {T} The deserialized entity
     */
    deserialize<T>(str: string): T {
      return parse(str, parseOptions);
    },
  };
}
