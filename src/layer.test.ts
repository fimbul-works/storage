import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { createFileStorage, createLayeredStorage, createMemoryStorage } from "./index.js";

interface User {
  id: string;
  name: string;
  email: string;
}

describe("LayeredStorage", () => {
  let memory1: ReturnType<typeof createMemoryStorage<User, "id">>;
  let memory2: ReturnType<typeof createMemoryStorage<User, "id">>;
  let file: ReturnType<typeof createFileStorage<User, "id">>;

  beforeEach(async () => {
    memory1 = createMemoryStorage<User, "id">("id");
    memory2 = createMemoryStorage<User, "id">("id");

    // Clean up test directory
    if (existsSync("./test-data")) {
      await rm("./test-data", { recursive: true, force: true });
    }
    file = createFileStorage<User, "id">("./test-data/users", "id");
  });

  it("should throw error if no layers provided", () => {
    expect(() => createLayeredStorage<User, "id">("id", [])).toThrow("At least one storage layer is required");
  });

  it("should check existence across all layers (top to bottom)", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await memory2.create({ id: "1", name: "John", email: "john@example.com" });

    expect(await storage.exists("1")).toBe(true);
    expect(await storage.exists("2")).toBe(false);
  });

  it("should return true from top layer if exists in multiple layers", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await memory1.create({ id: "1", name: "John", email: "john@example.com" });
    await memory2.create({ id: "1", name: "Jane", email: "jane@example.com" });

    expect(await storage.exists("1")).toBe(true);
  });

  it("should create entry in all layers", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await storage.create({ id: "1", name: "John", email: "john@example.com" });

    expect(await memory1.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(await memory2.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
  });

  it("should throw DuplicateKeyError when creating existing key", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await memory1.create({ id: "1", name: "John", email: "john@example.com" });

    await expect(storage.create({ id: "1", name: "Jane", email: "jane@example.com" })).rejects.toThrow(
      'Key "1" already exists',
    );
  });

  it("should get from first matching layer (top to bottom)", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await memory1.create({ id: "1", name: "Memory1", email: "m1@example.com" });
    await memory2.create({ id: "1", name: "Memory2", email: "m2@example.com" });

    const user = await storage.get("1");
    expect(user).toEqual({ id: "1", name: "Memory1", email: "m1@example.com" });
  });

  it("should fallback to lower layer if not in upper layer", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await memory2.create({ id: "1", name: "Memory2", email: "m2@example.com" });

    const user = await storage.get("1");
    expect(user).toEqual({ id: "1", name: "Memory2", email: "m2@example.com" });
  });

  it("should return null if not found in any layer", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    const user = await storage.get("1");
    expect(user).toBeNull();
  });

  it("should get all entries with deduplication (bottom-up merge)", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

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
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

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
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await expect(storage.update({ id: "1", name: "John", email: "john@example.com" })).rejects.toThrow(
      'Key "1" not found',
    );
  });

  it("should delete entry from all layers that have it", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await memory1.create({ id: "1", name: "User1", email: "user1@example.com" });
    await memory2.create({ id: "1", name: "User1", email: "user1@example.com" });
    await memory2.create({ id: "2", name: "User2", email: "user2@example.com" });

    await storage.delete("1");

    expect(await memory1.exists("1")).toBe(false);
    expect(await memory2.exists("1")).toBe(false);
    expect(await memory2.exists("2")).toBe(true);
  });

  it("should throw NotFoundError when deleting non-existent key", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, memory2]);

    await expect(storage.delete("1")).rejects.toThrow('Key "1" not found');
  });

  it("should work with file storage layers", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, file]);

    await storage.create({ id: "1", name: "John", email: "john@example.com" });

    const fromMemory = await memory1.get("1");
    const fromFile = await file.get("1");

    expect(fromMemory).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(fromFile).toEqual({ id: "1", name: "John", email: "john@example.com" });
  });

  it("should demonstrate cache-aside pattern", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1, file]);

    // Create in persistent storage
    await file.create({ id: "1", name: "John", email: "john@example.com" });

    // First get - fetches from file (cache miss)
    const user1 = await storage.get("1");
    expect(user1).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(await memory1.exists("1")).toBe(false);

    // Update through layered storage - writes to both
    await storage.update({ id: "1", name: "John Updated", email: "john@example.com" });

    // Now both layers have it
    expect(await memory1.exists("1")).toBe(true);
    expect(await file.exists("1")).toBe(true);

    // Second get - fetches from memory (cache hit)
    const user2 = await storage.get("1");
    expect(user2).toEqual({ id: "1", name: "John Updated", email: "john@example.com" });
  });

  it("should work with single layer", async () => {
    const storage = createLayeredStorage<User, "id">("id", [memory1]);

    await storage.create({ id: "1", name: "John", email: "john@example.com" });

    expect(await storage.exists("1")).toBe(true);
    expect(await storage.get("1")).toEqual({ id: "1", name: "John", email: "john@example.com" });
    expect(await storage.getAll()).toHaveLength(1);
  });
});
