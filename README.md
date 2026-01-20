# @fimbul-works/storage

A type-safe, abstract storage system for TypeScript with a unified interface for CRUD operations across multiple backends.

[![npm version](https://badge.fury.io/js/%40fimbul-works%2Fstorage.svg)](https://www.npmjs.com/package/@fimbul-works/storage)
[![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/microsoft/TypeScript)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@fimbul-works/storage)](https://bundlephobia.com/package/@fimbul-works/storage)

## Features

- 🔷 **Type-safe** — Full TypeScript support with generics
- 🗄️ **Multiple Backends** — In-memory, file-based, Redis, and layered storage
- 🔌 **Custom Serialization** — Pluggable adapters for different data formats
- 📊 **Efficient Data Access** — Stream large datasets, batch retrieve entries, or list all keys
- 🔔 **Real-time Events** — Subscribe to document creation, updates, and deletions
- ⚠️ **Error Handling** — Specific error types for duplicate keys and missing entries

## Installation

```bash
npm install @fimbul-works/storage
```

For Redis support:

```bash
npm install redis
```

For YAML serialization support:

```bash
npm install yaml
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

// For small datasets
const allUsers = await storage.getAll();

// For large datasets, use streaming
for await (const user of storage.streamAll()) {
  console.log(user.name);
}

await storage.delete('1');
```

## Storage Backends

### In-Memory Storage

Fast storage using JavaScript's Map. Perfect for testing or temporary data.

#### Basic Usage

```typescript
import { createMemoryStorage } from '@fimbul-works/storage';

const storage = createMemoryStorage<User, 'id'>('id');
```

#### TTL (Time-To-Live) Cache

Configure in-memory storage as a temporary cache with automatic expiration:

```typescript
// Cache with 60-second TTL
const cache = createMemoryStorage<User, 'id'>('id', { ttl: 60_000 });

await cache.create({ id: '1', name: 'John', email: 'john@example.com' });

// Entry exists immediately
const user = await cache.get('1'); // Returns user

// After 60 seconds, entry automatically expires
const expiredUser = await cache.get('1'); // Returns null
```

**TTL Features:**
- ⏱️ **Automatic Expiration**: Entries expire after the configured duration
- 🔄 **TTL Reset**: Updating an entry resets its TTL
- 🧹 **Lazy Cleanup**: Expired entries are removed on access
- 🎯 **All Operations**: Works with `exists`, `get`, `getAll`, `getKeys`, `streamAll`, `update`, `delete`

```typescript
// Update resets the TTL
await cache.update({ id: '1', name: 'John Updated', email: 'john@example.com' });
// Entry now has a fresh 60-second TTL
```

### File-Based Storage

Persistent storage using the filesystem. Each entity is stored as a separate file.

```typescript
import { createFileStorage } from '@fimbul-works/storage';

const storage = createFileStorage<User, 'id'>('id', { path: './data/users' });
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

#### Custom Serialization for Redis

Use custom serialization adapters with Redis:

```typescript
import { createRedisStorage, createYamlSerializationAdapter } from '@fimbul-works/storage/redis';

const yamlRedisStorage = await createRedisStorage<User, 'id'>('id', {
  url: 'redis://localhost:6379',
  keyPrefix: 'users:',
  serializationAdapter: createYamlSerializationAdapter(),
});

await yamlRedisStorage.create({
  id: '1',
  name: 'John Doe',
  email: 'john@example.com',
});

yamlRedisStorage.close();
```

### Layered Storage (Caching)

Combine backends for cache-aside patterns. Layers are ordered top to bottom (fastest first).

```typescript
import { createLayeredStorage, createMemoryStorage, createFileStorage } from '@fimbul-works/storage';

const cache = createMemoryStorage<User, 'id'>('id');
const persistent = createFileStorage<User, 'id'>('id', { path: './data/users' });
const storage = createLayeredStorage([cache, persistent]);

// Reads check layers top-down (cache first)
const user = await storage.get('1');

// Writes persist to all layers
await storage.create({ id: '2', name: 'Jane', email: 'jane@example.com' });
```

#### TTL Cache with Persistent Storage

Combine a time-limited cache with persistent storage for optimal performance:

```typescript
import { createLayeredStorage, createMemoryStorage, createFileStorage } from '@fimbul-works/storage';

// 60-second in-memory cache
const cache = createMemoryStorage<User, 'id'>('id', { ttl: 60_000 });

// Persistent file storage
const persistent = createFileStorage<User, 'id'>('id', { path: './data/users' });

// Layered storage with cache on top
const storage = createLayeredStorage([cache, persistent]);

// First read loads from persistent storage and caches it
const user1 = await storage.get('1'); // Loads from file, caches in memory

// Subsequent reads within 60 seconds use cache
const user2 = await storage.get('1'); // Returns from cache (fast!)

// After 60 seconds, cache expires but data persists in files
const user3 = await storage.get('1'); // Reloads from file, recaches
```

All layers must share the same key field, which is automatically determined from the first layer.

**Layer behavior:**
- **exists/get**: Check layers top-down, return first match
- **getMany**: Batch retrieve multiple keys efficiently
- **create/update**: Write to all layers
- **delete**: Remove from all layers that have the key
- **getAll/streamAll/getKeys**: Merge all layers (top layer wins for duplicates)

#### Reactive Cache Sync (Event Bubbling)

Layered storage automatically keeps upper layers in sync with lower layers. If a lower-level storage (like persistent file storage) emits a change (e.g., from an external file edit), the upper layers (like an in-memory cache) automatically update their state:

```typescript
const cache = createMemoryStorage<User, 'id'>('id');
const persistent = createFileStorage<User, 'id'>('id', { path: './data/users' });
const storage = createLayeredStorage([cache, persistent]);

// If a file is modified directly on disk, the 'cache' layer
// of the 'storage' instance will automatically update!
```

## API Reference

All storage implementations implement the `Storage<T, K>` interface:

| Property/Method | Description | Type/Returns |
|----------------|-------------|--------------|
| `keyField` | Read-only field indicating which property is used as the key | `K` |
| `exists(key)` | Check if entry exists | `Promise<boolean>` |
| `create(entry)` | Create new entry | `Promise<void>` |
| `get(key)` | Retrieve entry by key | `Promise<T \| null>` |
| `getMany(keys)` | Retrieve multiple entries by keys | `Promise<T[]>` |
| `getAll()` | Retrieve all entries | `Promise<T[]>` |
| `getKeys()` | Retrieve all keys | `Promise<T[K][]>` |
| `streamAll()` | Stream all entries | `AsyncIterableIterator<T>` |
| `update(entry)` | Update existing entry | `Promise<void>` |
| `delete(key)` | Delete entry | `Promise<void>` |
| `on(event, cb)` | Subscribe to storage events | `() => void` (cleanup) |

### Error Types

- **DuplicateKeyError**: Thrown when creating an entry with an existing key
- **KeyNotFoundError**: Thrown when updating/deleting a non-existent entry

## Storage Events

All storage implementations support reactive events, allowing you to react to data changes in real-time.

```typescript
const storage = createMemoryStorage<User, 'id'>('id');

const unsubscribe = storage.on('create', (entry) => {
  console.log('New user created:', entry.name);
});

storage.on('update', (entry) => {
  console.log('User updated:', entry.id);
});

storage.on('delete', (entry) => {
  console.log('User deleted:', entry.id);
});

// Stop listening
unsubscribe();
```

### Event Support
- **MemoryStorage**: Immediate emission on local changes.
- **FileStorage**: Integrated with `chokidar` to detect external filesystem changes.
- **LayeredStorage**: Proxies top-layer events and bubbles lower-layer changes upwards.
- **RedisStorage**: ⚠️ Currently unimplemented (API provided for consistency).

> [!NOTE]
> Event support for **Redis** (via Pub/Sub) is planned for a future release. Currently, attaching a listener to a Redis storage will not result in any callbacks being triggered.

## Advanced Usage

### Streaming Large Datasets

For large datasets, use `streamAll()` to process entries efficiently without loading everything into memory:

```typescript
const storage = createFileStorage<User, 'id'>('id', { path: './data/users' });

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
const storage = createFileStorage<User, 'id'>('id', { path: './data/users' });

// Get all user IDs
const userIds = await storage.getKeys();
console.log(`Found ${userIds.length} users`);
```

### Key Type Coercion

File and Redis storage store keys as strings, but your application might use numbers or other types. Use `keyFromStorage` to convert keys back to your application type:

```typescript
interface User {
  id: number;  // Application uses numbers
  name: string;
}

// File storage with number keys
const storage = createFileStorage<User, 'id'>('id', {
  path: './data/users',
  keyFromStorage: (raw) => Number.parseInt(raw, 10),
});

await storage.create({ id: 123, name: 'John' });
const keys = await storage.getKeys();  // Returns [123] as number[]

// Redis storage with number keys
const redisStorage = await createRedisStorage<User, 'id'>('id', {
  url: 'redis://localhost:6379',
  keyFromStorage: (raw) => Number.parseInt(raw, 10),
});

await redisStorage.create({ id: 456, name: 'Jane' });
const redisKeys = await redisStorage.getKeys();  // Returns [456] as number[]
redisStorage.close();
```

### Custom Serialization

Create custom serialization adapters for different data formats.

#### JSON Serialization (Default)

JSON is the default serialization format for both file and Redis storage:

```typescript
import { createFileStorage, createJsonSerializationAdapter } from '@fimbul-works/storage';

// Default JSON adapter
const storage = createFileStorage<User, 'id'>('id', { path: './data/users' });

// Custom JSON adapter with pretty printing
const prettyJsonStorage = createFileStorage<User, 'id'>('id', {
  path: './data/users',
  adapter: {
    encoding: 'utf-8',
    fileName: (key) => `${key}.json`,
    ...createJsonSerializationAdapter({ space: 2 }),
  },
});
```

#### YAML Serialization

Use YAML for human-readable configuration files:

```typescript
import { createFileStorage, createYamlSerializationAdapter } from '@fimbul-works/storage';

const yamlStorage = createFileStorage<User, 'id'>('id', {
  path: './data/users',
  adapter: {
    encoding: 'utf-8',
    fileName: (key) => `${key}.yaml`,
    ...createYamlSerializationAdapter({ indent: 2 }),
  },
});

await yamlStorage.create({
  id: '1',
  name: 'John Doe',
  email: 'john@example.com',
});
// Creates: ./data/users/1.yaml
```

#### Custom CSV Serialization

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

const storage = createFileStorage<User, 'id'>('id', {
  path: './data/users',
  adapter: csvAdapter,
});
```

### Different Key Fields

Use any field as the unique key:

```typescript
interface Product {
  sku: string;
  name: string;
  price: number;
}

const storage = createMemoryStorage<Product, 'sku'>('sku');
await storage.create({ sku: 'ABC123', name: 'Widget', price: 9.99 });
```

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

Built with 📦 by [FimbulWorks](https://github.com/fimbul-works)
