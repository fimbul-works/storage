import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createFileStorage } from "./file.js";
import { createLayeredStorage } from "./layer.js";
import { createMemoryStorage } from "./memory.js";

interface User {
  id: string;
  name: string;
}

describe("Storage Events", () => {
  describe("MemoryStorage Events", () => {
    it("should emit create event", async () => {
      const storage = createMemoryStorage<User>("id");
      const callback = vi.fn();
      storage.on("create", callback);

      const user = { id: "1", name: "Alice" };
      await storage.create(user);

      expect(callback).toHaveBeenCalledWith(user);
    });

    it("should emit update event", async () => {
      const storage = createMemoryStorage<User>("id");
      const callback = vi.fn();
      const user = { id: "1", name: "Alice" };
      await storage.create(user);

      storage.on("update", callback);
      const updatedUser = { id: "1", name: "Bob" };
      await storage.update(updatedUser);

      expect(callback).toHaveBeenCalledWith(updatedUser);
    });

    it("should emit delete event", async () => {
      const storage = createMemoryStorage<User>("id");
      const callback = vi.fn();
      const user = { id: "1", name: "Alice" };
      await storage.create(user);

      storage.on("delete", callback);
      await storage.delete("1");

      expect(callback).toHaveBeenCalledWith(user);
    });

    it("should stop emitting after cleanup", async () => {
      const storage = createMemoryStorage<User>("id");
      const callback = vi.fn();
      const cleanup = storage.on("create", callback);

      cleanup();
      await storage.create({ id: "1", name: "Alice" });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("FileStorage Events", () => {
    const testDir = join(process.cwd(), "test-events");

    it("should emit create event when file is created", async () => {
      if (existsSync(testDir)) await rm(testDir, { recursive: true });
      await mkdir(testDir, { recursive: true });

      const storage = createFileStorage<User>("id", { path: testDir });
      const callback = vi.fn();
      storage.on("create", callback);

      // Give chokidar a moment to initialize
      await new Promise((r) => setTimeout(r, 200));

      const user = { id: "1", name: "Alice" };
      await storage.create(user);

      // Chokidar might take a moment
      await new Promise((r) => setTimeout(r, 500));

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toEqual(user);

      await rm(testDir, { recursive: true });
    });

    it("should emit update event when file is modified", async () => {
      if (existsSync(testDir)) await rm(testDir, { recursive: true });
      await mkdir(testDir, { recursive: true });

      const storage = createFileStorage<User>("id", { path: testDir });
      const user = { id: "1", name: "Alice" };
      await storage.create(user);

      const callback = vi.fn();
      storage.on("update", callback);

      await new Promise((r) => setTimeout(r, 200));

      const updatedUser = { id: "1", name: "Bob" };
      await storage.update(updatedUser);

      await new Promise((r) => setTimeout(r, 500));

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toEqual(updatedUser);

      await rm(testDir, { recursive: true });
    });

    it("should emit delete event when file is removed", async () => {
      if (existsSync(testDir)) await rm(testDir, { recursive: true });
      await mkdir(testDir, { recursive: true });

      const storage = createFileStorage<User>("id", { path: testDir });
      const user = { id: "1", name: "Alice" };
      await storage.create(user);

      const callback = vi.fn();
      storage.on("delete", callback);

      await new Promise((r) => setTimeout(r, 200));

      await storage.delete("1");

      await new Promise((r) => setTimeout(r, 500));

      expect(callback).toHaveBeenCalled();
      // For delete, we expect at least the primary key
      expect(callback.mock.calls[0][0]).toMatchObject({ id: "1" });

      await rm(testDir, { recursive: true });
    });
  });

  describe("LayeredStorage Events", () => {
    it("should bubble up events from lower layers", async () => {
      const top = createMemoryStorage<User>("id");
      const bottom = createMemoryStorage<User>("id");
      const layered = createLayeredStorage([top, bottom]);

      const topCallback = vi.fn();
      top.on("create", topCallback);

      const user = { id: "1", name: "Alice" };
      // Simulate external change in bottom layer
      await bottom.create(user);

      // Bubbling should trigger create on top layer
      await new Promise((r) => setTimeout(r, 100));

      expect(topCallback).toHaveBeenCalledWith(user);
      const inTop = await top.get("1");
      expect(inTop).toEqual(user);
    });
  });
});
