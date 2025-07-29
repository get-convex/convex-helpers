import { query, mutation, action } from "./_generated/server";
import {
  zCustomQuery,
  zCustomMutation,
  zid,
  zCustomAction,
  transformZodDataForConvex,
  transformConvexDataToZod,
} from "convex-helpers/server/zodV4";
import { ConvexError } from "convex/values";

import { NoOp } from "convex-helpers/server/customFunctions";
import {
  testRecordSchema,
  settingsValueSchema,
  scoresValueSchema,
  metadataValueSchema,
  lowercaseEmailSchema,
  positiveNumberSchema,
  percentageSchema,
  normalizedPhoneSchema,
  urlSlugSchema,
  flexibleBooleanSchema,
  userProfileSchema,
} from "./zodTestSchema";
import { z } from "zod/v4";

// Use the standard zCustom functions directly - Convex needs to see these clearly
export const zQuery = zCustomQuery(query, NoOp);
export const zMutation = zCustomMutation(mutation, NoOp);
export const zAction = zCustomAction(action, NoOp);

// Create a new test record using zCustomMutation with NoOp
export const create = zMutation({
  args: { data: testRecordSchema },
  handler: async (ctx, args) => {
    // The transformation should happen automatically in the zodV4.ts layer
    console.log(
      "Creating record with args:",
      JSON.stringify(args.data, null, 2),
    );
    // args.data is already parsed and transformed by zMutation - just use it directly
    const convexData = transformZodDataForConvex(args.data, testRecordSchema);

    const docId = await ctx.db.insert("zodTest", convexData);
    console.log("Created record with ID:", docId);
    return docId;
  },
});

// Get a single record
export const get = zCustomQuery(
  query,
  NoOp,
)({
  args: { id: zid("zodTest") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    console.log("Retrieved record:", doc);
    return doc;
  },
});

// List all records
export const list = zCustomQuery(
  query,
  NoOp,
)({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("zodTest").collect();
    console.log("Listed records:", docs);
    return docs;
  },
});

// Define the update schema
const updateRecordSchema = testRecordSchema.partial();

// Update a record (partial update)
export const update = zMutation({
  args: {
    id: zid("zodTest"),
    updates: updateRecordSchema,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Record not found");

    // Args are already transformed by our wrapper
    // Merge with existing data
    const updated = { ...existing, ...args.updates };

    await ctx.db.replace(args.id, updated);
    console.log("Updated record:", updated);

    return args.id;
  },
});

// Delete a record
export const remove = zMutation({
  args: { id: zid("zodTest") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    console.log("Deleted record:", args.id);
  },
});

// Test function to create a record with minimal data
export const createMinimal = zMutation({
  args: testRecordSchema.pick({ name: true }).shape,
  handler: async (ctx, args) => {
    // Apply defaults by parsing with full schema
    const fullData = testRecordSchema.parse(args);

    // Transform the Zod-parsed data to Convex format (wrapper handles args, but we need to handle fullData)
    const convexData = transformZodDataForConvex(fullData, testRecordSchema);

    const docId = await ctx.db.insert("zodTest", convexData);
    console.log("Created minimal record with all defaults:", fullData);
    console.log("Convex-formatted data:", convexData);

    return docId;
  },
});

// Test updating record fields in different ways
export const testRecordUpdate = zMutation({
  args: {
    id: zid("zodTest"),
    settingKey: z.string(),
    settingValue: z.number().nullable().optional(),
    scoreKey: z.string(),
    scoreValue: z.number().nullable().optional(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Record not found");

    // Update settings and scores
    const updates = {
      settings: { ...existing.settings } as Record<string, number>,
      scores: { ...existing.scores } as Record<string, number | null>,
    };

    // Test different update patterns
    if (args.settingValue !== undefined) {
      updates.settings[args.settingKey] = args.settingValue ?? 0; // Apply default if null
    }

    if (args.scoreValue !== undefined) {
      updates.scores[args.scoreKey] = args.scoreValue; // Can be null
    }

    const updated = { ...existing, ...updates };
    await ctx.db.replace(args.id, updated);

    console.log("Test record update result:", {
      settingKey: args.settingKey,
      settingValue: updates.settings[args.settingKey],
      scoreKey: args.scoreKey,
      scoreValue: updates.scores[args.scoreKey],
      fullRecord: updated,
    });

    return args.id;
  },
});

// Update individual fields in Records without overwriting the entire record
export const updateRecordField = zMutation({
  args: {
    id: zid("zodTest"),
    recordType: z.enum(["settings", "scores", "metadata"]),
    fieldKey: z.string(),
    fieldValue: z.any().optional(), // undefined means delete the field
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Record not found");

    console.log(
      `Updating ${args.recordType}.${args.fieldKey} to:`,
      args.fieldValue,
    );
    console.log(`Current ${args.recordType}:`, doc[args.recordType]);

    // Type for record values based on our schemas
    type RecordValue =
      | number
      | null
      | {
          value: unknown;
          timestamp?: number;
          flags?: Record<string, boolean | null>;
        }
      | undefined;
    const recordCopy = { ...doc[args.recordType] } as Record<
      string,
      RecordValue
    >;

    if (args.fieldValue === undefined) {
      // Delete the field using destructuring to avoid dynamic delete
      const { [args.fieldKey]: _, ...newRecord } = recordCopy;
      const updates = {
        [args.recordType]: newRecord,
      };
      await ctx.db.patch(args.id, updates);
    } else {
      // Validate the value using the imported schemas
      let validatedValue: RecordValue;
      try {
        if (args.recordType === "settings") {
          validatedValue = settingsValueSchema.parse(args.fieldValue);
        } else if (args.recordType === "scores") {
          validatedValue = scoresValueSchema.parse(args.fieldValue);
        } else if (args.recordType === "metadata") {
          validatedValue = metadataValueSchema.parse(args.fieldValue);
        } else {
          throw new Error(`Unknown record type: ${args.recordType}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ConvexError(
            `Invalid value for ${args.recordType}.${args.fieldKey}: ${error.message}`,
          );
        }
        throw error;
      }

      // Update the field in our copy
      recordCopy[args.fieldKey] = validatedValue;

      // Update the entire record (since Convex doesn't support dot notation)
      const updates = {
        [args.recordType]: recordCopy,
      };
      await ctx.db.patch(args.id, updates);
    }

    const updated = await ctx.db.get(args.id);
    console.log(`Updated ${args.recordType}:`, updated?.[args.recordType]);

    return args.id;
  },
});

// Test advanced Zod v4 features
export const testAdvancedFeatures = zMutation({
  args: {
    id: zid("zodTest"),
    email: z.string().optional().nullable(),
    rating: z.number().optional().nullable(),
    completionRate: z.number().optional().nullable(),
    phone: z.string().optional().nullable(),
    slug: z.string().optional().nullable(),
    isActive: z
      .union([z.boolean(), z.string(), z.number()])
      .optional()
      .nullable(),
    userProfile: z
      .object({
        displayName: z.string(),
        bio: z.string().optional(),
        socialLinks: z
          .array(
            z.object({
              platform: z.enum(["twitter", "github", "linkedin"]),
              username: z.string(),
            }),
          )
          .optional(),
      })
      .optional()
      .nullable(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Record not found");

    // Parse each field through its respective schema to apply transforms
    const updates: Record<string, unknown> = {};

    if (args.email !== undefined) {
      updates.email = lowercaseEmailSchema.parse(args.email);
      console.log(`Email transformed: ${args.email} -> ${updates.email}`);
    }

    if (args.rating !== undefined) {
      updates.rating = positiveNumberSchema.parse(args.rating);
      console.log(`Rating validated: ${updates.rating}`);
    }

    if (args.completionRate !== undefined) {
      updates.completionRate = percentageSchema.parse(args.completionRate);
      console.log(
        `Completion rate rounded: ${args.completionRate} -> ${updates.completionRate}`,
      );
    }

    if (args.phone !== undefined) {
      updates.phone = normalizedPhoneSchema.parse(args.phone);
      console.log(`Phone normalized: ${args.phone} -> ${updates.phone}`);
    }

    if (args.slug !== undefined) {
      updates.slug = urlSlugSchema().parse(args.slug);
      console.log(`Slug transformed: ${args.slug} -> ${updates.slug}`);
    }

    if (args.isActive !== undefined) {
      updates.isActive = flexibleBooleanSchema.parse(args.isActive);
      console.log(`Boolean parsed: ${args.isActive} -> ${updates.isActive}`);
    }

    if (args.userProfile !== undefined) {
      updates.userProfile = userProfileSchema.parse(args.userProfile);
      console.log(`User profile transformed:`, updates.userProfile);
    }

    // Apply transforms to get Convex format
    const transformedUpdates = transformZodDataForConvex(
      updates,
      testRecordSchema.partial(),
    );

    await ctx.db.patch(args.id, transformedUpdates);

    return { id: args.id, updates: transformedUpdates };
  },
});

// Test roundtrip conversion
export const testRoundtrip = zQuery({
  args: {
    testData: testRecordSchema,
  },
  handler: async (ctx, args) => {
    // Data is already parsed by Zod with defaults applied and transformed by our wrapper
    console.log("Received data with defaults:", args.testData);

    // Test that defaults were applied correctly
    const tests = {
      age: args.testData.age, // Should be 25 if not provided
      settings: args.testData.settings, // Should have default 0 for missing keys
      scores: args.testData.scores, // Should have default 100 for missing keys
      profile: args.testData.profile, // Should have default object
      tags: args.testData.tags, // Should be empty array
      status: args.testData.status, // Should be "pending"
      coordinates: args.testData.coordinates, // Should be {_0: 0, _1: 0} in Convex format
      metadata: args.testData.metadata, // Should be {}
    };

    return tests;
  },
});

// Test whether brands are preserved when retrieving from database
export const testBrandPreservation = zQuery({
  args: {
    id: zid("zodTest"),
  },
  handler: async (ctx, args) => {
    // Get raw data from database
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Record not found");

    console.log("Raw doc from DB:", doc);

    // Test 1: Check if the value has brand at runtime (it shouldn't)
    const emailHasBrand =
      doc.email && typeof doc.email === "object" && "$brand" in doc.email;
    console.log("Email has brand property at runtime?", emailHasBrand);

    // Test 2: Try to parse the retrieved data through the schema again
    let reparseResult;
    let reparseError;
    try {
      // Use our schema-aware transformation to convert Convex format back to Zod format
      const docForReparsing = transformConvexDataToZod(doc, testRecordSchema);

      // This will apply transforms again (e.g., lowercase the email again)
      reparseResult = testRecordSchema.parse(docForReparsing);
      console.log("Reparsed successfully");
    } catch (e) {
      reparseError = e;
      console.log("Reparse failed:", e);
    }

    // Test 3: Check if transforms are applied when reparsing
    const transformsApplied =
      reparseResult && doc.email && reparseResult.email !== doc.email;

    return {
      emailType: typeof doc.email,
      emailValue: doc.email,
      hasBrandAtRuntime: emailHasBrand,
      reparseSuccess: !reparseError,
      reparseError: reparseError ? String(reparseError) : undefined,
      transformsReapplied: transformsApplied,
      reparsedEmail: reparseResult?.email,
      // TypeScript type info (will be stripped at runtime)
      typescriptThinksBranded: true, // TypeScript believes doc.email is branded
    };
  },
});
