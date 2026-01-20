import { existsSync, rmSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFileStorage, createLayeredStorage, createMemoryStorage } from "./index.js";

interface User {
  id: string;
  name: string;
  email: string;
}

describe("LayeredStorage", () => {
  describe("key field validation", () => {
    it("should throw error if layers have different key fields", () => {
      const storage1 = createMemoryStorage<User, "id">("id");
      const storage2 = createMemoryStorage<User, "email">("email");

      expect(() => createLayeredStorage([storage1, storage2])).toThrow("All layers must have the same key field");
    });

    it("should throw error listing the conflicting key fields", () => {
      const storage1 = createMemoryStorage<User, "id">("id");
      const storage2 = createMemoryStorage<User, "email">("email");
      const storage3 = createMemoryStorage<User, "name">("name");

      expect(() => createLayeredStorage([storage1, storage2, storage3])).toThrow();
    });

    it("should accept layers with the same key field", () => {
      const storage1 = createMemoryStorage<User, "id">("id");
      const storage2 = createMemoryStorage<User, "id">("id");

      expect(() => createLayeredStorage([storage1, storage2])).not.toThrow();
    });

    it("should expose the keyField property from the layers", () => {
      const storage1 = createMemoryStorage<User, "id">("id");
      const storage2 = createMemoryStorage<User, "id">("id");

      const layered = createLayeredStorage([storage1, storage2]);

      expect(layered.keyField).toBe("id");
    });
  });

  let memory1: ReturnType<typeof createMemoryStorage<User, "id">>;
  let memory2: ReturnType<typeof createMemoryStorage<User, "id">>;
  let file: ReturnType<typeof createFileStorage<User, "id">>;

  // Clean up test directory
  const removeDataDir = () => {
    if (existsSync("./test-data")) {
      rmSync("./test-data", { recursive: true, force: true });
    }
  };

  beforeEach(() => {
    removeDataDir();
    memory1 = createMemoryStorage<User, "id">("id");
    memory2 = createMemoryStorage<User, "id">("id");
    file = createFileStorage<User, "id">("id", { path: "./test-data/users" });
  });

  afterAll(() => {
    removeDataDir();
  });

  it("should throw error if no layers provided", () => {
    expect(() => createLayeredStorage([])).toThrow("At least one storage layer is required");
  });

  it("should check existence across all layers (top to bottom)", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory2.create({ id: "1", name: "John", email: "john@example.com" });

    expect(await storage.exists("1")).toBe(true);
    expect(await storage.exists("2")).toBe(false);
  });

  it("should return true from top layer if exists in multiple layers", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory1.create({ id: "1", name: "John", email: "john@example.com" });
    await memory2.create({ id: "1", name: "Jane", email: "jane@example.com" });

    expect(await storage.exists("1")).toBe(true);
  });

  it("should create entry in all layers", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await storage.create({ id: "1", name: "John", email: "john@example.com" });

    expect(await memory1.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(await memory2.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
  });

  it("should throw DuplicateKeyError when creating existing key", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory1.create({ id: "1", name: "John", email: "john@example.com" });

    await expect(storage.create({ id: "1", name: "Jane", email: "jane@example.com" })).rejects.toThrow(
      'Key "1" already exists',
    );
  });

  it("should get from first matching layer (top to bottom)", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory1.create({ id: "1", name: "Memory1", email: "m1@example.com" });
    await memory2.create({ id: "1", name: "Memory2", email: "m2@example.com" });

    const user = await storage.get("1");
    expect(user).toEqual({ id: "1", name: "Memory1", email: "m1@example.com" });
  });

  it("should fallback to lower layer if not in upper layer", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory2.create({ id: "1", name: "Memory2", email: "m2@example.com" });

    const user = await storage.get("1");
    expect(user).toEqual({ id: "1", name: "Memory2", email: "m2@example.com" });
  });

  it("should return null if not found in any layer", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    const user = await storage.get("1");
    expect(user).toBeNull();
  });

  it("should get all entries with deduplication (bottom-up merge)", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory2.create({ id: "1", name: "Bottom", email: "bottom@example.com" });
    await memory2.create({ id: "2", name: "Bottom2", email: "bottom2@example.com" });
    await memory1.create({ id: "1", name: "Top", email: "top@example.com" });

    const all = await storage.getAll();

    expect(all).toHaveLength(2);
    expect(all).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "1", name: "Top", email: "top@example.com" }),
        expect.objectContaining({ id: "2", name: "Bottom2", email: "bottom2@example.com" }),
      ]),
    );
  });

  it("should update entry in all layers that have it", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory1.create({ id: "1", name: "Original", email: "original@example.com" });
    await memory2.create({ id: "1", name: "Original", email: "original@example.com" });
    await memory2.create({ id: "2", name: "Other", email: "other@example.com" });

    await storage.update({ id: "1", name: "Updated", email: "updated@example.com" });

    const m1User = await memory1.get("1");
    const m2User = await memory2.get("1");
    const m2Other = await memory2.get("2");

    expect(m1User).toEqual({ id: "1", name: "Updated", email: "updated@example.com" });
    expect(m2User).toEqual({ id: "1", name: "Updated", email: "updated@example.com" });
    expect(m2Other).toEqual({ id: "2", name: "Other", email: "other@example.com" });
  });

  it("should throw NotFoundError when updating non-existent key", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await expect(storage.update({ id: "1", name: "John", email: "john@example.com" })).rejects.toThrow(
      'Key "1" not found',
    );
  });

  it("should delete entry from all layers that have it", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory1.create({ id: "1", name: "User1", email: "user1@example.com" });
    await memory2.create({ id: "1", name: "User1", email: "user1@example.com" });
    await memory2.create({ id: "2", name: "User2", email: "user2@example.com" });

    await storage.delete("1");

    expect(await memory1.exists("1")).toBe(false);
    expect(await memory2.exists("1")).toBe(false);
    expect(await memory2.exists("2")).toBe(true);
  });

  it("should throw NotFoundError when deleting non-existent key", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await expect(storage.delete("1")).rejects.toThrow('Key "1" not found');
  });

  it("should work with file storage layers", async () => {
    const storage = createLayeredStorage([memory1, file]);

    await storage.create({ id: "1", name: "John", email: "john@example.com" });

    const fromMemory = await memory1.get("1");
    const fromFile = await file.get("1");

    expect(fromMemory).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(fromFile).toEqual({ id: "1", name: "John", email: "john@example.com" });
  });

  it("should demonstrate cache-aside pattern (bubble-up)", async () => {
    const storage = createLayeredStorage([memory1, file]);

    // Create in persistent storage
    await file.create({ id: "1", name: "John", email: "john@example.com" });

    // Initially memory (cache) is empty
    expect(await memory1.exists("1")).toBe(false);

    // First get - fetches from file and bubbles up to memory
    const user1 = await storage.get("1");
    expect(user1).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(await memory1.exists("1")).toBe(true);

    // Update through layered storage - writes to both
    await storage.update({ id: "1", name: "John Updated", email: "john@example.com" });

    // Now both layers have it
    expect(await memory1.get("1")).toEqual({ id: "1", name: "John Updated", email: "john@example.com" });
    expect(await file.get("1")).toEqual({ id: "1", name: "John Updated", email: "john@example.com" });

    // Second get - fetches from memory (cache hit)
    const user2 = await storage.get("1");
    expect(user2).toEqual({ id: "1", name: "John Updated", email: "john@example.com" });
  });

  it("should bubble up entry to all upper layers on cache miss", async () => {
    const memory3 = createMemoryStorage<User, "id">("id");
    const storage = createLayeredStorage([memory1, memory2, memory3]);

    await memory3.create({ id: "1", name: "Deep", email: "deep@example.com" });

    // Initial state: only memory3 has it
    expect(await memory1.exists("1")).toBe(false);
    expect(await memory2.exists("1")).toBe(false);
    expect(await memory3.exists("1")).toBe(true);

    const user = await storage.get("1");
    expect(user).toEqual({ id: "1", name: "Deep", email: "deep@example.com" });

    // After get: all layers should have it
    expect(await memory1.get("1")).toEqual({ id: "1", name: "Deep", email: "deep@example.com" });
    expect(await memory2.get("1")).toEqual({ id: "1", name: "Deep", email: "deep@example.com" });
    expect(await memory3.get("1")).toEqual({ id: "1", name: "Deep", email: "deep@example.com" });
  });

  it("should bubble up entries in getAll", async () => {
    const storage = createLayeredStorage([memory1, memory2]);

    await memory2.create({ id: "1", name: "User1", email: "u1@example.com" });
    await memory2.create({ id: "2", name: "User2", email: "u2@example.com" });

    // memory1 is empty
    expect(await memory1.getAll()).toHaveLength(0);

    const all = await storage.getAll();
    expect(all).toHaveLength(2);

    // After getAll: memory1 should be populated
    const m1Entries = await memory1.getAll();
    expect(m1Entries).toHaveLength(2);
    expect(m1Entries).toEqual(expect.arrayContaining(all));
  });

  it("should update cache after TTL expiration", async () => {
    let mockTime = 1000;
    const ttlMemory = createMemoryStorage<User, "id">("id", {
      ttl: 500,
      now: () => mockTime,
    });
    const storage = createLayeredStorage([ttlMemory, memory2]);

    await storage.create({ id: "1", name: "Initial", email: "i@example.com" });

    // Both have it
    expect(await ttlMemory.exists("1")).toBe(true);
    expect(await memory2.exists("1")).toBe(true);

    // Update memory2 manually (stale cache scenario)
    await memory2.update({ id: "1", name: "Updated", email: "u@example.com" });

    // First get returns from ttlMemory (cache hit, but stale)
    expect(await storage.get("1")).toEqual({ id: "1", name: "Initial", email: "i@example.com" });

    // Advance time past TTL
    mockTime += 600;

    // ttlMemory entry expired
    expect(await ttlMemory.exists("1")).toBe(false);

    // Second get should trigger bubble-up from memory2
    const user = await storage.get("1");
    expect(user).toEqual({ id: "1", name: "Updated", email: "u@example.com" });

    // Cache should be updated
    expect(await ttlMemory.get("1")).toEqual({ id: "1", name: "Updated", email: "u@example.com" });
  });

  it("should work with single layer", async () => {
    const storage = createLayeredStorage([memory1]);

    await storage.create({ id: "1", name: "John", email: "john@example.com" });

    expect(await storage.exists("1")).toBe(true);
    expect(await storage.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(await storage.getAll()).toHaveLength(1);
  });

  it("should coerce keys correctly across layers with different key types", async () => {
    interface NumericUser {
      id: number;
      name: string;
    }

    // Memory storage uses number keys directly
    const numMemory = createMemoryStorage<NumericUser, "id">("id");

    // File storage stores keys as strings but coerces them back to numbers
    const numFile = createFileStorage<NumericUser, "id">("id", {
      path: "./test-data/numeric-users",
      keyFromStorage: (raw) => Number.parseInt(raw, 10),
    });

    const storage = createLayeredStorage([numMemory, numFile]);

    // Create in file layer (stores as string "123")
    await numFile.create({ id: 123, name: "File User" });

    // Create in memory layer (stores as number 456)
    await numMemory.create({ id: 456, name: "Memory User" });

    // getKeys should return coerced numbers from both layers
    const keys = await storage.getKeys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain(123);
    expect(keys).toContain(456);
    expect(keys.every((k) => typeof k === "number")).toBe(true);

    // getAll should also work with coerced keys
    const all = await storage.getAll();
    expect(all).toHaveLength(2);
    expect(all).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 123, name: "File User" }),
        expect.objectContaining({ id: 456, name: "Memory User" }),
      ]),
    );
  });

  describe("getKeys", () => {
    it("should return empty array when no entries exist in any layer", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      const keys = await storage.getKeys();
      expect(keys).toEqual([]);
    });

    it("should return unique keys from all layers", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "John", email: "john@example.com" });
      await memory2.create({ id: "2", name: "Jane", email: "jane@example.com" });
      await memory2.create({ id: "3", name: "Bob", email: "bob@example.com" });

      const keys = await storage.getKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("1");
      expect(keys).toContain("2");
      expect(keys).toContain("3");
    });

    it("should deduplicate keys that exist in multiple layers", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "Top", email: "top@example.com" });
      await memory2.create({ id: "1", name: "Bottom", email: "bottom@example.com" });
      await memory2.create({ id: "2", name: "Jane", email: "jane@example.com" });

      const keys = await storage.getKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain("1");
      expect(keys).toContain("2");
    });

    it("should return keys matching getAll", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "Top", email: "top@example.com" });
      await memory2.create({ id: "2", name: "Bottom", email: "bottom@example.com" });
      await memory2.create({ id: "3", name: "Bottom2", email: "bottom2@example.com" });

      const allEntries = await storage.getAll();
      const allKeys = await storage.getKeys();

      expect(allKeys).toHaveLength(allEntries.length);
      expect(allKeys.sort()).toEqual(allEntries.map((u) => u.id).sort());
    });
  });

  describe("streamAll", () => {
    it("should return empty iterator when no entries exist", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      const results: User[] = [];
      for await (const entry of storage.streamAll()) {
        results.push(entry);
      }

      expect(results).toEqual([]);
    });

    it("should stream all entries from all layers", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "John", email: "john@example.com" });
      await memory2.create({ id: "2", name: "Jane", email: "jane@example.com" });
      await memory2.create({ id: "3", name: "Bob", email: "bob@example.com" });

      const results: User[] = [];
      for await (const entry of storage.streamAll()) {
        results.push(entry);
      }

      expect(results).toHaveLength(3);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "1", name: "John" }),
          expect.objectContaining({ id: "2", name: "Jane" }),
          expect.objectContaining({ id: "3", name: "Bob" }),
        ]),
      );
    });

    it("should prioritize entries from top layers", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "Top", email: "top@example.com" });
      await memory2.create({ id: "1", name: "Bottom", email: "bottom@example.com" });
      await memory2.create({ id: "2", name: "Jane", email: "jane@example.com" });

      const results: User[] = [];
      for await (const entry of storage.streamAll()) {
        results.push(entry);
      }

      expect(results).toHaveLength(2);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "1", name: "Top" }), // From top layer
          expect.objectContaining({ id: "2", name: "Jane" }),
        ]),
      );
    });

    it("should return the same data as getAll but streamed", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "John", email: "john@example.com" });
      await memory2.create({ id: "2", name: "Jane", email: "jane@example.com" });
      await memory2.create({ id: "3", name: "Bob", email: "bob@example.com" });

      const allResults = await storage.getAll();
      const streamResults: User[] = [];
      for await (const entry of storage.streamAll()) {
        streamResults.push(entry);
      }

      expect(streamResults).toHaveLength(allResults.length);
      expect(streamResults).toEqual(expect.arrayContaining(allResults));
      expect(allResults).toEqual(expect.arrayContaining(streamResults));
    });

    it("should allow early termination", async () => {
      const storage = createLayeredStorage([memory1, memory2]);

      await memory1.create({ id: "1", name: "John", email: "john@example.com" });
      await memory2.create({ id: "2", name: "Jane", email: "jane@example.com" });
      await memory2.create({ id: "3", name: "Bob", email: "bob@example.com" });
      await memory1.create({ id: "4", name: "Alice", email: "alice@example.com" });
      await memory2.create({ id: "5", name: "Charlie", email: "charlie@example.com" });

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
  });
});
