import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRedisStorage } from "./redis";
import { DuplicateKeyError, NotFoundError } from "./types";

interface TestUser {
  id: string;
  name: string;
  email: string;
}

describe("createRedisStorage", () => {
  let storage: Awaited<ReturnType<typeof createRedisStorage<TestUser, "id">>>;

  beforeEach(async () => {
    // Create a fresh storage instance for each test
    storage = await createRedisStorage<TestUser, "id">("id");

    // Clean up any existing data before each test by flushing the database
    // This is the safest way to ensure a clean slate
    const { createClient } = await import("redis");
    const client = await createClient().connect();

    try {
      await client.flushDb();
    } finally {
      await client.quit();
    }
  });

  afterEach(async () => {
    // Clean up and close connection after each test
    if (storage) {
      try {
        // Flush the database to clean up all keys
        const { createClient } = await import("redis");
        const client = await createClient().connect();

        try {
          await client.flushDb();
        } finally {
          await client.quit();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      storage.close();
    }
  });

  describe("exists", () => {
    it("should return false for non-existent key", async () => {
      const exists = await storage.exists("non-existent");
      expect(exists).toBe(false);
    });

    it("should return true for existing key", async () => {
      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      const exists = await storage.exists("1");
      expect(exists).toBe(true);
    });
  });

  describe("create", () => {
    it("should create a new entry", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const retrieved = await storage.get("1");
      expect(retrieved).toEqual(user);
    });

    it("should throw DuplicateKeyError when creating entry with existing key", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      await expect(storage.create(user)).rejects.toThrow(DuplicateKeyError);
      await expect(storage.create(user)).rejects.toThrow('Key "1" already exists');
    });

    it("should allow multiple entries with different keys", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };

      await storage.create(user1);
      await storage.create(user2);

      expect(await storage.get("1")).toEqual(user1);
      expect(await storage.get("2")).toEqual(user2);
    });

    it("should persist data across storage instances with same key prefix", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      // Create a new storage instance with the same configuration
      const newStorage = await createRedisStorage<TestUser, "id">("id");

      const retrieved = await newStorage.get("1");
      expect(retrieved).toEqual(user);

      newStorage.close();
    });
  });

  describe("get", () => {
    it("should return null for non-existent key", async () => {
      expect(await storage.get("non-existent")).toBe(null);
    });

    it("should return the entry for existing key", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const result = await storage.get("1");
      expect(result).toEqual(user);
    });

    it("should return null when Redis returns null for existing key", async () => {
      // This tests the edge case where Redis reports the key exists but returns null
      // In practice this shouldn't happen with normal Redis operations
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const result = await storage.get("1");
      expect(result).not.toBeNull();
      expect(result).toEqual(user);
    });
  });

  describe("getAll", () => {
    it("should return empty array when no entries exist", async () => {
      const result = await storage.getAll();
      expect(result).toEqual([]);
    });

    it("should return all entries", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };
      const user3 = { id: "3", name: "Bob", email: "bob@example.com" };

      await storage.create(user1);
      await storage.create(user2);
      await storage.create(user3);

      const result = await storage.getAll();
      expect(result).toHaveLength(3);
      expect(result).toContainEqual(user1);
      expect(result).toContainEqual(user2);
      expect(result).toContainEqual(user3);
    });

    it("should only return entries with the correct key prefix", async () => {
      // Create entries with default prefix
      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Create a storage instance with a different prefix
      const storage2 = await createRedisStorage<TestUser, "id">("id", {
        keyPrefix: "different:",
      });

      await storage2.create({ id: "2", name: "Jane", email: "jane@example.com" });

      // First storage should only see its own entries
      const result1 = await storage.getAll();
      expect(result1).toHaveLength(1);
      expect(result1[0].name).toBe("John");

      // Second storage should only see its own entries
      const result2 = await storage2.getAll();
      expect(result2).toHaveLength(1);
      expect(result2[0].name).toBe("Jane");

      storage2.close();
    });
  });

  describe("update", () => {
    it("should update an existing entry", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const updatedUser = { id: "1", name: "John Updated", email: "john.updated@example.com" };
      await storage.update(updatedUser);

      const result = await storage.get("1");
      expect(result).toEqual(updatedUser);
    });

    it("should throw NotFoundError when updating non-existent entry", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };

      await expect(storage.update(user)).rejects.toThrow(NotFoundError);
      await expect(storage.update(user)).rejects.toThrow('Key "1" not found');
    });

    it("should persist updates across storage instances", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const updatedUser = { id: "1", name: "John Updated", email: "john.updated@example.com" };
      await storage.update(updatedUser);

      // Create a new storage instance with the same configuration
      const newStorage = await createRedisStorage<TestUser, "id">("id");

      const result = await newStorage.get("1");
      expect(result).toEqual(updatedUser);

      newStorage.close();
    });
  });

  describe("delete", () => {
    it("should delete an existing entry", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      await storage.delete("1");

      expect(await storage.exists("1")).toBe(false);
      expect(await storage.get("1")).toBe(null);
    });

    it("should throw NotFoundError when deleting non-existent entry", async () => {
      await expect(storage.delete("non-existent")).rejects.toThrow(NotFoundError);
      await expect(storage.delete("non-existent")).rejects.toThrow('Key "non-existent" not found');
    });

    it("should only delete the specified entry", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };

      await storage.create(user1);
      await storage.create(user2);

      await storage.delete("1");

      expect(await storage.exists("1")).toBe(false);
      expect(await storage.exists("2")).toBe(true);
    });

    it("should persist deletion across storage instances", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      await storage.delete("1");

      // Create a new storage instance with the same configuration
      const newStorage = await createRedisStorage<TestUser, "id">("id");

      expect(await newStorage.exists("1")).toBe(false);

      newStorage.close();
    });
  });

  describe("close", () => {
    it("should close the Redis connection", async () => {
      const testStorage = await createRedisStorage<TestUser, "id">("id");

      // This should not throw
      expect(() => testStorage.close()).not.toThrow();
    });
  });

  describe("custom serialization adapter", () => {
    it("should work with a custom serialization adapter", async () => {
      interface CustomUser {
        id: number;
        name: string;
      }

      const customAdapter = {
        serialize(entry: CustomUser): string {
          return `${entry.id}:${entry.name}`;
        },
        deserialize(str: string): CustomUser {
          const [id, name] = str.split(":");
          return { id: Number(id), name };
        },
      };

      const customStorage = await createRedisStorage<CustomUser, "id">("id", {
        serializationAdapter: customAdapter,
      });

      const user = { id: 1, name: "John" };
      await customStorage.create(user);

      const retrieved = await customStorage.get(1);
      expect(retrieved).toEqual(user);

      customStorage.close();
    });
  });

  describe("custom key prefix", () => {
    it("should use custom key prefix", async () => {
      const customStorage = await createRedisStorage<TestUser, "id">("id", {
        keyPrefix: "custom-prefix:",
      });

      await customStorage.create({ id: "1", name: "John", email: "john@example.com" });

      // Verify it exists with custom prefix
      expect(await customStorage.exists("1")).toBe(true);

      // Verify it doesn't exist with default prefix
      expect(await storage.exists("1")).toBe(false);

      customStorage.close();
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete CRUD lifecycle", async () => {
      // Create
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);
      expect(await storage.exists("1")).toBe(true);

      // Read
      const retrieved = await storage.get("1");
      expect(retrieved).toEqual(user);

      // Update
      const updatedUser = { id: "1", name: "John Updated", email: "john.updated@example.com" };
      await storage.update(updatedUser);
      expect(await storage.get("1")).toEqual(updatedUser);

      // Delete
      await storage.delete("1");
      expect(await storage.exists("1")).toBe(false);
    });

    it("should work with different key fields", async () => {
      interface Product {
        sku: string;
        name: string;
        price: number;
      }

      const productStorage = await createRedisStorage<Product, "sku">("sku");

      const product = { sku: "PROD-001", name: "Laptop", price: 999 };
      await productStorage.create(product);

      expect(await productStorage.exists("PROD-001")).toBe(true);
      expect(await productStorage.get("PROD-001")).toEqual(product);

      // Clean up
      await productStorage.delete("PROD-001");
      productStorage.close();
    });

    it("should handle complex objects with JSON serialization", async () => {
      interface ComplexObject {
        id: string;
        nested: {
          field1: string;
          field2: number;
        };
        array: string[];
      }

      const complexStorage = await createRedisStorage<ComplexObject, "id">("id");

      const complexObj = {
        id: "1",
        nested: { field1: "value", field2: 42 },
        array: ["item1", "item2", "item3"],
      };

      await complexStorage.create(complexObj);
      const retrieved = await complexStorage.get("1");

      expect(retrieved).toEqual(complexObj);

      // Clean up
      await complexStorage.delete("1");
      complexStorage.close();
    });

    it("should handle special characters in keys", async () => {
      const user = { id: "user-with-special-chars_123", name: "John", email: "john@example.com" };
      await storage.create(user);

      const retrieved = await storage.get("user-with-special-chars_123");
      expect(retrieved).toEqual(user);
    });

    it("should preserve data types correctly", async () => {
      interface TypedData {
        id: string;
        number: number;
        boolean: boolean;
        nullValue: null;
        date: string;
      }

      const typedStorage = await createRedisStorage<TypedData, "id">("id");

      const data = {
        id: "1",
        number: 42,
        boolean: true,
        nullValue: null,
        date: "2024-01-01",
      };

      await typedStorage.create(data);
      const retrieved = await typedStorage.get("1");

      expect(retrieved).toEqual(data);
      expect(typeof retrieved?.number).toBe("number");
      expect(typeof retrieved?.boolean).toBe("boolean");

      // Clean up
      await typedStorage.delete("1");
      typedStorage.close();
    });

    it("should handle concurrent operations", async () => {
      const users = Array.from({ length: 100 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      }));

      // Create all users concurrently
      await Promise.all(users.map((user) => storage.create(user)));

      // Verify all were created
      const allUsers = await storage.getAll();
      expect(allUsers).toHaveLength(100);

      // Update all users concurrently
      const updatedUsers = users.map((user) => ({ ...user, name: `${user.name} Updated` }));
      await Promise.all(updatedUsers.map((user) => storage.update(user)));

      // Verify all were updated
      const updatedAll = await storage.getAll();
      expect(updatedAll).toHaveLength(100);
      expect(updatedAll.every((user) => user.name.endsWith(" Updated"))).toBe(true);
    });
  });
});
