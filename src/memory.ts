import { DuplicateKeyError, KeyNotFoundError, type Storage } from "./types.js";

/**
 * Configuration options for in-memory storage.
 *
 * @template T - The type of entity to store
 *
 * @example
 * ```typescript
 * const options: MemoryStorageOptions<User> = {
 *   ttl: 60000, // Entries expire after 60 seconds
 * };
 * ```
 */
export interface MemoryStorageOptions<T = any> {
  /**
   * Time-to-live in milliseconds for entries.
   * When set, entries will automatically expire after this duration.
   * @defaults to undefined (no expiration)
   */
  ttl?: number;

  /**
   * Custom function to get the current timestamp.
   * Useful for testing or for using a different time source.
   * @defaults to Date.now
   */
  now?: () => number;
}

/**
 * Creates an in-memory storage implementation using a Map.
 * Supports optional TTL (time-to-live) for automatic entry expiration.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 * @param {K} keyField - The field to use as the unique key
 * @param {MemoryStorageOptions} options - Configuration options (optional)
 * @returns {Storage<T, K>} A Storage implementation backed by an in-memory Map
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * // Simple in-memory storage
 * const storage = createMemoryStorage<User, "id">("id");
 * await storage.create({ id: "1", name: "John", email: "john@example.com" });
 * const user = await storage.get("1");
 * ```
 *
 * @example
 * ```typescript
 * // In-memory storage with TTL (60 seconds)
 * const storage = createMemoryStorage<User, "id">("id", { ttl: 60000 });
 * await storage.create({ id: "1", name: "John", email: "john@example.com" });
 * // After 60 seconds, the entry will be automatically expired
 * const user = await storage.get("1"); // Returns null
 * ```
 */
export function createMemoryStorage<T, K extends keyof T = keyof T>(
  keyField: K,
  options?: MemoryStorageOptions,
): Storage<T, K> {
  const { ttl, now = Date.now } = options ?? {};
  const data = new Map<T[K], T>();
  const expirations = ttl ? new Map<T[K], number>() : undefined;

  /**
   * Removes expired entries from the storage.
   */
  const cleanupExpired = () => {
    if (!expirations) return;

    const currentTime = now();
    for (const [key, expiration] of expirations.entries()) {
      if (expiration <= currentTime) {
        data.delete(key);
        expirations.delete(key);
      }
    }
  };

  /**
   * Checks if a single entry has expired.
   * @param {T[K]} key - The key to check
   * @returns {boolean} True if the entry has expired
   */
  const isExpired = (key: T[K]): boolean => {
    if (!expirations) return false;

    const expiration = expirations.get(key);
    if (!expiration) return false;

    return expiration <= now();
  };

  return {
    /**
     * Read-only field that is used as the key.
     * @type {K}
     */
    get keyField(): K {
      return keyField;
    },

    /**
     * Checks if a key exists in the in-memory storage.
     * Expired entries are considered non-existent.
     *
     * @param {T[K]} key - The key to check
     * @returns {Promise<boolean>} Promise resolving to `true` if the key exists, `false` otherwise
     */
    async exists(key: T[K]): Promise<boolean> {
      cleanupExpired();
      if (isExpired(key)) {
        data.delete(key);
        expirations?.delete(key);
        return false;
      }
      return data.has(key);
    },

    /**
     * Creates a new entry in the in-memory storage.
     * If TTL is configured, the entry will automatically expire after the specified duration.
     *
     * @param {T} entry - The entry to create
     * @returns {Promise<void>} Promise that resolves when the entry is created
     * @throws {DuplicateKeyError} If an entry with the same key already exists
     */
    async create(entry: T): Promise<void> {
      cleanupExpired();
      const key = entry[keyField];
      if (data.has(key)) {
        throw new DuplicateKeyError(`Key "${key}" already exists`);
      }

      data.set(key, entry);
      if (ttl && expirations) {
        expirations.set(key, now() + ttl);
      }
    },

    /**
     * Retrieves an entry from the in-memory storage.
     * Returns null if the entry doesn't exist or has expired.
     *
     * @param {T[K]} key - The key of the entry to retrieve
     * @returns {Promise<T | null>} Promise that resolves to the entry if found, `null` otherwise
     */
    async get(key: T[K]): Promise<T | null> {
      cleanupExpired();
      if (isExpired(key)) {
        data.delete(key);
        expirations?.delete(key);
        return null;
      }
      return data.get(key) ?? null;
    },

    /**
     * Retrieves all entries from the in-memory storage.
     * Expired entries are automatically excluded.
     *
     * @returns {Promise<T[]>} Promise that resolves to an array of all entries
     */
    async getAll(): Promise<T[]> {
      cleanupExpired();
      return Array.from(data.values());
    },

    /**
     * Stream all entries with an asynchronous iterator.
     * Expired entries are automatically excluded.
     *
     * @returns {AsyncIterableIterator<T>} Asynchronous iterator with the entries
     */
    async *streamAll(): AsyncIterableIterator<T> {
      cleanupExpired();
      for (const entry of data.values()) {
        yield entry;
      }
    },

    /**
     * Retrieves all keys from the in-memory storage.
     * Keys for expired entries are automatically excluded.
     *
     * @returns {Promise<T[K][]>} Promise that resolves to an array of all keys
     */
    async getKeys(): Promise<T[K][]> {
      cleanupExpired();
      return Array.from(data.keys());
    },

    /**
     * Updates an existing entry in the in-memory storage.
     * If TTL is configured, the expiration time is reset.
     *
     * @param {T} entry - The entry with updated values
     * @returns {Promise<void>} Promise that resolves when the entry is updated
     * @throws {KeyNotFoundError} If the entry's key does not exist
     */
    async update(entry: T): Promise<void> {
      cleanupExpired();
      const key = entry[keyField];
      if (isExpired(key) || !data.has(key)) {
        throw new KeyNotFoundError(`Key "${key}" not found`);
      }

      data.set(key, entry);
      if (ttl && expirations) {
        expirations.set(key, now() + ttl);
      }
    },

    /**
     * Deletes an entry from the in-memory storage.
     *
     * @param {T[K]} key - The key of the entry to delete
     * @returns {Promise<void>} Promise that resolves when the entry is deleted
     * @throws {KeyNotFoundError} If the key does not exist
     */
    async delete(key: T[K]): Promise<void> {
      cleanupExpired();
      if (isExpired(key) || !data.has(key)) {
        throw new KeyNotFoundError(`Key "${key}" not found`);
      }

      data.delete(key);
      expirations?.delete(key);
    },
  };
}
