import { DuplicateKeyError, KeyNotFoundError, type Storage } from "./types.js";

/**
 * Creates an in-memory storage implementation using a Map.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 * @param {T[K]} keyField - The field to use as the unique key
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
 * const storage = createMemoryStorage<User, "id">("id");
 * await storage.create({ id: "1", name: "John", email: "john@example.com" });
 * const user = await storage.get("1");
 * ```
 */
export function createMemoryStorage<T, K extends keyof T = keyof T>(keyField: K): Storage<T, K> {
  const data = new Map<T[K], T>();

  return {
    /**
     * Checks if a key exists in the in-memory storage.
     *
     * @param {T[K]} key - The key to check
     * @returns {Promise<boolean>} Promise resolving to `true` if the key exists, `false` otherwise
     */
    async exists(key: T[K]): Promise<boolean> {
      return data.has(key);
    },

    /**
     * Creates a new entry in the in-memory storage.
     *
     * @param {T} entry - The entry to create
     * @returns {Promise<void>} Promise that resolves when the entry is created
     * @throws {DuplicateKeyError} If an entry with the same key already exists
     */
    async create(entry: T): Promise<void> {
      if (data.has(entry[keyField])) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      data.set(entry[keyField], entry);
    },

    /**
     * Retrieves an entry from the in-memory storage.
     *
     * @param {T[K]} key - The key of the entry to retrieve
     * @returns {Promise<T | null>} Promise that resolves to the entry if found, `null` otherwise
     */
    async get(key: T[K]): Promise<T | null> {
      return data.get(key) ?? null;
    },

    /**
     * Retrieves all entries from the in-memory storage.
     *
     * @returns {Promise<T[]>} Promise that resolves to an array of all entries
     */
    async getAll(): Promise<T[]> {
      return Array.from(data.values());
    },

    /**
     * Updates an existing entry in the in-memory storage.
     *
     * @param {T} entry - The entry with updated values
     * @returns {Promise<void>} Promise that resolves when the entry is updated
     * @throws {KeyNotFoundError} If the entry's key does not exist
     */
    async update(entry: T): Promise<void> {
      if (!data.has(entry[keyField])) {
        throw new KeyNotFoundError(`Key "${entry[keyField]}" not found`);
      }

      data.set(entry[keyField], entry);
    },

    /**
     * Deletes an entry from the in-memory storage.
     *
     * @param {T[K]} key - The key of the entry to delete
     * @returns {Promise<void>} Promise that resolves when the entry is deleted
     * @throws {KeyNotFoundError} If the key does not exist
     */
    async delete(key: T[K]): Promise<void> {
      if (!data.has(key)) {
        throw new KeyNotFoundError(`Key "${key}" not found`);
      }

      data.delete(key);
    },
  };
}
