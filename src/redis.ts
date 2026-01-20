import { createClient, type RedisArgument } from "redis";
import { createJsonSerializationAdapter } from "./serialization/json.js";
import {
  DuplicateKeyError,
  type KeyCoercion,
  KeyNotFoundError,
  type SerializationAdapter,
  type Storage,
} from "./types.js";

/**
 * Redis storage interface that extends Storage with connection management.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 */
export interface RedisStorage<T, K extends keyof T> extends Storage<T, K> {
  /**
   * Redis client.
   */
  client: ReturnType<typeof createClient>;

  /**
   * Closes the Redis connection.
   */
  close(): void;
}

/**
 * Configuration options for Redis storage.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 */
export interface RedisStorageOptions<T, K extends keyof T = keyof T> extends KeyCoercion<T, K> {
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
 */
export async function createRedisStorage<T, K extends keyof T>(
  keyField: K,
  options: RedisStorageOptions<T, K> = {},
): Promise<RedisStorage<T, K>> {
  const {
    url,
    serializationAdapter = createJsonSerializationAdapter(),
    keyPrefix = `${String(keyField)}:`,
    keyFromStorage = (raw: string) => raw as T[K],
  } = options;

  const client = await createClient({
    url,
  })
    .on("error", (err) => console.error("Redis Client Error", err))
    .connect();

  const makeKey = (key: T[K]): RedisArgument => `${keyPrefix}${key}`;

  return {
    /**
     * Read-only field that is used as the key.
     * @type {K}
     */
    get keyField(): K {
      return keyField;
    },

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
     * Retrieves multiple entries from Redis.
     *
     * @param {T[K][]} keys - The keys of the entries to retrieve
     * @returns {Promise<T[]>} Promise that resolves to an array of found entries
     */
    async getMany(keys: T[K][]): Promise<T[]> {
      if (keys.length === 0) return [];

      const redisKeys = keys.map((k) => makeKey(k));
      const data = await client.mGet(redisKeys);

      return data.filter((d): d is string => d !== null).map((d) => serializationAdapter.deserialize(d));
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
     * Stream all entries from Redis using SCAN for efficient iteration with
     * an asynchronous iterator.
     * Only returns keys matching the configured key prefix.
     *
     * @returns {AsyncIterableIterator<T>} Asynchronous iterator with the entries
     */
    async *streamAll(): AsyncIterableIterator<T> {
      for await (const keys of client.scanIterator({
        TYPE: "STRING",
        MATCH: `${keyPrefix}*`,
      })) {
        if (!keys.length) continue;

        const entries = await client.mGet(keys);
        for (const data of entries) {
          if (data !== null) {
            yield serializationAdapter.deserialize(data);
          }
        }
      }
    },

    /**
     * Retrieves all keys from Redis using SCAN for efficient iteration.
     * Only returns keys matching the configured key prefix, with the prefix removed.
     *
     * @returns {Promise<T[K][]>} Promise that resolves to an array of all keys
     */
    async getKeys(): Promise<T[K][]> {
      const keys: T[K][] = [];
      const prefixLength = keyPrefix.length;

      for await (const keyBatch of client.scanIterator({
        TYPE: "STRING",
        MATCH: `${keyPrefix}*`,
      })) {
        if (!Array.isArray(keyBatch) || keyBatch.length === 0) {
          continue;
        }

        // Remove the key prefix from each key and apply coercion
        for (const key of keyBatch) {
          keys.push(keyFromStorage(key.substring(prefixLength)));
        }
      }

      return keys;
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
     * Subscribes to storage events.
     * Note: Redis events are currently unimplemented.
     *
     * @param event - The event type
     * @param callback - The callback function
     * @returns A cleanup function
     */
    on(_event: "create" | "update" | "delete", _callback: (entry: T) => void): () => void {
      console.log(`Redis storage events are currently unimplemented`);
      return () => {};
    },

    /**
     * Redis client.
     */
    client,

    /**
     * Closes the Redis connection.
     * Always call this when done using the storage to properly close the connection.
     */
    close(): void {
      client.close();
    },
  };
}
