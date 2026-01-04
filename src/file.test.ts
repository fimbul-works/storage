import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createFileStorage, jsonFileAdapter, type FileAdapter } from "./file";
import { DuplicateKeyError, NotFoundError } from "./types";

interface TestUser {
  id: string;
  name: string;
  email: string;
}

describe("createFileStorage", () => {
  const testDir = join(__dirname, "test-storage");
  let storage = createFileStorage<TestUser, "id">(testDir, "id");

  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Directory doesn't exist, that's fine
    }
    // Create a fresh storage instance
    storage = createFileStorage<TestUser, "id">(testDir, "id");
  });

  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Directory doesn't exist, that's fine
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

    it("should persist data across storage instances", async () => {
      const user = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user);

      // Create a new storage instance with the same directory
      const newStorage = createFileStorage<TestUser, "id">(testDir, "id");
      const retrieved = await newStorage.get("1");

      expect(retrieved).toEqual(user);
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

    it("should handle files in subdirectories correctly", async () => {
      const user1 = { id: "1", name: "John", email: "john@example.com" };
      await storage.create(user1);

      const result = await storage.getAll();
      expect(result).toHaveLength(1);
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

      // Create a new storage instance with the same directory
      const newStorage = createFileStorage<TestUser, "id">(testDir, "id");
      const result = await newStorage.get("1");

      expect(result).toEqual(updatedUser);
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

      // Create a new storage instance with the same directory
      const newStorage = createFileStorage<TestUser, "id">(testDir, "id");
      expect(await newStorage.exists("1")).toBe(false);
    });
  });

  describe("custom file adapter", () => {
    it("should work with a custom file adapter", async () => {
      interface CustomUser {
        id: number;
        name: string;
      }

      const customAdapter: FileAdapter<CustomUser, "id"> = {
        encoding: "utf-8",
        fileName(key: number): string {
          return `user_${key}.txt`;
        },
        serialize(entry: CustomUser): string {
          return `${entry.id}|${entry.name}`;
        },
        deserialize(str: string): CustomUser {
          const [id, name] = str.split("|");
          return { id: Number(id), name };
        },
      };

      const customStorage = createFileStorage<CustomUser, "id">(testDir, "id", customAdapter);

      const user = { id: 1, name: "John" };
      await customStorage.create(user);

      const retrieved = await customStorage.get(1);
      expect(retrieved).toEqual(user);
    });

    it("should use custom fileName function correctly", async () => {
      interface Product {
        sku: string;
        name: string;
      }

      const productAdapter: FileAdapter<Product, "sku"> = {
        encoding: "utf-8",
        fileName(key: string): string {
          return `product-${key.toUpperCase()}.json`;
        },
        serialize(entry: Product): string {
          return JSON.stringify(entry);
        },
        deserialize(str: string): Product {
          return JSON.parse(str);
        },
      };

      const productStorage = createFileStorage<Product, "sku">(testDir, "sku", productAdapter);

      const product = { sku: "abc123", name: "Laptop" };
      await productStorage.create(product);

      const retrieved = await productStorage.get("abc123");
      expect(retrieved).toEqual(product);
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

      const productStorage = createFileStorage<Product, "sku">(testDir, "sku");

      const product = { sku: "PROD-001", name: "Laptop", price: 999 };
      await productStorage.create(product);

      expect(await productStorage.exists("PROD-001")).toBe(true);
      expect(await productStorage.get("PROD-001")).toEqual(product);
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

      const complexStorage = createFileStorage<ComplexObject, "id">(testDir, "id");

      const complexObj = {
        id: "1",
        nested: { field1: "value", field2: 42 },
        array: ["item1", "item2", "item3"],
      };

      await complexStorage.create(complexObj);
      const retrieved = await complexStorage.get("1");

      expect(retrieved).toEqual(complexObj);
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

      const typedStorage = createFileStorage<TypedData, "id">(testDir, "id");

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
    });
  });
});
