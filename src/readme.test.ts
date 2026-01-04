import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createFileStorage, createLayeredStorage, createMemoryStorage, type FileAdapter } from "./index.js";
import { createRedisStorage } from "./redis.js";

interface User {
  id: string | number;
  name: string;
  email: string;
}

interface Product {
  sku: string;
  name: string;
  price: number;
}

describe("README Examples", () => {
  // Clean up test directories
  afterEach(async () => {
    const testDirs = ["./test-data-readme", "./test-data-users"];
    for (const dir of testDirs) {
      if (existsSync(dir)) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  describe("Quick Start", () => {
    it("should demonstrate basic CRUD operations", async () => {
      const storage = createMemoryStorage<User, "id">("id");

      await storage.create({ id: "1", name: "John Doe", email: "john@example.com" });
      const user = await storage.get("1");
      expect(user).toEqual({ id: "1", name: "John Doe", email: "john@example.com" });

      await storage.update({ id: "1", name: "John Updated", email: "john@example.com" });
      const updatedUser = await storage.get("1");
      expect(updatedUser?.name).toBe("John Updated");

      const allUsers = await storage.getAll();
      expect(allUsers).toHaveLength(1);

      await storage.delete("1");
      expect(await storage.exists("1")).toBe(false);
    });
  });

  describe("Storage Backends", () => {
    it("should demonstrate in-memory storage", async () => {
      const storage = createMemoryStorage<User, "id">("id");
      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      expect(await storage.exists("1")).toBe(true);
    });

    it("should demonstrate file-based storage", async () => {
      const storage = createFileStorage<User, "id">("id", { path: "./test-data-readme/users" });
      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      expect(await storage.exists("1")).toBe(true);
      // Verify file was created
      expect(existsSync("./test-data-readme/users/1.json")).toBe(true);
    });

    it("should demonstrate Redis storage", async () => {
      const storage = await createRedisStorage<User, "id">("id", {
        url: "redis://localhost:6379",
        keyPrefix: "users:",
      });
      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      expect(await storage.exists("1")).toBe(true);
      storage.close();
    });

    it("should demonstrate layered storage with cache", async () => {
      const cache = createMemoryStorage<User, "id">("id");
      const persistent = createFileStorage<User, "id">("id", { path: "./test-data-readme/users2" });
      const storage = createLayeredStorage([cache, persistent]);

      await storage.create({ id: "2", name: "Jane", email: "jane@example.com" });

      // Should be in both layers
      expect(await cache.exists("2")).toBe(true);
      expect(await persistent.exists("2")).toBe(true);

      // get() should return from cache (top layer first)
      const user = await storage.get("2");
      expect(user).toEqual({ id: "2", name: "Jane", email: "jane@example.com" });
    });
  });

  describe("Layer Behavior", () => {
    it("should demonstrate layer merging and prioritization", async () => {
      const cache = createMemoryStorage<User, "id">("id");
      const persistent = createFileStorage<User, "id">("id", { path: "./test-data-readme/users3" });
      const storage = createLayeredStorage([cache, persistent]);

      // Create in persistent layer
      await persistent.create({ id: "1", name: "Original", email: "john@example.com" });

      // Update through layered storage - writes to all layers
      await storage.update({ id: "1", name: "Updated", email: "john@example.com" });

      // Both layers should have the updated version
      const cachedUser = await cache.get("1");
      const persistedUser = await persistent.get("1");
      expect(cachedUser?.name).toBe("Updated");
      expect(persistedUser?.name).toBe("Updated");
    });
  });

  describe("Advanced Usage", () => {
    it("should demonstrate custom serialization with CSV adapter", async () => {
      const csvAdapter: FileAdapter<User, "id"> = {
        encoding: "utf-8",
        fileName: (key) => `user_${key}.csv`,
        serialize: (user) => `${user.id},${user.name},${user.email}`,
        deserialize: (str) => {
          const [id, name, email] = str.split(",");
          return { id, name, email } as User;
        },
      };

      const storage = createFileStorage("id", { path: "./test-data-readme/csv", adapter: csvAdapter });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });

      const user = await storage.get("1");
      expect(user).toEqual({ id: "1", name: "John", email: "john@example.com" });

      // Verify CSV file was created
      expect(existsSync("./test-data-readme/csv/user_1.csv")).toBe(true);
    });

    it("should demonstrate different key fields", async () => {
      const storage = createMemoryStorage<Product, "sku">("sku");

      await storage.create({ sku: "ABC123", name: "Widget", price: 9.99 });

      expect(await storage.exists("ABC123")).toBe(true);
      const product = await storage.get("ABC123");
      expect(product?.name).toBe("Widget");
    });
  });

  describe("Streaming Large Datasets", () => {
    it("should demonstrate streaming entries", async () => {
      const storage = createFileStorage<User, "id">("id", { path: "./test-data-readme/streaming" });

      const users = [
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
        { id: "3", name: "Charlie", email: "charlie@example.com" },
      ];

      for (const user of users) {
        await storage.create(user);
      }

      // Process users one at a time
      const processed: string[] = [];
      for await (const user of storage.streamAll()) {
        processed.push(user.name);
      }

      expect(processed).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("should demonstrate early termination", async () => {
      const storage = createFileStorage<User, "id">("id", { path: "./test-data-readme/early-term" });

      const users = [
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "target@example.com" },
        { id: "3", name: "Charlie", email: "charlie@example.com" },
      ];

      for (const user of users) {
        await storage.create(user);
      }

      let found = false;
      let count = 0;

      // Early termination - stop after finding what you need
      for await (const user of storage.streamAll()) {
        count++;
        if (user.email === "target@example.com") {
          found = true;
          break; // Stops iteration, saves resources
        }
      }

      expect(found).toBe(true);
      expect(count).toBeLessThan(3); // Should stop early
    });
  });

  describe("Working with Keys", () => {
    it("should demonstrate getting all keys", async () => {
      const storage = createFileStorage<User, "id">("id", { path: "./test-data-readme/keys" });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      await storage.create({ id: "2", name: "Jane", email: "jane@example.com" });
      await storage.create({ id: "3", name: "Bob", email: "bob@example.com" });

      const userIds = await storage.getKeys();
      expect(userIds).toHaveLength(3);
      expect(userIds).toContain("1");
      expect(userIds).toContain("2");
      expect(userIds).toContain("3");
    });

    it("should demonstrate checking if specific keys exist", async () => {
      const storage = createFileStorage<User, "id">("id", { path: "./test-data-readme/key-check" });

      await storage.create({ id: "1", name: "John", email: "john@example.com" });
      await storage.create({ id: "3", name: "Bob", email: "bob@example.com" });

      const allKeys = await storage.getKeys();
      const targetIds = ["1", "2", "3"];
      const existingIds = targetIds.filter((id) => allKeys.includes(id));

      expect(existingIds).toEqual(["1", "3"]);
    });
  });

  describe("Key Type Coercion", () => {
    it("should coerce string keys to numbers for file storage", async () => {
      interface NumericUser {
        id: number;
        name: string;
      }

      const storage = createFileStorage<NumericUser, "id">("id", {
        path: "./test-data-readme/numeric",
        keyFromStorage: (raw) => Number.parseInt(raw, 10),
      });

      await storage.create({ id: 123, name: "John" });
      await storage.create({ id: 456, name: "Jane" });

      const keys = await storage.getKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain(123);
      expect(keys).toContain(456);

      // Verify keys are numbers
      expect(keys.every((k) => typeof k === "number")).toBe(true);
    });

    it("should demonstrate batch processing with coerced keys", async () => {
      interface NumericUser {
        id: number;
        name: string;
      }

      const storage = createFileStorage<NumericUser, "id">("id", {
        path: "./test-data-readme/batch",
        keyFromStorage: (raw) => Number.parseInt(raw, 10),
      });

      await storage.create({ id: 1, name: "User 1" });
      await storage.create({ id: 2, name: "User 2" });
      await storage.create({ id: 3, name: "User 3" });

      // Batch process keys
      const processed: NumericUser[] = [];
      for (const id of await storage.getKeys()) {
        const user = await storage.get(id);
        if (user) {
          processed.push(user);
        }
      }

      expect(processed).toHaveLength(3);
      expect(processed[0].id).toBe(1);
      expect(processed[1].id).toBe(2);
      expect(processed[2].id).toBe(3);
    });
  });
});
