import React, { useState } from 'react';
import { useMutation, useQuery, useConvex } from 'convex/react';
import { api } from "../../convex/_generated/api.js";
import {
  testRecordSchema,
  settingsValueSchema,
  scoresValueSchema,
} from "../../convex/zodTestSchema.js";
import { z } from "zod/v4";
import type { GenericId } from "convex/values";

export function ZodTestPage() {
  const convex = useConvex();
  const records = useQuery(api.zodTest.list);
  const createRecord = useMutation(api.zodTest.create);
  const createMinimalRecord = useMutation(api.zodTest.createMinimal);
  const updateRecord = useMutation(api.zodTest.update);
  const deleteRecord = useMutation(api.zodTest.remove);
  const testRecordUpdateMutation = useMutation(api.zodTest.testRecordUpdate);
  const updateRecordField = useMutation(api.zodTest.updateRecordField);
  const testAdvancedFeatures = useMutation(api.zodTest.testAdvancedFeatures);

  const [selectedRecord, setSelectedRecord] =
    useState<GenericId<"zodTest"> | null>(null);
  const [newRecordName, setNewRecordName] = useState("");
  const [updateKey, setUpdateKey] = useState("");
  const [updateValue, setUpdateValue] = useState("");
  const [showRoundtripTest, setShowRoundtripTest] = useState(false);

  // Record field update state
  const [recordType, setRecordType] = useState<
    "settings" | "scores" | "metadata"
  >("settings");
  const [recordFieldKey, setRecordFieldKey] = useState("");
  const [recordFieldValue, setRecordFieldValue] = useState("");

  // Advanced features state
  const [advancedData, setAdvancedData] = useState({
    email: "",
    rating: "",
    completionRate: "",
    phone: "",
    slug: "",
    isActive: "",
    displayName: "",
    bio: "",
    socialLinks: [] as {
      platform: "twitter" | "github" | "linkedin";
      username: string;
    }[],
  });

  // Brand test results state
  const [brandTestResults, setBrandTestResults] = useState<{
    emailValue: string;
    hasBrandAtRuntime: boolean;
    reparseSuccess: boolean;
    transformsReapplied: boolean;
    reparseError?: string;
    reparsedEmail?: string;
  } | null>(null);

  // Use a stable timestamp to avoid infinite re-renders
  const [stableTimestamp] = useState(() => Date.now());

  const roundtripResult = useQuery(
    api.zodTest.testRoundtrip,
    showRoundtripTest
      ? {
          testData: {
            name: "Test Record",
            age: 30,
            settings: { theme: 1, fontSize: 16 },
            scores: { math: 95, science: null },
            profile: {
              bio: "Custom bio",
              avatar: null,
              preferences: { darkMode: true },
            },
            tags: ["test", "demo"],
            status: "active",
            coordinates: [10, 20],
            metadata: {
              customField: {
                value: "test value",
                timestamp: stableTimestamp,
                flags: { important: true },
              },
            },
          },
        }
      : "skip",
  );

  const selectedRecordData = useQuery(
    api.zodTest.get,
    selectedRecord ? { id: selectedRecord } : "skip",
  );

  const handleCreateFull = async () => {
    try {
      // Parse on client to apply transforms, then send to server
      const rawData = {
        name: newRecordName || "Test Record",
        age: 30,
        settings: { theme: 1, fontSize: 16 },
        scores: { math: 95, science: null },
        profile: {
          bio: "Custom bio",
          avatar: null,
          preferences: { darkMode: true },
        },
        tags: ["test", "demo"],
        status: "active" as const,
        coordinates: [10, 20] as [number, number],
        metadata: {
          customField: {
            value: "test value",
            timestamp: Date.now(), // This is OK in event handler
            flags: { important: true },
          },
        },
      };

      // Send raw data - let server handle parsing and transforms
      const id = await createRecord({ data: rawData });
      setSelectedRecord(id);
    } catch (error) {
      if (error instanceof Error) {
        alert(`Validation error: ${error.message}`);
      }
      console.error("Create error:", error);
    }
  };

  const handleCreateMinimal = async () => {
    try {
      // Use pick to validate only the name field
      const minimalSchema = testRecordSchema.pick({ name: true });
      const validatedData = minimalSchema.parse({
        name: newRecordName || "Minimal Record",
      });

      const id = await createMinimalRecord(validatedData);
      setSelectedRecord(id);
    } catch (error) {
      if (error instanceof Error) {
        alert(`Validation error: ${error.message}`);
      }
      console.error("Create minimal error:", error);
    }
  };

  const handleTestUpdate = async () => {
    if (!selectedRecord) return;

    try {
      // Use the imported value schemas directly
      const settingValue = updateValue
        ? settingsValueSchema.parse(Number(updateValue))
        : null;
      const scoreValue = updateValue
        ? scoresValueSchema.parse(
            updateValue === "null" ? null : Number(updateValue),
          )
        : null;

      await testRecordUpdateMutation({
        id: selectedRecord,
        settingKey: updateKey || "testSetting",
        settingValue: settingValue,
        scoreKey: updateKey || "testScore",
        scoreValue: scoreValue,
      });
    } catch (error) {
      if (error instanceof Error) {
        alert(`Validation error: ${error.message}`);
      }
      console.error("Update error:", error);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Zod to Convex Test Page</h1>

      <div
        style={{
          marginBottom: "20px",
          padding: "10px",
          border: "1px solid #ccc",
        }}
      >
        <h2>Create New Record</h2>
        <input
          type="text"
          placeholder="Record name"
          value={newRecordName}
          onChange={(e) => setNewRecordName(e.target.value)}
          style={{ marginRight: "10px" }}
        />
        <button onClick={handleCreateFull}>Create Full Record</button>
        <button onClick={handleCreateMinimal} style={{ marginLeft: "10px" }}>
          Create Minimal (Test Defaults)
        </button>
      </div>

      <div
        style={{
          marginBottom: "20px",
          padding: "10px",
          border: "1px solid #ccc",
        }}
      >
        <h2>Records List</h2>
        {records?.map(
          (record: {
            _id: GenericId<"zodTest">;
            name: string;
            _creationTime: number;
          }) => (
            <div
              key={record._id}
              style={{
                padding: "5px",
                cursor: "pointer",
                backgroundColor:
                  selectedRecord === record._id ? "#e0e0e0" : "transparent",
              }}
              onClick={() => setSelectedRecord(record._id)}
            >
              {record.name} (ID: {record._id})
            </div>
          ),
        )}
      </div>

      {
        selectedRecord && selectedRecordData && (
          <div
            style={{
              marginBottom: "20px",
              padding: "10px",
              border: "1px solid #ccc",
            }}
          >
            <h2>Selected Record Details</h2>
            <pre style={{ overflow: "auto", maxHeight: "400px" }}>
              {JSON.stringify(selectedRecordData, null, 2)}
            </pre>

            <div style={{ marginTop: "10px" }}>
              <h3>Test Record Update</h3>
              <input
                type="text"
                placeholder="Key"
                value={updateKey}
                onChange={(e) => setUpdateKey(e.target.value)}
                style={{ marginRight: "10px" }}
              />
              <input
                type="text"
                placeholder="Value (number or empty for null)"
                value={updateValue}
                onChange={(e) => setUpdateValue(e.target.value)}
                style={{ marginRight: "10px" }}
              />
              <button onClick={handleTestUpdate}>Update Settings/Scores</button>
              <button
                onClick={() => deleteRecord({ id: selectedRecord })}
                style={{ marginLeft: "10px", color: "red" }}
              >
                Delete Record
              </button>
            </div>

            <div
              style={{
                marginTop: "20px",
                borderTop: "1px solid #eee",
                paddingTop: "10px",
              }}
            >
              <h3>Test Record Field Updates</h3>
              <p style={{ fontSize: "12px", color: "#666" }}>
                Update individual fields in Records without overwriting the
                entire record
              </p>
              <select
                value={recordType}
                onChange={(e) =>
                  setRecordType(
                    e.target.value as "settings" | "scores" | "metadata",
                  )
                }
                style={{ marginRight: "10px" }}
              >
                <option value="settings">
                  Settings (Record&lt;string, number&gt;)
                </option>
                <option value="scores">
                  Scores (Record&lt;string, number | null&gt;)
                </option>
                <option value="metadata">Metadata (nested objects)</option>
              </select>
              <input
                type="text"
                placeholder="Field key"
                value={recordFieldKey}
                onChange={(e) => setRecordFieldKey(e.target.value)}
                style={{ marginRight: "10px" }}
              />
              <input
                type="text"
                placeholder={
                  recordType === "metadata"
                    ? "JSON value"
                    : "Value (empty to delete)"
                }
                value={recordFieldValue}
                onChange={(e) => setRecordFieldValue(e.target.value)}
                style={{ marginRight: "10px" }}
              />
              <button
                onClick={async () => {
                  if (!selectedRecord || !recordFieldKey) return;

                  try {
                    let value:
                      | string
                      | number
                      | null
                      | undefined
                      | Record<string, unknown> =
                      recordFieldValue === "" ? undefined : recordFieldValue;

                    // Parse and validate value based on record type using Zod schemas
                    if (value !== undefined) {
                      if (recordType === "settings") {
                        // Validate using the settings value schema
                        const settingsShape = testRecordSchema.shape.settings;
                        value = Number(value);
                        // Validate that it's a valid number for settings
                        if (isNaN(value)) {
                          throw new Error("Settings values must be numbers");
                        }
                      } else if (recordType === "scores") {
                        // Validate using the scores value schema
                        value = value === "null" ? null : Number(value);
                        if (value !== null && isNaN(value)) {
                          throw new Error(
                            "Scores values must be numbers or null",
                          );
                        }
                      } else if (recordType === "metadata") {
                        // Parse JSON for metadata
                        try {
                          value = JSON.parse(value);
                        } catch (e) {
                          throw new Error("Invalid JSON for metadata value");
                        }
                      }
                    }

                    await updateRecordField({
                      id: selectedRecord,
                      recordType,
                      fieldKey: recordFieldKey,
                      fieldValue: value,
                    });

                    setRecordFieldKey("");
                    setRecordFieldValue("");
                  } catch (error) {
                    if (error instanceof Error) {
                      alert(`Validation error: ${error.message}`);
                    }
                    console.error("Field update error:", error);
                  }
                }}
              >
                Update Field
              </button>

              {selectedRecordData && (
                <div style={{ marginTop: "10px", fontSize: "12px" }}>
                  <strong>Current {recordType}:</strong>
                  <pre
                    style={{
                      margin: "5px 0",
                      padding: "5px",
                      backgroundColor: "#f5f5f5",
                    }}
                  >
                    {JSON.stringify(selectedRecordData[recordType], null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: "20px",
                borderTop: "1px solid #eee",
                paddingTop: "10px",
              }}
            >
              <h3>Test Advanced Zod v4 Features</h3>
              <p style={{ fontSize: "12px", color: "#666" }}>
                Test transforms, refinements, and branded types
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <label style={{ fontSize: "12px" }}>
                    Email (transforms to lowercase)
                  </label>
                  <input
                    type="text"
                    placeholder="USER@EXAMPLE.com"
                    value={advancedData.email}
                    onChange={(e) =>
                      setAdvancedData({
                        ...advancedData,
                        email: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px" }}>
                    Rating (must be positive)
                  </label>
                  <input
                    type="number"
                    placeholder="5"
                    value={advancedData.rating}
                    onChange={(e) =>
                      setAdvancedData({
                        ...advancedData,
                        rating: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px" }}>
                    Completion % (rounds to 2 decimals)
                  </label>
                  <input
                    type="number"
                    placeholder="75.4567"
                    value={advancedData.completionRate}
                    onChange={(e) =>
                      setAdvancedData({
                        ...advancedData,
                        completionRate: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px" }}>
                    Phone (normalizes format)
                  </label>
                  <input
                    type="text"
                    placeholder="(555) 123-4567"
                    value={advancedData.phone}
                    onChange={(e) =>
                      setAdvancedData({
                        ...advancedData,
                        phone: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px" }}>
                    URL Slug (lowercase, hyphens)
                  </label>
                  <input
                    type="text"
                    placeholder="My Cool Page"
                    value={advancedData.slug}
                    onChange={(e) =>
                      setAdvancedData({ ...advancedData, slug: e.target.value })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px" }}>
                    Is Active (flexible: true/false/1/0)
                  </label>
                  <input
                    type="text"
                    placeholder="true, false, 1, 0"
                    value={advancedData.isActive}
                    onChange={(e) =>
                      setAdvancedData({
                        ...advancedData,
                        isActive: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "12px" }}>
                    Display Name (capitalizes words)
                  </label>
                  <input
                    type="text"
                    placeholder="john doe"
                    value={advancedData.displayName}
                    onChange={(e) =>
                      setAdvancedData({
                        ...advancedData,
                        displayName: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "12px" }}>
                    Bio (max 500 chars, trims whitespace)
                  </label>
                  <textarea
                    placeholder="  Your bio here...  "
                    value={advancedData.bio}
                    onChange={(e) =>
                      setAdvancedData({ ...advancedData, bio: e.target.value })
                    }
                    style={{ width: "100%", minHeight: "60px" }}
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!selectedRecord) {
                    alert("Please select a record first");
                    return;
                  }

                  try {
                    // Build an object with raw values
                    const rawData: Record<string, unknown> = {};

                    if (advancedData.email) rawData.email = advancedData.email;
                    if (advancedData.rating)
                      rawData.rating = Number(advancedData.rating);
                    if (advancedData.completionRate)
                      rawData.completionRate = Number(
                        advancedData.completionRate,
                      );
                    if (advancedData.phone) rawData.phone = advancedData.phone;
                    if (advancedData.slug) rawData.slug = advancedData.slug;
                    if (advancedData.isActive)
                      rawData.isActive = advancedData.isActive;

                    if (advancedData.displayName || advancedData.bio) {
                      rawData.userProfile = {
                        displayName: advancedData.displayName,
                        bio: advancedData.bio,
                        socialLinks: advancedData.socialLinks,
                      };
                    }

                    // Validate and transform using the partial schema
                    // This will apply all the transforms and branding
                    const partialSchema = testRecordSchema.partial();
                    const validatedData = partialSchema.parse(rawData);

                    // Send validated data to the mutation
                    // The client-side transforms have already been applied
                    const result = await testAdvancedFeatures({
                      id: selectedRecord,
                      email: validatedData.email,
                      rating: validatedData.rating,
                      completionRate: validatedData.completionRate,
                      phone: validatedData.phone,
                      slug: validatedData.slug,
                      isActive: validatedData.isActive,
                      userProfile: validatedData.userProfile,
                    });

                    console.log("Advanced features test result:", result);
                    alert(
                      "Advanced features applied! Check console for transformations.",
                    );

                    // Clear form
                    setAdvancedData({
                      email: "",
                      rating: "",
                      completionRate: "",
                      phone: "",
                      slug: "",
                      isActive: "",
                      displayName: "",
                      bio: "",
                      socialLinks: [],
                    });
                  } catch (error) {
                    console.error("Advanced features error:", error);
                    alert(
                      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                    );
                  }
                }}
                style={{
                  backgroundColor: "#007bff",
                  color: "white",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Apply Advanced Transforms
              </button>
            </div>
          </div>
        );
      }

      <div
        style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc" }}
      >
        <h2>Brand Preservation Test</h2>
        {selectedRecord && (
          <div>
            <button
              onClick={async () => {
                try {
                  const result = await convex.query(
                    api.zodTest.testBrandPreservation,
                    {
                      id: selectedRecord,
                    },
                  );
                  console.log("Brand preservation test:", result);
                  setBrandTestResults({
                    emailValue: result.emailValue,
                    hasBrandAtRuntime: result.hasBrandAtRuntime,
                    reparseSuccess: result.reparseSuccess,
                    transformsReapplied: result.transformsReapplied,
                    reparseError: result.reparseError,
                    reparsedEmail: result.reparsedEmail,
                  });
                } catch (error) {
                  console.error("Brand test error:", error);
                  alert("Error running brand test. Check console.");
                }
              }}
              style={{
                backgroundColor: "#28a745",
                color: "white",
                padding: "8px 16px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                marginBottom: "10px",
              }}
            >
              Test Brand Preservation
            </button>

            {brandTestResults && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "15px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "8px",
                  border: "1px solid #dee2e6",
                }}
              >
                <h4
                  style={{
                    marginTop: "0",
                    marginBottom: "15px",
                    color: "#495057",
                  }}
                >
                  Brand Test Results
                </h4>

                <div style={{ display: "grid", gap: "12px" }}>
                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "white",
                      borderRadius: "4px",
                      border: "1px solid #e9ecef",
                    }}
                  >
                    <strong style={{ color: "#6c757d" }}>Email Value:</strong>
                    <div style={{ marginTop: "5px", fontFamily: "monospace" }}>
                      {brandTestResults.emailValue || "(no email)"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "white",
                      borderRadius: "4px",
                      border: "1px solid #e9ecef",
                    }}
                  >
                    <strong style={{ color: "#6c757d" }}>
                      Runtime Brand Status:
                    </strong>
                    <div style={{ marginTop: "5px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          backgroundColor: brandTestResults.hasBrandAtRuntime
                            ? "#ffc107"
                            : "#28a745",
                          color: brandTestResults.hasBrandAtRuntime
                            ? "#000"
                            : "#fff",
                          fontSize: "14px",
                        }}
                      >
                        {brandTestResults.hasBrandAtRuntime
                          ? "⚠️ Has Brand Property"
                          : "✓ No Brand Property"}
                      </span>
                      <div
                        style={{
                          marginTop: "5px",
                          fontSize: "12px",
                          color: "#6c757d",
                        }}
                      >
                        {brandTestResults.hasBrandAtRuntime
                          ? "Brand exists at runtime (unexpected)"
                          : "Brand stripped at runtime (expected behavior)"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "white",
                      borderRadius: "4px",
                      border: "1px solid #e9ecef",
                    }}
                  >
                    <strong style={{ color: "#6c757d" }}>
                      Schema Reparse Test:
                    </strong>
                    <div style={{ marginTop: "5px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          backgroundColor: brandTestResults.reparseSuccess
                            ? "#28a745"
                            : "#dc3545",
                          color: "#fff",
                          fontSize: "14px",
                        }}
                      >
                        {brandTestResults.reparseSuccess
                          ? "✓ Reparse Successful"
                          : "✗ Reparse Failed"}
                      </span>
                      {brandTestResults.reparseError && (
                        <div
                          style={{
                            marginTop: "10px",
                            padding: "10px",
                            backgroundColor: "#f8d7da",
                            borderRadius: "4px",
                            fontSize: "12px",
                          }}
                        >
                          <strong>Error:</strong>{" "}
                          {brandTestResults.reparseError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "white",
                      borderRadius: "4px",
                      border: "1px solid #e9ecef",
                    }}
                  >
                    <strong style={{ color: "#6c757d" }}>
                      Transforms Status:
                    </strong>
                    <div style={{ marginTop: "5px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          backgroundColor: brandTestResults.transformsReapplied
                            ? "#17a2b8"
                            : "#6c757d",
                          color: "#fff",
                          fontSize: "14px",
                        }}
                      >
                        {brandTestResults.transformsReapplied
                          ? "🔄 Transforms Reapplied"
                          : "— No Transform Changes"}
                      </span>
                      {brandTestResults.transformsReapplied &&
                        brandTestResults.reparsedEmail && (
                          <div style={{ marginTop: "10px", fontSize: "12px" }}>
                            <strong>Reparsed Email:</strong>
                            <div
                              style={{
                                fontFamily: "monospace",
                                marginTop: "5px",
                              }}
                            >
                              {brandTestResults.reparsedEmail}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "10px",
                      padding: "15px",
                      backgroundColor: "#e7f3ff",
                      borderRadius: "4px",
                      fontSize: "14px",
                      lineHeight: "1.6",
                    }}
                  >
                    <strong>Summary:</strong>
                    <ul
                      style={{
                        marginTop: "10px",
                        marginBottom: "0",
                        paddingLeft: "20px",
                      }}
                    >
                      <li>
                        TypeScript believes the value is branded (compile-time
                        type safety)
                      </li>
                      <li>
                        Runtime values don't have brand properties (as expected)
                      </li>
                      <li>
                        Convex can store and retrieve branded values
                        transparently
                      </li>
                      <li>
                        Transforms are reapplied when reparsing through the
                        schema
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>;

      <div
        style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc" }}
      >
        <h2>Test Cases</h2>
        <ul style={{ lineHeight: "1.8" }}>
          <li>Create minimal record - should apply all defaults</li>
          <li>Check if record fields with defaults show correct values</li>
          <li>
            Update settings/scores with null - should preserve or apply defaults
          </li>
          <li>
            Check if tuple fields are converted to objects with numeric keys
          </li>
          <li>Verify nested objects and records work correctly</li>
          <li>
            <strong>Record Field Updates:</strong>
            <ul>
              <li>
                Add new field to settings/scores/metadata without affecting
                other fields
              </li>
              <li>Update existing field value</li>
              <li>Delete field by setting empty value</li>
              <li>Verify defaults are applied when fields are missing</li>
              <li>Test metadata with complex nested objects</li>
            </ul>
          </li>
          <li>
            <strong>Advanced Zod v4 Features:</strong>
            <ul>
              <li>Email transform: "USER@EXAMPLE.com" → "user@example.com"</li>
              <li>Positive number refinement: negative numbers should fail</li>
              <li>
                Percentage overwrite: 75.4567 → 75.46 (rounded to 2 decimals)
              </li>
              <li>Phone normalization: "(555) 123-4567" → "+15551234567"</li>
              <li>URL slug transform: "My Cool Page" → "my-cool-page"</li>
              <li>
                Flexible boolean: "true", "1", 1 → true; "false", "0", 0 → false
              </li>
              <li>Display name capitalization: "john doe" → "John Doe"</li>
              <li>Bio trimming and length validation (max 500 chars)</li>
              <li>Branded types maintain type safety throughout</li>
            </ul>
          </li>
        </ul>

        <div style={{ marginTop: "10px" }}>
          <button onClick={() => setShowRoundtripTest(!showRoundtripTest)}>
            {showRoundtripTest ? "Hide" : "Show"} Roundtrip Test
          </button>
          {showRoundtripTest && roundtripResult && (
            <pre style={{ marginTop: "10px", overflow: "auto" }}>
              {JSON.stringify(roundtripResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
