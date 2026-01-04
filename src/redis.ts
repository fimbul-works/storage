import { type RedisArgument, createClient } from "redis";
import { jsonSerializationAdapter } from "./serialization.js";
import { DuplicateKeyError, KeyNotFoundError, type SerializationAdapter, type Storage } from "./types.js";

/**
 * Redis storage interface that extends Storage with connection management.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 *
 * @example
 * ```typescript
 * const storage = await createRedisStorage<User, "id">("id");
 * await storage.create({ id: "1", name: "John" });
 * storage.close(); // Cleanly close the connection
 * ```
 */
export interface RedisStorage<T, K extends keyof T> extends Storage<T, K> {
  /**
   * Redis client.
   */
  client: ReturnType<typeof createClient>;

  /**
   * Closes the Redis connection.
   *
   * @example
   * ```typescript
   * storage.close();
   * ```
   */
  close(): void;
}

/**
 * Configuration options for Redis storage.
 *
 * @template T - The type of entity to store
 *
 * @example
 * ```typescript
 * const options: RedisStorageOptions<User> = {
 *   url: "redis://localhost:6379",
 *   keyPrefix: "users:",
 *   serializationAdapter: customAdapter,
 * };
 * ```
 */
export interface RedisStorageOptions<T> {
  /**
   * Redis connection URL.
   */
  url?: string;

  /**
   * Custom serialization adapter for encoding/decoding entities.
   * @defaults to JSON serialization
   */
  serializationAdapter?: SerializationAdapter<T>;

  /**
   * Prefix to add to all keys in Redis.
   * @defaults `"{keyField}:"`
   */
  keyPrefix?: string;
}

/**
 * Creates a Redis-backed storage implementation.
 * Automatically connects to Redis on creation.
 * Uses SCAN for `getAll()` to handle large datasets efficiently.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 * @param {K} keyField - The field to use as the unique key
 * @param {RedisStorageOptions} options - Configuration options for Redis storage
 * @returns {Promise<RedisStorage<T, K>>} Promise resolving to a RedisStorage instance
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * const storage = await createRedisStorage<User, "id">("id", {
 *   url: "redis://localhost:6379",
 *   keyPrefix: "users:",
 * });
 *
 * await storage.create({ id: "1", name: "John", email: "john@example.com" });
 * const user = await storage.get("1");
 * storage.close();
 * ```
 */
export async function createRedisStorage<T, K extends keyof T>(
  keyField: K,
  options: RedisStorageOptions<T> = {},
): Promise<RedisStorage<T, K>> {
  const { url, serializationAdapter = jsonSerializationAdapter, keyPrefix = `${String(keyField)}:` } = options;

  const client = await createClient({
    url,
  })
    .on("error", (err) => console.error("Redis Client Error", err))
    .connect();

  const makeKey = (key: T[K]): RedisArgument => `${keyPrefix}${key}`;

  return {
    /**
     * Checks if a key exists in Redis.
     *
     * @param {T[K]} key - The key to check for existence
     * @returns {Promise<boolean>} Promise that resolves to `true` if the key exists, `false` otherwise
     */
    async exists(key: T[K]): Promise<boolean> {
      return (await client.exists(makeKey(key))) === 1;
    },

    /**
     * Creates a new entry in Redis.
     *
     * @param {T} entry - The entry to create
     * @returns {Promise<void>} Promise that resolves when the entry is created
     * @throws {DuplicateKeyError} If an entry with the same key already exists
     */
    async create(entry: T): Promise<void> {
      const redisKey = makeKey(entry[keyField]);

      if ((await client.exists(redisKey)) === 1) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      await client.set(redisKey, serializationAdapter.serialize(entry));
    },

    /**
     * Retrieves an entry from Redis.
     *
     * @param {T[K]} key - The key of the entry to retrieve
     * @returns {Promise<T | null>} Promise that resolves to the entry if found, `null` otherwise
     */
    async get(key: T[K]): Promise<T | null> {
      const redisKey = makeKey(key);

      if (!(await client.exists(redisKey))) {
        return null;
      }

      const data = await client.get(redisKey);
      if (data === null) {
        return null;
      }

      return serializationAdapter.deserialize(data);
    },

    /**
     * Retrieves all entries from Redis using SCAN for efficient iteration.
     * Only returns keys matching the configured key prefix.
     *
     * @returns {Promise<T[]>} Promise that resolves to an array of all entries
     */
    async getAll(): Promise<T[]> {
      let result: T[] = [];

      for await (const keys of client.scanIterator({
        TYPE: "STRING",
        MATCH: `${keyPrefix}*`,
      })) {
        // Ensure keys is a valid non-empty array
        if (!Array.isArray(keys) || keys.length === 0) {
          continue;
        }

        const entries = await client.mGet(keys);

        if (entries === null) {
          continue;
        }

        result = [
          ...result,
          ...entries.filter((e): e is string => e !== null).map((entry) => serializationAdapter.deserialize(entry)),
        ];
      }

      return result;
    },

    /**
     * Updates an existing entry in Redis.
     *
     * @param {T} entry - The entry with updated values
     * @returns {Promise<void>} Promise that resolves when the entry is updated
     * @throws {KeyNotFoundError} If the entry's key does not exist
     */
    async update(entry: T): Promise<void> {
      const redisKey = makeKey(entry[keyField]);

      if (!(await client.exists(redisKey))) {
        throw new KeyNotFoundError(`Key "${entry[keyField]}" not found`);
      }

      await client.set(redisKey, serializationAdapter.serialize(entry));
    },

    /**
     * Deletes an entry from Redis.
     *
     * @param {T[K]} key - The key of the entry to delete
     * @returns {Promise<void>} Promise that resolves when the entry is deleted
     * @throws {KeyNotFoundError} If the key does not exist
     */
    async delete(key: T[K]): Promise<void> {
      const redisKey = makeKey(key);

      if (!(await client.exists(redisKey))) {
        throw new KeyNotFoundError(`Key "${key}" not found`);
      }

      await client.del(redisKey);
    },

    /**
     * Redis client.
     */
    client,

    /**
     * Closes the Redis connection.
     * Always call this when done using the storage to properly close the connection.
     *
     * @example
     * ```typescript
     * storage.close();
     * ```
     */
    close(): void {
      client.close();
    },
  };
}
