import { z } from "zod/v4";
import {
  zodToConvex,
  zBrand,
  createBrandedValidator,
  zid,
} from "convex-helpers/server/zodV4";
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const testType = zodToConvex(z.record(z.string(), z.any()));
export type TestType = z.infer<typeof testType>;

// Export individual value schemas for reuse
export const settingsValueSchema = z.number().optional().default(0);
export const scoresValueSchema = z.number().nullable().default(100);
export const metadataValueSchema = z
  .object({
    value: z.any().optional().default(null),
    timestamp: z
      .number()
      .optional()
      .default(() => Date.now()),
    flags: z.record(z.string(), z.boolean().nullable().default(false)),
  })
  .optional();

// Advanced Zod v4 schemas

// 1. Transform example - lowercase email
export const lowercaseEmailSchema = zBrand(
  z
    .string()
    .email("Must be a valid email")
    .transform((email) => email.toLowerCase()),
  "LowercaseEmail",
);

// 2. Refine example - positive number with custom message
export const positiveNumberSchema = zBrand(
  z.number().refine((n) => n > 0, {
    message: "Number must be positive",
  }),
  "PositiveNumber",
);

// 3. Overwrite example - rounded percentage (preserves number type)
export const percentageSchema = zBrand(
  z
    .number()
    .min(0, "Percentage cannot be negative")
    .max(100, "Percentage cannot exceed 100")
    .overwrite((val) => Math.round(val * 100) / 100), // Round to 2 decimals
  "Percentage",
);

// 4. Complex transform - phone number normalization
export const normalizedPhoneSchema = zBrand(
  z
    .string()
    .regex(/^\+?[\d\s()-]+$/, "Invalid phone format")
    .transform((val) => val.replace(/\D/g, "")) // Remove non-digits
    .transform((val) => {
      // Add country code if missing
      if (val.length === 10) return `+1${val}`;
      if (!val.startsWith("+")) return `+${val}`;
      return val;
    })
    .refine((val) => val.length >= 11 && val.length <= 15, {
      message: "Phone number must be 11-15 digits including country code",
    }),
  "NormalizedPhone",
);

// 5. Custom validator with Convex mapping
export const urlSlugSchema = createBrandedValidator(
  z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      "Only lowercase letters, numbers, and hyphens allowed",
    )
    .min(3, "Slug must be at least 3 characters")
    .max(50, "Slug must be at most 50 characters")
    .transform((val) => val.toLowerCase().replace(/\s+/g, "-")),
  "URLSlug",
  () => v.string(),
  {
    registryKey: "url-slug",
  },
);

// 6. Union with transform - flexible boolean
export const flexibleBooleanSchema = zBrand(
  z.union([
    z.boolean(),
    z.string().transform((s) => s.toLowerCase() === "true" || s === "1"),
    z.number().transform((n) => n !== 0),
  ]),
  "FlexibleBoolean",
);

// 7. Nested transform - user profile
export const userProfileSchema = zBrand(
  z.object({
    displayName: z
      .string()
      .min(2, "Display name must be at least 2 characters")
      .transform((name) => name.trim())
      .transform((name) => {
        // Capitalize first letter of each word
        return name.replace(/\b\w/g, (l) => l.toUpperCase());
      }),
    bio: z
      .string()
      .max(500, "Bio must be 500 characters or less")
      .optional()
      .transform((bio) => bio?.trim() || undefined),
    socialLinks: z
      .array(
        z.object({
          platform: z.enum(["twitter", "github", "linkedin"]),
          username: z.string().transform((u) => u.replace(/^@/, "")), // Remove @ if present
        }),
      )
      .optional()
      .default([]),
  }),
  "UserProfile",
);

// Define various test schemas
export const testRecordSchema = z.object({
  name: z.string(),

  // Simple optional with default
  age: z.number().optional().default(25),

  // Record with optional values that have defaults
  settings: z.record(z.string(), settingsValueSchema).default({}),

  // Record with nullable values that have defaults
  scores: z.record(z.string(), scoresValueSchema).default({}),

  // Nested object with defaults
  profile: z
    .object({
      bio: z.string().optional().default("No bio provided"),
      avatar: z.string().nullable().default("default-avatar.png"),
      preferences: z.record(z.string(), z.boolean().optional().default(false)),
    })
    .optional()
    .default({
      bio: "Default bio",
      avatar: "default.png",
      preferences: {},
    }),

  // Array with defaults
  tags: z.array(z.string()).optional().default([]),

  // Union with default
  status: z
    .union([z.literal("active"), z.literal("inactive"), z.literal("pending")])
    .optional()
    .default("pending"),

  // Tuple converted to object with _0, _1 keys
  coordinates: z.tuple([z.number(), z.number()]).optional().default([0, 0]),

  // Complex nested structure
  metadata: z.record(z.string(), metadataValueSchema).optional().default({}),

  // Advanced Zod v4 fields
  email: lowercaseEmailSchema.optional(),
  rating: positiveNumberSchema.optional(),
  completionRate: percentageSchema.optional(),
  phone: normalizedPhoneSchema.optional(),
  slug: urlSlugSchema().optional(),
  isActive: flexibleBooleanSchema.optional(),
  userProfile: userProfileSchema.optional(),

  // Related ID example
  createdBy: zid("users").optional(),

  // Date transform example - bidirectional ISO string handling
  lastModified: zBrand(
    z
      .date()
      .default(() => new Date())
      .transform((date) => date.toISOString()),
    "ISODateString",
  ).optional(),
});

// Create table with the converted schema
export const zodTestTable = defineTable(zodToConvex(testRecordSchema));

// Export the schema for use in functions
export type TestRecord = z.infer<typeof testRecordSchema>;
