import { existsSync, mkdirSync } from "node:fs";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonSerializationAdapter } from "./serialization.js";
import {
  DuplicateKeyError,
  type KeyCoercion,
  KeyNotFoundError,
  type SerializationAdapter,
  type Storage,
} from "./types.js";

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
 * Configuration options for file-based storage.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 *
 * @example
 * ```typescript
 * const options: FileStorageOptions<User, "id"> = {
 *   path: "./data/users",
 *   adapter: customFileAdapter,
 *   keyFromStorage: (raw) => Number.parseInt(raw, 10),
 * };
 * ```
 */
export interface FileStorageOptions<T, K extends keyof T = keyof T> extends KeyCoercion<T, K> {
  /**
   * The directory path where files will be stored.
   * The directory will be created automatically if it doesn't exist.
   */
  path: string;

  /**
   * The file adapter to use for serialization and file naming.
   * @defaults to JSON file adapter
   */
  adapter?: FileAdapter<T, K>;
}

/**
 * Creates a file-based storage implementation where each entry is stored as a separate file.
 * The directory will be created automatically if it doesn't exist.
 * Each entry is stored as a separate file named according to the adapter's fileName function.
 *
 * @template T - The type of entity to store
 * @template {keyof T} K - The key field of the entity
 * @param {K} keyField - The field to use as the unique key
 * @param {FileStorageOptions} options - Configuration options (path is required)
 * @returns {Storage<T, K>} A Storage implementation backed by the filesystem
 *
 * @example
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * const storage = createFileStorage<User, "id">("id", {
 *   path: "./data/users",
 *   keyFromStorage: (raw) => Number.parseInt(raw, 10),
 * });
 * await storage.create({ id: 1, name: "John", email: "john@example.com" });
 * // Creates file: ./data/users/1.json
 * await storage.getKeys(); // Returns [1, 2, 3] as numbers
 * ```
 */
export function createFileStorage<T, K extends keyof T = keyof T>(
  keyField: K,
  options: FileStorageOptions<T, K>,
): Storage<T, K> {
  const { path, adapter = jsonFileAdapter, keyFromStorage = (raw: string) => raw as T[K] } = options;

  // Create directory if no found
  if (!existsSync(path)) {
    mkdirSync(path, {
      recursive: true,
    });
  }

  const filePath = (key: T[K]) => join(path, adapter.fileName(key));

  // Helper function to create a regex pattern that matches only files for this adapter
  const createFilePattern = (): RegExp => {
    // Call fileName with a placeholder to extract the key position
    const wildcardPattern = adapter.fileName("___KEY___" as any);

    // Escape special regex characters in the pattern
    const escapedPattern = wildcardPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

    // Replace our placeholder with a capture group
    const regexPattern = `^${escapedPattern.replace("___KEY___", "(.*)")}$`;
    return new RegExp(regexPattern);
  };

  const filePattern = createFilePattern();

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

      // Use atomic writes
      const tempName = `${fileName}.tmp`;
      try {
        await writeFile(tempName, adapter.serialize(entry));
        await rename(tempName, fileName);
      } catch (err) {
        // Clean up temp file if the write fails before the rename
        if (existsSync(tempName)) {
          await rm(tempName);
        }
        throw err;
      }
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

      // Filter files to only those matching the adapter's pattern
      const matchingFiles = files.filter((file) => filePattern.test(file));

      return (await Promise.all(matchingFiles.map((file) => readFile(join(path, file), adapter.encoding)))).map(
        (data) => adapter.deserialize(data),
      ) as T[];
    },

    /**
     * Stream all entries by reading all files in the directoy with an asynchronous iterator.
     * Only streams files that match the adapter's fileName pattern.
     *
     * @returns {AsyncIterableIterator<T>} Asynchronous iterator with the entries
     */
    async *streamAll(): AsyncIterableIterator<T> {
      const files = await readdir(path);

      // Filter files to only those matching the adapter's pattern
      const matchingFiles = files.filter((file) => filePattern.test(file));

      for (const file of matchingFiles) {
        yield adapter.deserialize(await readFile(join(path, file), adapter.encoding));
      }
    },

    /**
     * Retrieves all keys by listing all files in the directory and extracting keys from filenames.
     *
     * @returns {Promise<T[K][]>} Promise that resolves to an array of all keys
     */
    async getKeys(): Promise<T[K][]> {
      const files = await readdir(path);

      // Create a regex pattern from the fileName function
      // We call fileName with a placeholder to extract the key position
      const wildcardPattern = adapter.fileName("___KEY___" as any);

      // Escape special regex characters in the pattern
      const escapedPattern = wildcardPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

      // Replace our placeholder with a capture group
      const regexPattern = `^${escapedPattern.replace("___KEY___", "(.*)")}$`;
      const keyRegex = new RegExp(regexPattern);

      const keys: T[K][] = [];
      for (const file of files) {
        const match = file.match(keyRegex);
        if (match?.[1]) {
          // Apply coercion if provided
          keys.push(keyFromStorage(match[1]));
        }
      }
      return keys;
    },

    /**
     * Updates an existing file for the entry.
     *
     * @param {T} entry - The entry with updated values
     * @returns {Promise<void>} Promise that resolves when the entry is updated
     * @throws {KeyNotFoundError} If the entry's key does not exist
     */
    async update(entry: T): Promise<void> {
      const fileName = filePath(entry[keyField]);

      if (!existsSync(fileName)) {
        throw new KeyNotFoundError(`Key "${entry[keyField]}" not found`);
      }

      // Use atomic writes
      const tempName = `${fileName}.tmp`;
      try {
        await writeFile(tempName, adapter.serialize(entry));
        await rename(tempName, fileName);
      } catch (err) {
        // Clean up temp file if the write fails before the rename
        if (existsSync(tempName)) {
          await rm(tempName);
        }
        throw err;
      }
    },

    /**
     * Deletes the file for the given key.
     *
     * @param {T[K]} key - The key of the entry to delete
     * @returns {Promise<void>} Promise that resolves when the entry is deleted
     * @throws {KeyNotFoundError} If the key does not exist
     */
    async delete(key: T[K]): Promise<void> {
      const fileName = filePath(key);

      if (!existsSync(fileName)) {
        throw new KeyNotFoundError(`Key "${key}" not found`);
      }

      await rm(fileName);
    },
  };
}
