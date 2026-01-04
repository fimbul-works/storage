import { DuplicateKeyError, KeyNotFoundError, type Storage } from "./types.js";

/**
 * Creates a layered storage implementation that combines multiple storage backends.
 * Layers are ordered from top to bottom (first element is the top layer).
 *
 * This is ideal for caching scenarios where:
 * - Top layers are fast storage (e.g., in-memory)
 * - Bottom layers are persistent storage (e.g., file, database)
 *
 * All layers must share the same key field. The key field is automatically
 * determined from the first layer's `keyField` property.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 * @param {Storage<T, K>[]} layers - Array of storage layers ordered from top to bottom
 * @returns {Storage<T, K>} A Storage implementation that combines all layers
 * @throws {Error} If no layers are provided
 * @throws {Error} If layers have different key fields
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * const memoryStorage = createMemoryStorage<User, "id">("id");
 * const fileStorage = createFileStorage<User, "id">("./data/users", "id");
 *
 * // Create a layered storage with memory cache on top of file storage
 * const storage = createLayeredStorage([memoryStorage, fileStorage]);
 *
 * // get() will check memory first, then file
 * const user = await storage.get("1");
 *
 * // create() writes to both layers (keeps cache in sync)
 * await storage.create({ id: "2", name: "Jane", email: "jane@example.com" });
 * ```
 */
export function createLayeredStorage<T, K extends keyof T>(layers: Storage<T, K>[]): Storage<T, K> {
  if (layers.length === 0) {
    throw new Error("At least one storage layer is required");
  }

  // Ensure all layers use the same key field
  const uniqueKeyFields = Array.from(new Set(layers.map((storage) => storage.keyField)));
  if (uniqueKeyFields.length > 1) {
    throw new Error(`All layers must have the same key field. Found: ${uniqueKeyFields.join(", ")}`);
  }
  const keyField = uniqueKeyFields[0];

  return {
    /**
     * Read-only field that is used as the key.
     * @type {K}
     */
    get keyField(): K {
      return keyField;
    },

    /**
     * Checks if a key exists in any layer (top to bottom).
     * Returns true as soon as the key is found in any layer.
     *
     * @param {T[K]} key - The key to check for existence
     * @returns {Promise<boolean>} Promise that resolves to `true` if the key exists in any layer, `false` otherwise
     */
    async exists(key: T[K]): Promise<boolean> {
      for (const layer of layers) {
        if (await layer.exists(key)) {
          return true;
        }
      }
      return false;
    },

    /**
     * Creates a new entry in all layers.
     * Throws if the key exists in any layer.
     *
     * @param {T} entry - The entry to create
     * @returns {Promise<void>} Promise that resolves when the entry is created in all layers
     * @throws {DuplicateKeyError} If an entry with the same key already exists in any layer
     */
    async create(entry: T): Promise<void> {
      // Check if exists in any layer first
      if (await this.exists(entry[keyField])) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      // Create in all layers
      await Promise.all(layers.map((layer) => layer.create(entry)));
    },

    /**
     * Retrieves an entry by checking layers top to bottom.
     * Returns the first match found (ideal for cache-aside pattern).
     *
     * @param {T[K]} key - The key of the entry to retrieve
     * @returns {Promise<T | null>} Promise that resolves to the entry if found in any layer, `null` otherwise
     */
    async get(key: T[K]): Promise<T | null> {
      for (const layer of layers) {
        const entry = await layer.get(key);
        if (entry !== null) {
          return entry;
        }
      }
      return null;
    },

    /**
     * Retrieves all entries from all layers, merging bottom-up.
     * Entries from upper layers override entries from lower layers with the same key.
     * This ensures cache data takes precedence over stale data in lower layers.
     *
     * @returns {Promise<T[]>} Promise that resolves to an array of all unique entries
     */
    async getAll(): Promise<T[]> {
      // Read all layers from bottom to top
      const allEntries = await Promise.all([...layers].reverse().map((layer) => layer.getAll()));

      // Merge entries, keeping the last occurrence (from top layers)
      const mergedMap = new Map<T[K], T>();

      for (const entries of allEntries) {
        for (const entry of entries) {
          mergedMap.set(entry[keyField], entry);
        }
      }

      return Array.from(mergedMap.values());
    },

    /**
     * Streams all entries from all layers using a snapshot of keys.
     * Uses getKeys() to capture a consistent snapshot, then streams entries
     * by checking layers top-down for each key.
     *
     * @returns {AsyncIterableIterator<T>} Asynchronous iterator with the entries
     */
    async *streamAll(): AsyncIterableIterator<T> {
      // Get all unique keys from all layers (snapshot in time)
      const allKeys = await this.getKeys();

      // For each key, fetch the entry from layers top-down
      for (const key of allKeys) {
        const entry = await this.get(key);
        if (entry !== null) {
          yield entry;
        }
      }
    },

    /**
     * Retrieves all unique keys from all layers.
     * Returns a merged list of keys with duplicates removed (since the same key
     * may exist in multiple layers).
     *
     * @returns {Promise<T[K][]>} Promise that resolves to an array of all unique keys
     */
    async getKeys(): Promise<T[K][]> {
      return Array.from(new Set((await Promise.all(layers.map((layer) => layer.getKeys()))).flat()));
    },

    /**
     * Updates an existing entry in all layers.
     * If the entry exists in a layer, it updates; if not, it creates (upsert).
     * Throws if the key doesn't exist in any layer.
     *
     * @param {T} entry - The entry with updated values
     * @returns {Promise<void>} Promise that resolves when the entry is updated in all layers
     * @throws {KeyNotFoundError} If the entry's key does not exist in any layer
     */
    async update(entry: T): Promise<void> {
      // Check if exists in any layer first
      if (!(await this.exists(entry[keyField]))) {
        throw new KeyNotFoundError(`Key "${entry[keyField]}" not found`);
      }

      // Update or create in all layers (upsert for cache population)
      await Promise.all(
        layers.map(async (layer) => {
          if (await layer.exists(entry[keyField])) {
            return layer.update(entry);
          }
          return layer.create(entry);
        }),
      );
    },

    /**
     * Deletes an entry from all layers.
     * Throws if the key doesn't exist in any layer.
     *
     * @param {T[K]} key - The key of the entry to delete
     * @returns {Promise<void>} Promise that resolves when the entry is deleted from all layers
     * @throws {KeyNotFoundError} If the key does not exist in any layer
     */
    async delete(key: T[K]): Promise<void> {
      // Check if exists in any layer first
      if (!(await this.exists(key))) {
        throw new KeyNotFoundError(`Key "${key}" not found`);
      }

      // Delete from all layers that have it
      await Promise.all(
        layers.map(async (layer) => {
          if (await layer.exists(key)) {
            return layer.delete(key);
          }
        }),
      );
    },
  };
}
