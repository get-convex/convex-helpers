# Zod v4 Integration for Convex

This module provides enhanced Zod v4 integration with Convex, featuring all the latest improvements and new capabilities introduced in Zod v4.

## Installation

```bash
npm install convex-helpers zod@latest
```

## Key Features

### 🚀 Performance Improvements
- 14x faster string parsing
- 7x faster array parsing  
- 6.5x faster object parsing
- 100x reduction in TypeScript type instantiations
- 2x reduction in core bundle size

### 📝 Enhanced String Validation

```typescript
import { stringFormats } from "convex-helpers/server/zodV4";

const userSchema = z.object({
  email: stringFormats.email(),
  website: stringFormats.url(),
  userId: stringFormats.uuid(),
  ipAddress: stringFormats.ip(),
  createdAt: stringFormats.datetime(),
  avatar: stringFormats.base64(),
  username: stringFormats.regex(/^[a-zA-Z0-9_]{3,20}$/),
  settings: stringFormats.json(), // Parses JSON strings
});
```

### 🔢 Precise Number Types

```typescript
import { numberFormats } from "convex-helpers/server/zodV4";

const productSchema = z.object({
  quantity: numberFormats.uint32(),    // 0 to 4,294,967,295
  price: numberFormats.float64(),      
  discount: numberFormats.int8(),      // -128 to 127
  rating: numberFormats.float32(),
  views: numberFormats.safe(),         // Safe integers only
});
```

### 🏷️ Metadata and JSON Schema Generation

```typescript
import { SchemaRegistry, zidV4 } from "convex-helpers/server/zodV4";

const registry = SchemaRegistry.getInstance();

const orderSchema = z.object({
  id: zidV4("orders").metadata({
    description: "Unique order identifier",
    example: "k5x8w9b2n4m6v8c1",
  }),
  items: z.array(z.object({
    productId: zidV4("products"),
    quantity: z.number().int().positive(),
  })).metadata({
    description: "Order items",
    minItems: 1,
  }),
});

// Register and generate JSON Schema
registry.register("Order", orderSchema);
const jsonSchema = registry.generateJsonSchema(orderSchema);
```

### 📁 File Validation Support

```typescript
import { fileSchema } from "convex-helpers/server/zodV4";

const uploadSchema = z.object({
  file: fileSchema(),
  category: z.enum(["avatar", "document", "image"]),
});
```

### 🔧 Enhanced Custom Functions

```typescript
import { zCustomQueryV4 } from "convex-helpers/server/zodV4";

const authenticatedQuery = zCustomQueryV4(query, {
  args: { sessionId: v.id("sessions") },
  input: async (ctx, args) => {
    const user = await getUser(ctx, args.sessionId);
    return { ctx: { user }, args: {} };
  },
});

export const searchProducts = authenticatedQuery({
  args: {
    query: z.string().min(1),
    filters: z.object({
      minPrice: z.number().positive().optional(),
      categories: z.array(z.string()).optional(),
    }),
  },
  handler: async (ctx, args) => {
    // Implementation
  },
  returns: z.object({
    results: z.array(productSchema),
    totalCount: z.number(),
  }),
  metadata: {
    description: "Search products with filters",
    rateLimit: { requests: 100, window: "1m" },
  },
});
```

## Migration Guide

### From Zod v3 to v4

1. **Import Changes**
```typescript
// Old (v3)
import { zCustomQuery, zid } from "convex-helpers/server/zod";

// New (v4)
import { zCustomQueryV4, zidV4 } from "convex-helpers/server/zodV4";
```

2. **String Validation**
```typescript
// Old (v3)
email: z.string().email()

// New (v4) - Better performance
email: stringFormats.email()
```

3. **Error Handling**
```typescript
// v4 provides enhanced error reporting
const parsed = schema.safeParse(data);
if (!parsed.success) {
  // Enhanced error format with better messages
  console.log(parsed.error.format());
}
```

4. **Metadata Support**
```typescript
// v4 adds native metadata support
const schema = z.object({
  field: z.string()
}).metadata({
  description: "My schema",
  version: "1.0.0"
});
```

## Complete Example

```typescript
import { defineSchema, defineTable } from "convex/server";
import { 
  z, 
  zodV4ToConvexFields, 
  withSystemFieldsV4,
  SchemaRegistry,
  stringFormats,
  numberFormats 
} from "convex-helpers/server/zodV4";

// Define schema with v4 features
const userSchema = z.object({
  email: stringFormats.email(),
  name: z.string().min(1).max(100),
  age: numberFormats.int().min(13).max(120),
  website: stringFormats.url().optional(),
  preferences: stringFormats.json(),
  createdAt: stringFormats.datetime(),
});

// Add system fields and metadata
const userWithSystemFields = withSystemFieldsV4("users", userSchema, {
  description: "User profile data",
  version: "2.0.0",
});

// Define Convex schema
export default defineSchema({
  users: defineTable(zodV4ToConvexFields(userWithSystemFields)),
});

// Generate JSON Schema for client validation
const registry = SchemaRegistry.getInstance();
const jsonSchema = registry.generateJsonSchema(userSchema);
```

## API Reference

### String Formats
- `email()` - Email validation
- `url()` - URL validation
- `uuid()` - UUID v4 validation
- `datetime()` - ISO 8601 datetime
- `ip()` - IP address (v4 or v6)
- `ipv4()` - IPv4 only
- `ipv6()` - IPv6 only
- `base64()` - Base64 encoded strings
- `json()` - JSON strings with parsing
- `regex(pattern)` - Custom regex patterns

### Number Formats
- `int()` - Integer validation
- `positive()` - Positive numbers
- `negative()` - Negative numbers
- `safe()` - Safe integers
- `int8()` - 8-bit integers
- `uint8()` - Unsigned 8-bit
- `int16()` - 16-bit integers
- `uint16()` - Unsigned 16-bit
- `int32()` - 32-bit integers
- `uint32()` - Unsigned 32-bit
- `float32()` - 32-bit float
- `float64()` - 64-bit float

### Custom Functions
- `zCustomQueryV4()` - Enhanced query builder
- `zCustomMutationV4()` - Enhanced mutation builder
- `zCustomActionV4()` - Enhanced action builder

### Utilities
- `zodV4ToConvex()` - Convert Zod to Convex validator
- `zodV4ToConvexFields()` - Convert Zod object fields
- `convexToZodV4()` - Convert Convex to Zod validator
- `withSystemFieldsV4()` - Add Convex system fields
- `SchemaRegistry` - Manage schemas and metadata

## Best Practices

1. **Use specific validators**: Prefer `stringFormats.email()` over `z.string().email()` for better performance
2. **Add metadata**: Document your schemas with descriptions and examples
3. **Generate JSON schemas**: Use for client-side validation and API documentation
4. **Leverage discriminated unions**: For type-safe conditional validation
5. **Use precise number types**: Choose appropriate integer/float types for your data

## Performance Tips

- Zod v4 is significantly faster - upgrade for immediate performance gains
- Use `z.discriminatedUnion()` instead of `z.union()` when possible
- Avoid deeply nested schemas when not necessary
- Cache generated JSON schemas for reuse

## Compatibility

- Requires Zod 3.22.4 or later (latest recommended)
- Compatible with all Convex versions that support custom functions
- TypeScript 5.5+ recommended for best type inference