# @fimbul-works/storage

A type-safe, abstract storage system for TypeScript with a unified interface for CRUD operations across multiple backends.

## Features

- 🔷 **Type-safe** — Full TypeScript support with generics
- ⚙️ **Unified API** — Consistent interface across all backends
- 🗄️ **Multiple Backends** — In-memory, file-based, Redis, and layered storage
- 🔌 **Custom Serialization** — Pluggable adapters for different data formats
- ⚠️ **Error Handling** — Specific error types for duplicate keys and missing entries

## Installation

```bash
npm install @fimbul-works/storage
```

For Redis support:

```bash
npm install redis
```

## Quick Start

```typescript
import { createMemoryStorage } from '@fimbul-works/storage';

interface User {
  id: string;
  name: string;
  email: string;
}

const storage = createMemoryStorage<User, 'id'>('id');

await storage.create({ id: '1', name: 'John Doe', email: 'john@example.com' });
const user = await storage.get('1');
await storage.update({ id: '1', name: 'John Updated', email: 'john@example.com' });
const allUsers = await storage.getAll();
await storage.delete('1');
```

## Storage Backends

### In-Memory Storage

Fast storage using JavaScript's Map. Perfect for testing or temporary data.

```typescript
const storage = createMemoryStorage<User, 'id'>('id');
```

### File-Based Storage

Persistent storage using the filesystem. Each entity is stored as a separate file.

```typescript
import { createFileStorage, jsonFileAdapter } from '@fimbul-works/storage';

const storage = createFileStorage<User, 'id'>('./data/users', 'id', jsonFileAdapter);
await storage.create({ id: '1', name: 'John', email: 'john@example.com' });
// Creates: ./data/users/1.json
```

### Redis Storage

Distributed storage with automatic connection management.

```typescript
import { createRedisStorage } from '@fimbul-works/storage/redis';

const storage = await createRedisStorage<User, 'id'>('id', {
  url: 'redis://localhost:6379',
  keyPrefix: 'users:',
});

await storage.create({ id: '1', name: 'John', email: 'john@example.com' });

// Close connection when done
storage.close();
```

### Layered Storage (Caching)

Combine backends for cache-aside patterns. Layers are ordered top to bottom (fastest first).

```typescript
import { createLayeredStorage, createMemoryStorage, createFileStorage } from '@fimbul-works/storage';

const cache = createMemoryStorage<User, 'id'>('id');
const persistent = createFileStorage<User, 'id'>('./data/users', 'id');
const storage = createLayeredStorage<User, 'id'>('id', [cache, persistent]);

// Reads check layers top-down (cache first)
const user = await storage.get('1');

// Writes persist to all layers
await storage.create({ id: '2', name: 'Jane', email: 'jane@example.com' });
```

**Layer behavior:**
- **exists/get**: Check layers top-down, return first match
- **create/update**: Write to all layers
- **delete**: Remove from all layers that have the key
- **getAll**: Merge all layers (top layer wins for duplicates)

## API Reference

All storage implementations implement the `Storage<T, K>` interface:

| Method | Description | Returns |
|--------|-------------|---------|
| `exists(key)` | Check if entry exists | `Promise<boolean>` |
| `create(entry)` | Create new entry | `Promise<void>` |
| `get(key)` | Retrieve entry by key | `Promise<T \| null>` |
| `getAll()` | Retrieve all entries | `Promise<T[]>` |
| `getKeys()` | Retrieve all keys | `Promise<T[K][]>` |
| `streamAll()` | Stream all entries asynchronously | `AsyncIterableIterator<T>` |
| `update(entry)` | Update existing entry | `Promise<void>` |
| `delete(key)` | Delete entry | `Promise<void>` |

### Error Types

- **DuplicateKeyError**: Thrown when creating an entry with an existing key
- **KeyNotFoundError**: Thrown when updating/deleting a non-existent entry

## Advanced Usage

### Custom Serialization

```typescript
import { createFileStorage, type FileAdapter } from '@fimbul-works/storage';

const csvAdapter: FileAdapter<User, 'id'> = {
  encoding: 'utf-8',
  fileName: (key) => `user_${key}.csv`,
  serialize: (user) => `${user.id},${user.name},${user.email}`,
  deserialize: (str) => {
    const [id, name, email] = str.split(',');
    return { id, name, email };
  },
};

const storage = createFileStorage('./data/users', 'id', csvAdapter);
```

### Different Key Fields

```typescript
interface Product {
  sku: string;
  name: string;
  price: number;
}

const storage = createMemoryStorage<Product, 'sku'>('sku');
await storage.create({ sku: 'ABC123', name: 'Widget', price: 9.99 });
```

### Streaming Large Datasets

For large datasets, use `streamAll()` to process entries efficiently without loading everything into memory:

```typescript
const storage = createFileStorage<User, 'id'>('./data/users', 'id');

// Process users one at a time
for await (const user of storage.streamAll()) {
  console.log(`Processing: ${user.name}`);
  // Send to API, perform calculations, etc.
}

// Early termination - stop after finding what you need
for await (const user of storage.streamAll()) {
  if (user.email === 'target@example.com') {
    console.log('Found target user!');
    break; // Stops iteration, saves resources
  }
}
```

### Working with Keys

Sometimes you only need the keys without loading the full entries:

```typescript
const storage = createFileStorage<User, 'id'>('./data/users', 'id');

// Get all user IDs
const userIds = await storage.getKeys();
console.log(`Found ${userIds.length} users`);
```

## License

MIT

---

Built with 📦 by [FimbulWorks](https://github.com/fimbul-works)
