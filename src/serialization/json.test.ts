import { describe, expect, it } from "vitest";
import { createJsonSerializationAdapter } from "./json";

interface TestUser {
  id: string;
  name: string;
  email: string;
  age: number;
  active: boolean;
}

interface ComplexObject {
  id: string;
  nested: {
    field1: string;
    field2: number;
    field3: boolean;
  };
  array: string[];
  nullField: null;
  undefinedField?: string;
}

describe("createJsonSerializationAdapter", () => {
  const jsonSerializationAdapter = createJsonSerializationAdapter();

  describe("serialize", () => {
    it("should serialize a simple object to JSON string", () => {
      const user: TestUser = {
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        active: true,
      };

      const result = jsonSerializationAdapter.serialize(user);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(user);
      expect(typeof result).toBe("string");
    });

    it("should serialize numbers", () => {
      expect(jsonSerializationAdapter.serialize(42)).toBe("42");
      expect(jsonSerializationAdapter.serialize(3.14)).toBe("3.14");
      expect(jsonSerializationAdapter.serialize(-100)).toBe("-100");
    });

    it("should serialize strings", () => {
      expect(jsonSerializationAdapter.serialize("hello")).toBe('"hello"');
      expect(jsonSerializationAdapter.serialize("")).toBe('""');
    });

    it("should serialize booleans", () => {
      expect(jsonSerializationAdapter.serialize(true)).toBe("true");
      expect(jsonSerializationAdapter.serialize(false)).toBe("false");
    });

    it("should serialize null", () => {
      expect(jsonSerializationAdapter.serialize(null)).toBe("null");
    });

    it("should serialize arrays", () => {
      const arr = [1, 2, 3, "four", true];
      const result = jsonSerializationAdapter.serialize(arr);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(arr);
    });

    it("should serialize nested objects", () => {
      const obj: ComplexObject = {
        id: "1",
        nested: {
          field1: "value",
          field2: 42,
          field3: true,
        },
        array: ["item1", "item2"],
        nullField: null,
      };

      const result = jsonSerializationAdapter.serialize(obj);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(obj);
    });

    it("should handle empty objects", () => {
      const result = jsonSerializationAdapter.serialize({});
      expect(result).toBe("{}");
    });

    it("should handle empty arrays", () => {
      const result = jsonSerializationAdapter.serialize([]);
      expect(result).toBe("[]");
    });

    it("should serialize objects with special characters in strings", () => {
      const obj = {
        message: "Hello\nWorld\t!",
        unicode: "Hello 世界 🌍",
        quotes: 'He said "hello"',
      };

      const result = jsonSerializationAdapter.serialize(obj);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(obj);
    });

    it("should serialize objects with Date objects (converted to ISO strings)", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      const obj = { date };

      const result = jsonSerializationAdapter.serialize(obj);
      const parsed = JSON.parse(result);

      expect(parsed.date).toBe(date.toISOString());
    });

    it("should handle undefined values in objects (they become null or omitted)", () => {
      const obj = { defined: "value", undefined: undefined };
      const result = jsonSerializationAdapter.serialize(obj);
      const parsed = JSON.parse(result);

      // JSON.stringify omits undefined values
      expect("undefined" in parsed).toBe(false);
      expect(parsed.defined).toBe("value");
    });

    it("should support pretty printing with space option", () => {
      const adapter = createJsonSerializationAdapter({ space: 2 });
      const obj = { name: "test", value: 123 };

      const result = adapter.serialize(obj);

      expect(result).toContain("  ");
      expect(result).toContain("\n");
    });

    it("should support replacer function", () => {
      const adapter = createJsonSerializationAdapter({
        replacer: (key, value) => (key === "secret" ? undefined : value),
      });
      const obj = { name: "test", secret: "hidden", value: 123 };

      const result = adapter.serialize(obj);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ name: "test", value: 123 });
      expect("secret" in parsed).toBe(false);
    });
  });

  describe("deserialize", () => {
    it("should deserialize a JSON string to an object", () => {
      const jsonStr = '{"id":"1","name":"John Doe","email":"john@example.com","age":30,"active":true}';
      const result = jsonSerializationAdapter.deserialize(jsonStr) as TestUser;

      expect(result).toEqual({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        active: true,
      });
    });

    it("should deserialize numbers", () => {
      expect(jsonSerializationAdapter.deserialize("42") as number).toBe(42);
      expect(jsonSerializationAdapter.deserialize("3.14") as number).toBe(3.14);
      expect(jsonSerializationAdapter.deserialize("-100") as number).toBe(-100);
    });

    it("should deserialize strings", () => {
      expect(jsonSerializationAdapter.deserialize('"hello"') as string).toBe("hello");
      expect(jsonSerializationAdapter.deserialize('""') as string).toBe("");
    });

    it("should deserialize booleans", () => {
      expect(jsonSerializationAdapter.deserialize("true") as boolean).toBe(true);
      expect(jsonSerializationAdapter.deserialize("false") as boolean).toBe(false);
    });

    it("should deserialize null", () => {
      expect(jsonSerializationAdapter.deserialize("null") as null).toBeNull();
    });

    it("should deserialize arrays", () => {
      const jsonStr = '[1,2,3,"four",true]';
      const result = jsonSerializationAdapter.deserialize(jsonStr) as (number | string | boolean)[];

      expect(result).toEqual([1, 2, 3, "four", true]);
    });

    it("should deserialize nested objects", () => {
      const jsonStr =
        '{"id":"1","nested":{"field1":"value","field2":42,"field3":true},"array":["item1","item2"],"nullField":null}';
      const result = jsonSerializationAdapter.deserialize(jsonStr) as ComplexObject;

      expect(result).toEqual({
        id: "1",
        nested: {
          field1: "value",
          field2: 42,
          field3: true,
        },
        array: ["item1", "item2"],
        nullField: null,
      });
    });

    it("should deserialize empty objects", () => {
      const result = jsonSerializationAdapter.deserialize("{}") as Record<string, never>;
      expect(result).toEqual({});
    });

    it("should deserialize empty arrays", () => {
      const result = jsonSerializationAdapter.deserialize("[]") as never[];
      expect(result).toEqual([]);
    });

    it("should handle strings with special characters", () => {
      const jsonStr = '{"message":"Hello\\nWorld\\t!","unicode":"Hello 世界 🌍","quotes":"He said \\"hello\\""}';
      const result = jsonSerializationAdapter.deserialize(jsonStr) as {
        message: string;
        unicode: string;
        quotes: string;
      };

      expect(result.message).toBe("Hello\nWorld\t!");
      expect(result.unicode).toBe("Hello 世界 🌍");
      expect(result.quotes).toBe('He said "hello"');
    });

    it("should throw on invalid JSON", () => {
      expect(() => jsonSerializationAdapter.deserialize("{invalid}")).toThrow();
      expect(() => jsonSerializationAdapter.deserialize("")).toThrow();
      expect(() => jsonSerializationAdapter.deserialize("{")).toThrow();
    });

    it("should throw on malformed JSON", () => {
      expect(() => jsonSerializationAdapter.deserialize('{"key": undefined}')).toThrow();
      expect(() => jsonSerializationAdapter.deserialize('{"key": function(){}}')).toThrow();
    });
  });

  describe("round-trip serialization", () => {
    it("should maintain data integrity through serialize-deserialize cycle", () => {
      const original: TestUser = {
        id: "123",
        name: "Jane Doe",
        email: "jane@example.com",
        age: 28,
        active: false,
      };

      const serialized = jsonSerializationAdapter.serialize(original);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as TestUser;

      expect(deserialized).toEqual(original);
    });

    it("should handle complex objects through round-trip", () => {
      const original: ComplexObject = {
        id: "complex-1",
        nested: {
          field1: "test",
          field2: 999,
          field3: false,
        },
        array: ["a", "b", "c"],
        nullField: null,
      };

      const serialized = jsonSerializationAdapter.serialize(original);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as ComplexObject;

      expect(deserialized).toEqual(original);
    });

    it("should handle arrays through round-trip", () => {
      const original = [
        { id: "1", value: "first" },
        { id: "2", value: "second" },
        { id: "3", value: "third" },
      ];

      const serialized = jsonSerializationAdapter.serialize(original);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as Array<{
        id: string;
        value: string;
      }>;

      expect(deserialized).toEqual(original);
    });

    it("should preserve types through round-trip", () => {
      const original = {
        number: 42,
        string: "hello",
        boolean: true,
        nullValue: null,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
      };

      const serialized = jsonSerializationAdapter.serialize(original);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof original;

      expect(typeof deserialized.number).toBe("number");
      expect(typeof deserialized.string).toBe("string");
      expect(typeof deserialized.boolean).toBe("boolean");
      expect(deserialized.nullValue).toBeNull();
      expect(Array.isArray(deserialized.array)).toBe(true);
      expect(typeof deserialized.nested).toBe("object");
    });

    it("should handle large objects efficiently", () => {
      const largeObj = {
        id: "large",
        data: Array.from({ length: 1000 }, (_, i) => ({
          index: i,
          value: `item-${i}`,
          timestamp: Date.now(),
        })),
      };

      const serialized = jsonSerializationAdapter.serialize(largeObj);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof largeObj;

      expect(deserialized.data).toHaveLength(1000);
      expect(deserialized).toEqual(largeObj);
    });
  });

  describe("edge cases", () => {
    it("should handle objects with only null values", () => {
      const obj = { a: null, b: null };
      const serialized = jsonSerializationAdapter.serialize(obj);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof obj;

      expect(deserialized).toEqual(obj);
    });

    it("should handle deeply nested objects", () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "deep",
              },
            },
          },
        },
      };

      const serialized = jsonSerializationAdapter.serialize(deeplyNested);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof deeplyNested;

      expect(deserialized).toEqual(deeplyNested);
    });

    it("should handle arrays with mixed types", () => {
      const mixedArray = [1, "two", true, null, { nested: "object" }, [1, 2, 3]];

      const serialized = jsonSerializationAdapter.serialize(mixedArray);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof mixedArray;

      expect(deserialized).toEqual(mixedArray);
    });

    it("should handle objects with numeric keys", () => {
      const obj: Record<string, string> = {
        "1": "one",
        "2": "two",
        "100": "hundred",
      };

      const serialized = jsonSerializationAdapter.serialize(obj);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof obj;

      expect(deserialized).toEqual(obj);
    });

    it("should handle zero values", () => {
      const obj = {
        zero: 0,
        emptyString: "",
        false: false,
        nullValue: null,
      };

      const serialized = jsonSerializationAdapter.serialize(obj);
      const deserialized = jsonSerializationAdapter.deserialize(serialized) as typeof obj;

      expect(deserialized).toEqual(obj);
      expect(deserialized.zero).toBe(0);
      expect(deserialized.emptyString).toBe("");
      expect(deserialized.false).toBe(false);
      expect(deserialized.nullValue).toBeNull();
    });
  });
});
