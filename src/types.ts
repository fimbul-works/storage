/**
 * Generic storage interface for CRUD operations on typed entities.
 *
 * @template T - The type of entity being stored
 * @template {keyof T} K - The key field of the entity (defaults to any key of T)
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * const storage: Storage<User, "id"> = createMemoryStorage("id");
 * await storage.create({ id: "1", name: "John", email: "john@example.com" });
 * const user = await storage.get("1");
 * ```
 */
export interface Storage<T, K extends keyof T = keyof T> {
  /**
   * Read-only field that is used as the key.
   * @type {K}
   */
  readonly keyField: K;

  /**
   * Checks if an entry with the given key exists.
   *
   * @param {T[K]} key - The key to check for existence
   * @returns {Promise<boolean>} Promise that resolves to `true` if the key exists, `false` otherwise
   *
   * @example
   * ```typescript
   * const exists = await storage.exists("user-123");
   * if (exists) {
   *   console.log("User found");
   * }
   * ```
   */
  exists(key: T[K]): Promise<boolean>;

  /**
   * Creates a new entry in storage.
   *
   * @param {T} entry - The entry to create
   * @returns {Promise<void>} Promise that resolves when the entry is created
   * @throws {DuplicateKeyError} If an entry with the same key already exists
   *
   * @example
   * ```typescript
   * try {
   *   await storage.create({ id: "1", name: "John" });
   * } catch (error) {
   *   if (error instanceof DuplicateKeyError) {
   *     console.error("Entry already exists");
   *   }
   * }
   * ```
   */
  create(entry: T): Promise<void>;

  /**
   * Retrieves an entry by its key.
   *
   * @param {T[K]} key - The key of the entry to retrieve
   * @returns {Promise<T | null>} Promise that resolves to the entry if found, `null` otherwise
   *
   * @example
   * ```typescript
   * const user = await storage.get("user-123");
   * if (user) {
   *   console.log(user.name);
   * } else {
   *   console.log("User not found");
   * }
   * ```
   */
  get(key: T[K]): Promise<T | null>;

  /**
   * Retrieves all entries from storage.
   *
   * @returns {Promise<T[]>} Promise that resolves to an array of all entries
   *
   * @example
   * ```typescript
   * const allUsers = await storage.getAll();
   * console.log(`Found ${allUsers.length} users`);
   * ```
   */
  getAll(): Promise<T[]>;

  /**
   * Returns an async generator to stream all entries from storage.
   *
   * @returns {AsyncIterableIterator<T>} Asynchronous iterator
   *
   * @example
   * ```typescript
   * const allUsers = await storage.getAll();
   * console.log(`Found ${allUsers.length} users`);
   * ```
   */
  streamAll(): AsyncIterableIterator<T>;

  /**
   * Retrieves all keys from storage.
   *
   * @returns {Promise<T[K][]>} Promise that resolves to an array of all keys
   *
   * @example
   * ```typescript
   * const allKeys = await storage.getKeys();
   * console.log(`Found ${allKeys.length} keys`);
   * ```
   */
  getKeys(): Promise<T[K][]>;

  /**
   * Updates an existing entry in storage.
   *
   * @param {T} entry - The entry with updated values
   * @returns {Promise<void>} Promise that resolves when the entry is updated
   * @throws {KeyNotFoundError} If the entry's key does not exist
   *
   * @example
   * ```typescript
   * try {
   *   await storage.update({ id: "1", name: "John Updated" });
   * } catch (error) {
   *   if (error instanceof NotFoundError) {
   *     console.error("Entry not found");
   *   }
   * }
   * ```
   */
  update(entry: T): Promise<void>;

  /**
   * Deletes an entry from storage.
   *
   * @param {T[K]} key - The key of the entry to delete
   * @returns {Promise<void>} Promise that resolves when the entry is deleted
   * @throws {KeyNotFoundError} If the key does not exist in storage
   *
   * @example
   * ```typescript
   * try {
   *   await storage.delete("user-123");
   *   console.log("User deleted");
   * } catch (error) {
   *   if (error instanceof NotFoundError) {
   *     console.error("User not found");
   *   }
   * }
   * ```
   */
  delete(key: T[K]): Promise<void>;
}

/**
 * Adapter interface for serializing and deserializing entities.
 *
 * @template T - The type of entity to serialize/deserialize
 *
 * @example
 * ```typescript
 * const jsonAdapter: SerializationAdapter<User> = {
 *   serialize(user) {
 *     return JSON.stringify(user);
 *   },
 *   deserialize(str) {
 *     return JSON.parse(str);
 *   },
 * };
 * ```
 */
export interface SerializationAdapter<T = any> {
  /**
   * Serializes an entity to a string.
   *
   * @param {T} entry - The entry to serialize
   * @returns {string} The serialized string representation of the entry
   */
  serialize(entry: T): string;

  /**
   * Deserializes a string back to an entity.
   *
   * @param {string} str - The string to deserialize
   * @returns {T} The deserialized entity
   */
  deserialize(str: string): T;
}

/**
 * Interface for key coercion functions to handle type conversions between
 * storage format (strings) and application format (any type).
 *
 * @template T - The type of entity
 * @template {keyof T} K - The key field of the entity
 *
 * @example
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 * }
 *
 * const coercion: KeyCoercion<User, "id"> = {
 *   keyFromStorage: (raw) => Number.parseInt(raw, 10),
 * };
 * ```
 */
export interface KeyCoercion<T, K extends keyof T> {
  /**
   * Convert a key from storage format (typically string) to application format.
   *
   * @param {string} rawKey - The raw key from storage
   * @returns {T[K]} The key in the application's expected type
   *
   * @example
   * ```typescript
   * keyFromStorage: (raw) => Number.parseInt(raw, 10) // "123" -> 123
   * ```
   */
  keyFromStorage?: (rawKey: string) => T[K];
}

/**
 * Error thrown when attempting to create an entry with a duplicate key.
 *
 * @example
 * ```typescript
 * try {
 *   await storage.create({ id: "1", name: "John" });
 *   await storage.create({ id: "1", name: "Jane" }); // Throws DuplicateKeyError
 * } catch (error) {
 *   if (error instanceof DuplicateKeyError) {
 *     console.error("An entry with this key already exists");
 *   }
 * }
 * ```
 */
export class DuplicateKeyError extends Error {
  /**
   * Creates a new DuplicateKeyError.
   *
   * @param message - Error message describing the duplicate key
   */
  constructor(message?: string) {
    super(message);
    this.name = "DuplicateKeyError";
  }
}

/**
 * Error thrown when attempting to access, update, or delete a non-existent entry.
 *
 * @example
 * ```typescript
 * try {
 *   await storage.get("non-existent"); // Throws NotFoundError in Redis
 *   await storage.update({ id: "non-existent", name: "John" }); // Throws NotFoundError
 *   await storage.delete("non-existent"); // Throws NotFoundError
 * } catch (error) {
 *   if (error instanceof KeyNotFoundError) {
 *     console.error("Entry not found");
 *   }
 * }
 * ```
 */
export class KeyNotFoundError extends Error {
  /**
   * Creates a new KeyNotFoundError.
   *
   * @param message - Error message describing the missing key
   */
  constructor(message?: string) {
    super(message);
    this.name = "KeyNotFoundError";
  }
}
