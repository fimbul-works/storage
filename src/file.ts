import { existsSync, mkdirSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonSerializationAdapter } from "./serialization.js";
import { DuplicateKeyError, NotFoundError, type SerializationAdapter, type Storage } from "./types.js";

/**
 * Adapter interface for file-based storage with custom serialization and file naming.
 *
 * @template T - The type of entity to serialize/deserialize
 * @template {keyof T} K - The key field of the entity
 *
 * @example
 * ```typescript
 * const csvAdapter: FileAdapter<User, "id"> = {
 *   encoding: "utf-8",
 *   fileName(key) {
 *     return `user_${key}.csv`;
 *   },
 *   serialize(user) {
 *   return `${user.id},${user.name},${user.email}`;
 * },
 *   deserialize(str) {
 *   const [id, name, email] = str.split(",");
 *   return { id, name, email };
 * },
 * };
 * ```
 */
export interface FileAdapter<T = any, K extends keyof T = keyof T> extends SerializationAdapter<T> {
  /**
   * The character encoding to use for reading/writing files.
   */
  encoding: BufferEncoding;

  /**
   * Generates a filename for a given key.
   *
   * @param {T[K]} key - The key to generate a filename for
   * @returns {string} The filename to use for storing the entry
   */
  fileName(key: T[K]): string;
}

/**
 * Default JSON file adapter for serializing entities as JSON files.
 *
 * @example
 * ```typescript
 * const storage = createFileStorage("/tmp/users", "id", jsonFileAdapter);
 * await storage.create({ id: "1", name: "John" });
 * // Creates file: /tmp/users/1.json
 * ```
 */
export const jsonFileAdapter: FileAdapter = {
  encoding: "utf-8",
  fileName<K>(key: K): string {
    return `${key}.json`;
  },
  ...jsonSerializationAdapter,
};

/**
 * Creates a file-based storage implementation where each entry is stored as a separate file.
 * The directory will be created automatically if it doesn't exist.
 * Each entry is stored as a separate file named according to the adapter's fileName function.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 * @param {string} path - The directory path where files will be stored
 * @param {K} keyField - The field to use as the unique key
 * @param {FileAdapter} adapter - The file adapter to use for serialization (defaults to JSON)
 * @returns {Storage<T, K>} A Storage implementation backed by the filesystem
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * const storage = createFileStorage<User, "id">("./data/users", "id");
 * await storage.create({ id: "1", name: "John", email: "john@example.com" });
 * // Creates file: ./data/users/1.json
 * ```
 */
export function createFileStorage<T, K extends keyof T = keyof T>(
  path: string,
  keyField: K,
  adapter: FileAdapter = jsonFileAdapter,
): Storage<T, K> {
  // Create directory if no found
  if (!existsSync(path)) {
    mkdirSync(path, {
      recursive: true,
    });
  }

  const filePath = (key: T[K]) => join(path, adapter.fileName(key));

  return {
    /**
     * Checks if a file exists for the given key.
     *
     * @param {T[K]} key - The key to check for existence
     * @returns {Promise<boolean>} Promise that resolves to `true` if the file exists, `false` otherwise
     */
    async exists(key: T[K]): Promise<boolean> {
      return existsSync(filePath(key));
    },

    /**
     * Creates a new file for the entry.
     *
     * @param {T} entry - The entry to create
     * @returns {Promise<void>} Promise that resolves when the entry is created
     * @throws {DuplicateKeyError} If an entry with the same key already exists
     */
    async create(entry: T): Promise<void> {
      const fileName = filePath(entry[keyField]);

      if (existsSync(fileName)) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      await writeFile(fileName, adapter.serialize(entry));
    },

    /**
     * Retrieves an entry from its file.
     *
     * @param {T[K]} key - The key of the entry to retrieve
     * @returns {Promise<T | null>} Promise that resolves to the entry if found, `null` otherwise
     */
    async get(key: T[K]): Promise<T | null> {
      const fileName = filePath(key);

      if (!existsSync(fileName)) {
        return null;
      }

      return adapter.deserialize(await readFile(fileName, adapter.encoding));
    },

    /**
     * Retrieves all entries by reading all files in the directory.
     *
     * @returns {Promise<T[]>} Promise that resolves to an array of all entries
     */
    async getAll(): Promise<T[]> {
      const files = await readdir(path);

      return (await Promise.all(files.map((file) => readFile(join(path, file), "utf-8")))).map((data) =>
        adapter.deserialize(data),
      ) as T[];
    },

    /**
     * Updates an existing file for the entry.
     *
     * @param {T} entry - The entry with updated values
     * @returns {Promise<void>} Promise that resolves when the entry is updated
     * @throws {NotFoundError} If the entry's key does not exist
     */
    async update(entry: T): Promise<void> {
      const fileName = filePath(entry[keyField]);

      if (!existsSync(fileName)) {
        throw new NotFoundError(`Key "${entry[keyField]}" not found`);
      }

      await writeFile(fileName, adapter.serialize(entry));
    },

    /**
     * Deletes the file for the given key.
     *
     * @param {T[K]} key - The key of the entry to delete
     * @returns {Promise<void>} Promise that resolves when the entry is deleted
     * @throws {NotFoundError} If the key does not exist
     */
    async delete(key: T[K]): Promise<void> {
      const fileName = filePath(key);

      if (!existsSync(fileName)) {
        throw new NotFoundError(`Key "${key}" not found`);
      }

      await rm(fileName);
    },
  };
}
