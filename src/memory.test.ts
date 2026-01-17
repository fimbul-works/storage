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

  describe("getKeys", () => {
    it("should return empty array when no entries exist", async () => {
      const keys = await storage.getKeys();
      expect(keys).toEqual([]);
    });

    it("should return all keys", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      const user2 = { id: "2", name: "Jane", email: "jane@example.com" };
      const user3 = { id: "3", name: "Bob", email: "bob@example.com" };

      await storage.create(user1);
      await storage.create(user2);
      await storage.create(user3);

      const keys = await storage.getKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("1");
      expect(keys).toContain("2");
      expect(keys).toContain("3");
    });

    it("should return keys as an array", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user1);

      const keys = await storage.getKeys();
      expect(Array.isArray(keys)).toBe(true);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe("1");
    });

    it("should return keys matching the entries from getAll", async () => {
      const users = [
        { id: "1", name: "John", email: "john@example.com" },
        { id: "2", name: "Jane", email: "jane@example.com" },
        { id: "3", name: "Bob", email: "bob@example.com" },
      ];

      for (const user of users) {
        await storage.create(user);
      }

      const allEntries = await storage.getAll();
      const allKeys = await storage.getKeys();

      expect(allKeys).toHaveLength(allEntries.length);
      expect(allKeys.sort()).toEqual(allEntries.map((u) => u.id).sort());
    });

    it("should handle large numbers of keys", async () => {
      const users = Array.from({ length: 1000 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      }));

      for (const user of users) {
        await storage.create(user);
      }

      const keys = await storage.getKeys();
      expect(keys).toHaveLength(1000);
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
      } catch (_e) {
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

  describe("with TTL (time-to-live)", () => {
    it("should create entries that expire after TTL", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Entry should exist immediately
      expect(await storage.exists("1")).toBe(true);
      expect(await storage.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });

      // Advance time by 500ms (still within TTL)
      mockTime.current = 500;
      expect(await storage.exists("1")).toBe(true);
      expect(await storage.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });

      // Advance time to exactly TTL (entry should now be expired)
      mockTime.current = 1000;
      expect(await storage.exists("1")).toBe(false);
      expect(await storage.get("1")).toBeNull();

      // Advance time past TTL
      mockTime.current = 1001;
      expect(await storage.exists("1")).toBe(false);
      expect(await storage.get("1")).toBeNull();
    });

    it("should update entries and reset TTL on update", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Advance time by 800ms
      mockTime.current = 800;

      // Update the entry
      await storage.update({ id: "1", name: "John Updated", email: "john.updated@example.com" });

      // Advance time by another 500ms (total 1300ms from creation)
      // But entry should still exist because TTL was reset on update
      mockTime.current = 1300;
      expect(await storage.exists("1")).toBe(true);
      expect(await storage.get("1")).toEqual({
        id: "1",
        name: "John Updated",
        email: "john.updated@example.com",
      });

      // Advance past the updated TTL (800 + 1000 = 1800)
      mockTime.current = 1801;
      expect(await storage.exists("1")).toBe(false);
    });

    it("should exclude expired entries from getAll", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      await storage.create({ id: "2", name: "Jane", email: "jane@example.com" });

      // Both entries should be present
      expect(await storage.getAll()).toHaveLength(2);

      // Advance time by 500ms and add a third entry
      mockTime.current = 500;
      await storage.create({ id: "3", name: "Bob", email: "bob@example.com" });
      expect(await storage.getAll()).toHaveLength(3);

      // Advance time to expire first two entries
      mockTime.current = 1100;

      const all = await storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual({ id: "3", name: "Bob", email: "bob@example.com" });
    });

    it("should exclude expired entries from getKeys", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      await storage.create({ id: "2", name: "Jane", email: "jane@example.com" });

      mockTime.current = 500;
      await storage.create({ id: "3", name: "Bob", email: "bob@example.com" });

      mockTime.current = 1100;

      const keys = await storage.getKeys();
      expect(keys).toEqual(["3"]);
    });

    it("should exclude expired entries from streamAll", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      await storage.create({ id: "2", name: "Jane", email: "jane@example.com" });

      mockTime.current = 500;
      await storage.create({ id: "3", name: "Bob", email: "bob@example.com" });

      mockTime.current = 1100;

      const results: TestUser[] = [];
      for await (const entry of storage.streamAll()) {
        results.push(entry);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ id: "3", name: "Bob", email: "bob@example.com" });
    });

    it("should not allow updates to expired entries", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Advance time past TTL
      mockTime.current = 1001;

      // Try to update the expired entry
      await expect(
        storage.update({ id: "1", name: "John Updated", email: "john.updated@example.com" }),
      ).rejects.toThrow(KeyNotFoundError);
      await expect(
        storage.update({ id: "1", name: "John Updated", email: "john.updated@example.com" }),
      ).rejects.toThrow('Key "1" not found');
    });

    it("should not allow deletion of expired entries", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Advance time past TTL
      mockTime.current = 1001;

      // Try to delete the expired entry
      await expect(storage.delete("1")).rejects.toThrow(KeyNotFoundError);
      await expect(storage.delete("1")).rejects.toThrow('Key "1" not found');
    });

    it("should not allow creating entries with expired keys", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Advance time past TTL
      mockTime.current = 1001;

      // Entry should be expired and cleaned up, so we can create a new one with the same key
      await storage.create({ id: "1", name: "Jane", email: "jane@example.com" });
      expect(await storage.get("1")).toEqual({ id: "1", name: "Jane", email: "jane@example.com" });
    });

    it("should handle mixed expired and non-expired entries", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      // Create entries at different times
      await storage.create({ id: "1", name: "User 1", email: "user1@example.com" });

      mockTime.current = 300;
      await storage.create({ id: "2", name: "User 2", email: "user2@example.com" });

      mockTime.current = 600;
      await storage.create({ id: "3", name: "User 3", email: "user3@example.com" });

      mockTime.current = 900;
      await storage.create({ id: "4", name: "User 4", email: "user4@example.com" });

      // At time 900, all entries should exist
      expect(await storage.getAll()).toHaveLength(4);

      // At time 1200, we should have:
      // Entry 1: created at 0, expires at 1000 - EXPIRED
      // Entry 2: created at 300, expires at 1300 - ALIVE
      // Entry 3: created at 600, expires at 1600 - ALIVE
      // Entry 4: created at 900, expires at 1900 - ALIVE
      mockTime.current = 1200;
      const all = await storage.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((u) => u.id)).toEqual(["2", "3", "4"]);
    });

    it("should work with very short TTLs", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 10,
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      expect(await storage.exists("1")).toBe(true);

      mockTime.current = 11;
      expect(await storage.exists("1")).toBe(false);
    });

    it("should work with very long TTLs", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 365 * 24 * 60 * 60 * 1000, // 1 year
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Advance by 6 months
      mockTime.current = 182 * 24 * 60 * 60 * 1000;

      expect(await storage.exists("1")).toBe(true);
      expect(await storage.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
    });

    it("should not expire entries when TTL is not configured", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        now: () => mockTime.current,
      });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      // Advance time significantly
      mockTime.current = 365 * 24 * 60 * 60 * 1000; // 1 year

      // Entry should still exist without TTL
      expect(await storage.exists("1")).toBe(true);
      expect(await storage.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
    });

    it("should handle cleanup of multiple expired entries efficiently", async () => {
      const mockTime = { current: 0 };
      const storage = createMemoryStorage<TestUser, "id">("id", {
        ttl: 1000,
        now: () => mockTime.current,
      });

      // Create 100 entries
      for (let i = 0; i < 100; i++) {
        await storage.create({ id: `${i}`, name: `User ${i}`, email: `user${i}@example.com` });
      }

      mockTime.current = 500;

      // Create 50 more entries
      for (let i = 100; i < 150; i++) {
        await storage.create({ id: `${i}`, name: `User ${i}`, email: `user${i}@example.com` });
      }

      // Expire only the first 100 entries
      // First batch created at time 0 (expire at 1000)
      // Second batch created at time 500 (expire at 1500)
      mockTime.current = 1200;

      const all = await storage.getAll();
      expect(all).toHaveLength(50);
      expect(all.every((u) => Number.parseInt(u.id, 10) >= 100)).toBe(true);
    });
  });
});
