import { DuplicateKeyError, NotFoundError, type Storage } from "./types.js";

export function createMemoryStorage<T, K extends keyof T = keyof T>(keyField: K): Storage<T, K> {
  const data = new Map<T[K], T>();

  return {
    async exists(key: T[K]): Promise<boolean> {
      return data.has(key);
    },
    async create(entry: T): Promise<void> {
      if (data.has(entry[keyField])) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      data.set(entry[keyField], entry);
    },
    async get(key: T[K]): Promise<T | null> {
      return data.get(key) ?? null;
    },
    async getAll(): Promise<T[]> {
      return Array.from(data.values());
    },
    async update(entry: T): Promise<void> {
      if (!data.has(entry[keyField])) {
        throw new NotFoundError(`Key "${entry[keyField]}" not found`);
      }

      data.set(entry[keyField], entry);
    },
    async delete(key: T[K]): Promise<void> {
      if (!data.has(key)) {
        throw new NotFoundError(`Key "${key}" not found`);
      }

      data.delete(key);
    },
  };
}
