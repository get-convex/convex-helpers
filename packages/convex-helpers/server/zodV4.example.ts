/**
 * Zod v4 Examples for Convex
 * 
 * This file demonstrates all the new features available in Zod v4
 * integrated with Convex helpers.
 */

import { defineSchema, defineTable, queryGeneric, mutationGeneric, actionGeneric } from "convex/server";
import type { DataModelFromSchemaDefinition, QueryBuilder, MutationBuilder, ActionBuilder } from "convex/server";
import { v } from "convex/values";
import {
  z,
  zidV4,
  zCustomQueryV4,
  zCustomMutationV4,
  zCustomActionV4,
  zodV4ToConvexFields,
  withSystemFieldsV4,
  SchemaRegistry,
  stringFormats,
  numberFormats,
  fileSchema,
} from "./zodV4.js";
import { customCtx } from "./customFunctions.js";

// ========================================
// 1. Enhanced String Format Validation
// ========================================

const userProfileSchema = z.object({
  // v4: Direct string format methods
  email: stringFormats.email(),
  website: stringFormats.url(),
  userId: stringFormats.uuid(),
  ipAddress: stringFormats.ip(),
  createdAt: stringFormats.datetime(),
  avatar: stringFormats.base64().optional(),
  bio: z.string().max(500),
  
  // v4: Custom regex patterns
  username: stringFormats.regex(/^[a-zA-Z0-9_]{3,20}$/),
  
  // v4: JSON string that parses to object
  preferences: stringFormats.json().pipe(
    z.object({
      theme: z.enum(["light", "dark"]),
      notifications: z.boolean(),
      language: z.string(),
    })
  ),
});

// ========================================
// 2. Precise Number Types
// ========================================

const productSchema = z.object({
  id: zidV4("products"),
  name: z.string(),
  
  // v4: Precise numeric types
  quantity: numberFormats.uint32(), // 0 to 4,294,967,295
  price: numberFormats.float64().positive(),
  discount: numberFormats.int8().min(0).max(100), // percentage
  rating: numberFormats.float32().min(0).max(5),
  
  // v4: Safe integers only
  views: numberFormats.safe(),
});

// ========================================
// 3. Metadata and JSON Schema Generation
// ========================================

const registry = SchemaRegistry.getInstance();

// Define schema with metadata
const orderSchema = z.object({
  id: zidV4("orders").metadata({
    description: "Unique order identifier",
    example: "k5x8w9b2n4m6v8c1",
  }),
  
  customerId: zidV4("users").metadata({
    description: "Reference to the customer who placed the order",
  }),
  
  items: z.array(z.object({
    productId: zidV4("products"),
    quantity: numberFormats.positive().int(),
    price: z.number().positive(),
  })).metadata({
    description: "List of items in the order",
    minItems: 1,
  }),
  
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"])
    .metadata({
      description: "Current order status",
      default: "pending",
    }),
  
  total: z.number().positive(),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().length(2),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.string().length(2),
  }),
  
  notes: z.string().optional(),
});

// Register schema with metadata
registry.register("Order", orderSchema);
registry.setMetadata(orderSchema, {
  title: "Order Schema",
  description: "E-commerce order with items and shipping details",
  version: "2.0.0",
  tags: ["order", "e-commerce"],
});

// Generate JSON Schema for client validation
const orderJsonSchema = registry.generateJsonSchema(orderSchema);

// ========================================
// 4. File Handling (for Actions)
// ========================================

const uploadSchema = z.object({
  file: fileSchema(),
  category: z.enum(["avatar", "document", "image"]),
  description: z.string().optional(),
});

// ========================================
// 5. Advanced Validation Patterns
// ========================================

// Discriminated unions with metadata
const notificationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("email"),
    recipient: stringFormats.email(),
    subject: z.string(),
    body: z.string(),
    attachments: z.array(fileSchema()).optional(),
  }).metadata({ icon: "📧" }),
  
  z.object({
    type: z.literal("sms"),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    message: z.string().max(160),
  }).metadata({ icon: "💬" }),
  
  z.object({
    type: z.literal("push"),
    deviceToken: z.string(),
    title: z.string().max(50),
    body: z.string().max(100),
    data: z.record(z.string(), z.any()).optional(),
  }).metadata({ icon: "📱" }),
]);

// Recursive schemas
type Comment = {
  id: string;
  author: string;
  content: string;
  replies?: Comment[];
  createdAt: string;
};

const commentSchema: z.ZodType<Comment> = z.lazy(() =>
  z.object({
    id: stringFormats.uuid(),
    author: zidV4("users"),
    content: z.string().min(1).max(1000),
    replies: z.array(commentSchema).optional(),
    createdAt: stringFormats.datetime(),
  })
);

// ========================================
// 6. Convex Schema Definition with v4
// ========================================

const schema = defineSchema({
  users: defineTable(zodV4ToConvexFields(userProfileSchema)),
  products: defineTable(zodV4ToConvexFields(productSchema)),
  orders: defineTable(zodV4ToConvexFields(orderSchema))
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),
  notifications: defineTable(zodV4ToConvexFields({
    ...notificationSchema.shape,
    sentAt: stringFormats.datetime().optional(),
    readAt: stringFormats.datetime().optional(),
  })),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
const action = actionGeneric as ActionBuilder<DataModel, "public">;

// ========================================
// 7. Custom Functions with v4 Features
// ========================================

// Create authenticated query builder with v4
const authenticatedQuery = zCustomQueryV4(
  query,
  customCtx(async (ctx) => {
    // Authentication logic here
    return {
      userId: "user123" as const,
      permissions: ["read", "write"] as const,
    };
  })
);

// Query with advanced validation and metadata
export const searchProducts = authenticatedQuery({
  args: {
    query: z.string().min(1).max(100),
    filters: z.object({
      minPrice: numberFormats.positive().optional(),
      maxPrice: numberFormats.positive().optional(),
      categories: z.array(z.string()).optional(),
      inStock: z.boolean().default(true),
    }).optional(),
    
    // v4: Advanced pagination with metadata
    pagination: z.object({
      cursor: z.string().optional(),
      limit: numberFormats.int().min(1).max(100).default(20),
    }).optional(),
  },
  
  handler: async (ctx, args) => {
    // Implementation would search products
    return {
      results: [],
      nextCursor: null,
      totalCount: 0,
    };
  },
  
  returns: z.object({
    results: z.array(productSchema),
    nextCursor: z.string().nullable(),
    totalCount: numberFormats.nonnegative().int(),
  }),
  
  // v4: Function metadata
  metadata: {
    description: "Search products with advanced filtering",
    tags: ["search", "products"],
    rateLimit: {
      requests: 100,
      window: "1m",
    },
  },
});

// Mutation with complex validation
export const createOrder = zCustomMutationV4(
  mutation,
  customCtx(async (ctx) => ({ userId: "user123" }))
)({
  args: {
    items: z.array(z.object({
      productId: zidV4("products"),
      quantity: numberFormats.positive().int().max(999),
    })).min(1).max(50),
    
    shippingAddress: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().length(2).toUpperCase(),
      zip: z.string().regex(/^\d{5}(-\d{4})?$/),
      country: z.string().length(2).toUpperCase().default("US"),
    }),
    
    // v4: Conditional validation
    paymentMethod: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("credit_card"),
        last4: z.string().length(4),
        expiryMonth: numberFormats.int().min(1).max(12),
        expiryYear: numberFormats.int().min(new Date().getFullYear()),
      }),
      z.object({
        type: z.literal("paypal"),
        email: stringFormats.email(),
      }),
      z.object({
        type: z.literal("crypto"),
        wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        currency: z.enum(["BTC", "ETH", "USDC"]),
      }),
    ]),
    
    couponCode: z.string().regex(/^[A-Z0-9]{5,10}$/).optional(),
  },
  
  handler: async (ctx, args) => {
    // Validate inventory, calculate total, create order
    const orderId = await ctx.db.insert("orders", {
      customerId: ctx.userId,
      items: args.items,
      status: "pending",
      total: 0, // Would be calculated
      shippingAddress: args.shippingAddress,
      notes: `Payment: ${args.paymentMethod.type}`,
    });
    
    return { orderId, estimatedDelivery: new Date().toISOString() };
  },
  
  returns: z.object({
    orderId: zidV4("orders"),
    estimatedDelivery: stringFormats.datetime(),
  }),
  
  metadata: {
    description: "Create a new order with validation",
    requiresAuth: true,
  },
});

// Action with file upload
export const uploadAvatar = zCustomActionV4(
  action,
  customCtx(async (ctx) => ({ userId: "user123" }))
)({
  args: {
    imageData: z.string().base64(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  },
  
  handler: async (ctx, args) => {
    // Process image upload to storage
    // Return URL of uploaded image
    return {
      url: "https://example.com/avatar.jpg",
      size: 12345,
    };
  },
  
  returns: z.object({
    url: stringFormats.url(),
    size: numberFormats.positive().int(),
  }),
});

// ========================================
// 8. Error Handling with v4
// ========================================

export const validateUserInput = authenticatedQuery({
  args: {
    data: z.object({
      email: stringFormats.email(),
      age: numberFormats.int().min(13).max(120),
      website: stringFormats.url().optional(),
      interests: z.array(z.string()).min(1).max(10),
    }),
  },
  
  handler: async (ctx, args) => {
    // v4 provides better error messages
    try {
      // Process validated data
      return { success: true, data: args.data };
    } catch (error) {
      // Enhanced error information available
      return { 
        success: false, 
        error: "Validation failed",
        details: error,
      };
    }
  },
});

// ========================================
// 9. Type-safe Client Usage Example
// ========================================

// The generated types can be used on the client:
type SearchProductsArgs = z.input<typeof searchProducts._args>;
type SearchProductsReturn = z.output<typeof searchProducts._returns>;

// Client can also use the JSON Schema for validation:
const clientValidation = orderJsonSchema;

// ========================================
// 10. Migration Helper from v3 to v4
// ========================================

// Helper to migrate v3 schemas to v4
export const migrateSchema = <T extends z.ZodTypeAny>(
  v3Schema: T,
  metadata?: Record<string, any>
): T => {
  if (metadata) {
    SchemaRegistry.getInstance().setMetadata(v3Schema, metadata);
  }
  return v3Schema;
};

// Example migration
const legacyUserSchema = z.object({
  email: z.string().email(), // v3 style
  created: z.string(),
});

const modernUserSchema = z.object({
  email: stringFormats.email(), // v4 style
  created: stringFormats.datetime(),
}).metadata({
  migrated: true,
  version: "4.0",
});