/**
 * Generic storage interface for CRUD operations on typed entities.
 *
 * @template T - The type of entity being stored
 * @template {keyof T} K - The key field of the entity (defaults to any key of T)
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
   */
  exists(key: T[K]): Promise<boolean>;

  /**
   * Creates a new entry in storage.
   *
   * @param {T} entry - The entry to create
   * @returns {Promise<void>} Promise that resolves when the entry is created
   * @throws {DuplicateKeyError} If an entry with the same key already exists
   */
  create(entry: T): Promise<void>;

  /**
   * Retrieves an entry by its key.
   *
   * @param {T[K]} key - The key of the entry to retrieve
   * @returns {Promise<T | null>} Promise that resolves to the entry if found, `null` otherwise
   */
  get(key: T[K]): Promise<T | null>;

  /**
   * Retrieves all entries from storage.
   *
   * @returns {Promise<T[]>} Promise that resolves to an array of all entries
   */
  getAll(): Promise<T[]>;

  /**
   * Returns an async generator to stream all entries from storage.
   *
   * @returns {AsyncIterableIterator<T>} Asynchronous iterator
   */
  streamAll(): AsyncIterableIterator<T>;

  /**
   * Retrieves all keys from storage.
   *
   * @returns {Promise<T[K][]>} Promise that resolves to an array of all keys
   */
  getKeys(): Promise<T[K][]>;

  /**
   * Updates an existing entry in storage.
   *
   * @param {T} entry - The entry with updated values
   * @returns {Promise<void>} Promise that resolves when the entry is updated
   * @throws {KeyNotFoundError} If the entry's key does not exist
   */
  update(entry: T): Promise<void>;

  /**
   * Deletes an entry from storage.
   *
   * @param {T[K]} key - The key of the entry to delete
   * @returns {Promise<void>} Promise that resolves when the entry is deleted
   * @throws {KeyNotFoundError} If the key does not exist in storage
   */
  delete(key: T[K]): Promise<void>;
}

/**
 * Adapter interface for serializing and deserializing entities.
 *
 * @template T - The type of entity to serialize/deserialize
 * @template F - The serialized type
 */
export interface SerializationAdapter<T, F = any> {
  /**
   * Serializes an entity to a string.
   *
   * @param {T} entry - The entry to serialize
   * @returns {F} The serialized string representation of the entry
   */
  serialize(entry: T): F;

  /**
   * Deserializes a string back to an entity.
   *
   * @param {F} data - The string to deserialize
   * @returns {T} The deserialized entity
   */
  deserialize(data: F): T;
}

/**
 * Interface for key coercion functions to handle type conversions between
 * storage format (strings) and application format (any type).
 *
 * @template T - The type of entity
 * @template {keyof T} K - The key field of the entity
 */
export interface KeyCoercion<T, K extends keyof T> {
  /**
   * Convert a key from storage format (typically string) to application format.
   *
   * @param {string} rawKey - The raw key from storage
   * @returns {T[K]} The key in the application's expected type
   */
  keyFromStorage?: (rawKey: string) => T[K];
}

/**
 * Error thrown when attempting to create an entry with a duplicate key.
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
