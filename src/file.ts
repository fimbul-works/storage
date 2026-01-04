import { existsSync, mkdirSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DuplicateKeyError, NotFoundError, type SerializationAdapter, type Storage } from "./types.js";

export interface FileAdapter<T = any, K extends keyof T = keyof T> extends SerializationAdapter<T> {
  encoding: BufferEncoding;
  fileName(key: T[K]): string;
}

export const jsonFileAdapter: FileAdapter = {
  encoding: "utf-8",
  fileName<K>(key: K): string {
    return `${key}.json`;
  },
  serialize<T>(entry: T): string {
    return JSON.stringify(entry);
  },
  deserialize<T>(str: string): T {
    return JSON.parse(str);
  },
};

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
    async exists(key: T[K]): Promise<boolean> {
      return existsSync(filePath(key));
    },
    async create(entry: T): Promise<void> {
      const fileName = filePath(entry[keyField]);

      if (existsSync(fileName)) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      await writeFile(fileName, adapter.serialize(entry));
    },
    async get(key: T[K]): Promise<T | null> {
      const fileName = filePath(key);

      if (!existsSync(fileName)) {
        return null;
      }

      return adapter.deserialize(await readFile(fileName, adapter.encoding));
    },
    async getAll(): Promise<T[]> {
      const files = await readdir(path);

      return (await Promise.all(files.map((file) => readFile(join(path, file), "utf-8")))).map((data) =>
        adapter.deserialize(data),
      ) as T[];
    },
    async update(entry: T): Promise<void> {
      const fileName = filePath(entry[keyField]);

      if (!existsSync(fileName)) {
        throw new NotFoundError(`Key "${entry[keyField]}" not found`);
      }

      await writeFile(fileName, adapter.serialize(entry));
    },
    async delete(key: T[K]): Promise<void> {
      const fileName = filePath(key);

      if (!existsSync(fileName)) {
        throw new NotFoundError(`Key "${key}" not found`);
      }

      await rm(fileName);
    },
  };
}
