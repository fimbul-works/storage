import { type RedisArgument, createClient } from "redis";
import { DuplicateKeyError, NotFoundError, type SerializationAdapter, type Storage } from "./types.js";

export interface RedisStorage<T, K extends keyof T> extends Storage<T, K> {
  close(): void;
}

export interface RedisStorageOptions<T> {
  url?: string;
  serializationAdapter?: SerializationAdapter<T>;
  keyPrefix?: string;
}

export const jsonSerializationAdapter = {
  serialize<T>(entry: T): string {
    return JSON.stringify(entry);
  },
  deserialize<T>(str: string): T {
    return JSON.parse(str);
  },
};

export async function createRedisStorage<T, K extends keyof T>(
  keyField: K,
  options: RedisStorageOptions<T> = {},
): Promise<RedisStorage<T, K>> {
  const { url, serializationAdapter = jsonSerializationAdapter, keyPrefix = `${String(keyField)}:` } = options;

  const client = await createClient({
    url,
  })
    .on("error", (err) => console.error("Redis Client Error", err))
    .connect();

  const makeKey = (key: T[K]): RedisArgument => `${keyPrefix}${key}`;

  return {
    async exists(key: T[K]): Promise<boolean> {
      return (await client.exists(makeKey(key))) === 1;
    },
    async create(entry: T): Promise<void> {
      const redisKey = makeKey(entry[keyField]);

      if ((await client.exists(redisKey)) === 1) {
        throw new DuplicateKeyError(`Key "${entry[keyField]}" already exists`);
      }

      await client.set(redisKey, serializationAdapter.serialize(entry));
    },
    async get(key: T[K]): Promise<T | null> {
      const redisKey = makeKey(key);

      if (!(await client.exists(redisKey))) {
        throw new NotFoundError(`Key "${key}" not found`);
      }

      const data = await client.get(redisKey);
      if (data === null) {
        return null;
      }

      return serializationAdapter.deserialize(data);
    },
    async getAll(): Promise<T[]> {
      let result: T[] = [];

      for await (const keys of client.scanIterator({
        TYPE: "STRING",
        MATCH: `${keyPrefix}*`,
      })) {
        if (!Array.isArray(keys) || keys.length === 0) {
          continue;
        }

        const entries = await client.mGet(keys);

        if (entries === null) {
          continue;
        }

        result = [
          ...result,
          ...entries.filter((e): e is string => e !== null).map((entry) => serializationAdapter.deserialize(entry)),
        ];
      }

      return result;
    },
    async update(entry: T): Promise<void> {
      const redisKey = makeKey(entry[keyField]);

      if (!(await client.exists(redisKey))) {
        throw new NotFoundError(`Key "${entry[keyField]}" not found`);
      }

      await client.set(redisKey, serializationAdapter.serialize(entry));
    },
    async delete(key: T[K]): Promise<void> {
      const redisKey = makeKey(key);

      if (!(await client.exists(redisKey))) {
        throw new NotFoundError(`Key "${key}" not found`);
      }

      await client.del(redisKey);
    },
    close(): void {
      client.close();
    },
  };
}
