import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStorage } from "./memory";
import { DuplicateKeyError, KeyNotFoundError } from "./types";

interface TestUser {
  id: string;
  name: string;
  email: string;
}

describe("createMemoryStorage", () => {
  let storage = createMemoryStorage<TestUser, "id">("id");

  beforeEach(() => {
    // Create a fresh storage instance for each test
    storage = createMemoryStorage<TestUser, "id">("id");
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
  });

  describe("get", () => {
    it("should return null for non-existent key", async () => {
      const result = await storage.get("non-existent");
      expect(result).toBeNull();
    });

    it("should return the entry for existing key", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const result = await storage.get("1");
      expect(result).toEqual(user);
    });

    it("should return the stored entry", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      const retrieved = await storage.get("1");
      expect(retrieved).toEqual(user);
      expect(retrieved).toBe(user); // Same reference for in-memory storage
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

    it("should return entries as an array", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user1);

      const result = await storage.getAll();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe("streamAll", () => {
    it("should return empty iterator when no entries exist", async () => {
      const results: TestUser[] = [];
      for await (const entry of storage.streamAll()) {
        results.push(entry);
      }

      expect(results).toEqual([]);
    });

    it("should stream all entries", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };
      const user3 = { id: "3", name: "Bob", email: "bob@example.com" };

      await storage.create(user1);
      await storage.create(user2);
      await storage.create(user3);

      const results: TestUser[] = [];
      for await (const entry of storage.streamAll()) {
        results.push(entry);
      }

      expect(results).toHaveLength(3);
      expect(results).toContainEqual(user1);
      expect(results).toContainEqual(user2);
      expect(results).toContainEqual(user3);
    });

    it("should stream entries one at a time", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };

      await storage.create(user1);
      await storage.create(user2);

      const stream = storage.streamAll();
      const first = await stream.next();
      expect(first.done).toBe(false);
      expect(first.value).toBeDefined();

      const second = await stream.next();
      expect(second.done).toBe(false);
      expect(second.value).toBeDefined();

      const third = await stream.next();
      expect(third.done).toBe(true);
    });

    it("should return the same data as getAll but streamed", async () => {
      const users = [
        { id: "1", name: "John", email: "john@example.com" },
        { id: "2", name: "Jane", email: "jane@example.com" },
        { id: "3", name: "Bob", email: "bob@example.com" },
      ];

      for (const user of users) {
        await storage.create(user);
      }

      const allResults = await storage.getAll();
      const streamResults: TestUser[] = [];
      for await (const entry of storage.streamAll()) {
        streamResults.push(entry);
      }

      expect(streamResults).toHaveLength(allResults.length);
      expect(streamResults).toEqual(expect.arrayContaining(allResults));
      expect(allResults).toEqual(expect.arrayContaining(streamResults));
    });

    it("should handle large datasets efficiently", async () => {
      const users = Array.from({ length: 1000 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      }));

      for (const user of users) {
        await storage.create(user);
      }

      let count = 0;
      for await (const entry of storage.streamAll()) {
        count++;
        expect(entry).toBeDefined();
        expect(users).toContainEqual(entry);
      }

      expect(count).toBe(1000);
    });

    it("should allow early termination of streaming", async () => {
      const users = [
        { id: "1", name: "John", email: "john@example.com" },
        { id: "2", name: "Jane", email: "jane@example.com" },
        { id: "3", name: "Bob", email: "bob@example.com" },
        { id: "4", name: "Alice", email: "alice@example.com" },
        { id: "5", name: "Charlie", email: "charlie@example.com" },
      ];

      for (const user of users) {
        await storage.create(user);
      }

      let count = 0;
      const maxItems = 3;
      for await (const entry of storage.streamAll()) {
        count++;
        expect(entry).toBeDefined();
        if (count >= maxItems) {
          break; // Early termination
        }
      }

      expect(count).toBe(maxItems);
    });

    it("should work with for...of loops", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };

      await storage.create(user1);
      await storage.create(user2);

      const results: TestUser[] = [];
      for await (const user of storage.streamAll()) {
        results.push(user);
      }

      expect(results).toHaveLength(2);
    });

    it("should allow processing entries during streaming", async () => {
      const users = [
        { id: "1", name: "John", email: "john@example.com" },
        { id: "2", name: "Jane", email: "jane@example.com" },
        { id: "3", name: "Bob", email: "bob@example.com" },
      ];

      for (const user of users) {
        await storage.create(user);
      }

      const processedNames: string[] = [];
      for await (const entry of storage.streamAll()) {
        processedNames.push(entry.name.toUpperCase());
      }

      expect(processedNames).toEqual(["JOHN", "JANE", "BOB"]);
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

      await expect(storage.update(user)).rejects.toThrow(KeyNotFoundError);
      await expect(storage.update(user)).rejects.toThrow('Key "1" not found');
    });

    it("should not create a new entry if it doesn't exist", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };

      try {
        await storage.update(user);
      } catch (e) {
        // Expected to throw
      }

      expect(await storage.exists("1")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete an existing entry", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      await storage.delete("1");

      expect(await storage.exists("1")).toBe(false);
      expect(await storage.get("1")).toBeNull();
    });

    it("should throw NotFoundError when deleting non-existent entry", async () => {
      await expect(storage.delete("non-existent")).rejects.toThrow(KeyNotFoundError);
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

      const productStorage = createMemoryStorage<Product, "sku">("sku");

      const product = { sku: "PROD-001", name: "Laptop", price: 999 };
      await productStorage.create(product);

      expect(await productStorage.exists("PROD-001")).toBe(true);
      expect(await productStorage.get("PROD-001")).toEqual(product);
    });

    it("should handle complex objects", async () => {
      interface ComplexObject {
        id: string;
        nested: {
          field1: string;
          field2: number;
        };
        array: string[];
      }

      const complexStorage = createMemoryStorage<ComplexObject, "id">("id");

      const complexObj = {
        id: "1",
        nested: { field1: "value", field2: 42 },
        array: ["item1", "item2", "item3"],
      };

      await complexStorage.create(complexObj);
      const retrieved = await complexStorage.get("1");

      expect(retrieved).toEqual(complexObj);
    });
  });
});
