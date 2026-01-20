import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./memory.js";

interface User {
  id: string;
  name: string;
}

describe("getMany", () => {
  it("should retrieve multiple existing entries", async () => {
    const storage = createMemoryStorage<User>("id");
    await storage.create({ id: "1", name: "Alice" });
    await storage.create({ id: "2", name: "Bob" });
    await storage.create({ id: "3", name: "Charlie" });

    const results = await storage.getMany(["1", "3"]);
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        { id: "1", name: "Alice" },
        { id: "3", name: "Charlie" },
      ]),
    );
  });

  it("should ignore non-existent keys", async () => {
    const storage = createMemoryStorage<User>("id");
    await storage.create({ id: "1", name: "Alice" });

    const results = await storage.getMany(["1", "2"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: "1", name: "Alice" });
  });

  it("should return empty array for no matches", async () => {
    const storage = createMemoryStorage<User>("id");
    const results = await storage.getMany(["1", "2"]);
    expect(results).toEqual([]);
  });

  it("should return empty array for empty input", async () => {
    const storage = createMemoryStorage<User>("id");
    const results = await storage.getMany([]);
    expect(results).toEqual([]);
  });
});
