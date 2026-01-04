export interface Storage<T = any, K extends keyof T = keyof T> {
  exists(key: T[K]): Promise<boolean>;
  create(entry: T): Promise<void>;
  get(key: T[K]): Promise<T | null>;
  getAll(): Promise<T[]>;
  update(entry: T): Promise<void>;
  delete(key: T[K]): Promise<void>;
}

export interface SerializationAdapter<T = any> {
  serialize(entry: T): string;
  deserialize(str: string): T;
}

export class DuplicateKeyError extends Error {}

export class NotFoundError extends Error {}
