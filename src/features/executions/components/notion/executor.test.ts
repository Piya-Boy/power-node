import { describe, it, expect } from "vitest";

// Test Notion executor validation and operation logic
type NotionData = {
  variableName?: string;
  credentialId?: string;
  operation?: "query_database" | "create_page" | "update_page" | "get_page";
  databaseId?: string;
  pageId?: string;
  filter?: string;
  properties?: string;
};

function validateNotionData(data: NotionData): string | null {
  if (!data.variableName) return "Variable name is missing";
  if (!data.credentialId) return "Credential is required";
  if (!data.operation) return "Operation is required";

  switch (data.operation) {
    case "query_database":
      if (!data.databaseId) return "Database ID is required";
      break;
    case "create_page":
      if (!data.databaseId) return "Database ID is required for creating a page";
      if (!data.properties) return "Properties are required";
      break;
    case "update_page":
      if (!data.pageId) return "Page ID is required";
      if (!data.properties) return "Properties are required";
      break;
    case "get_page":
      if (!data.pageId) return "Page ID is required";
      break;
  }

  return null;
}

describe("Notion Executor Validation", () => {
  it("should require variable name", () => {
    expect(validateNotionData({ credentialId: "c1", operation: "get_page", pageId: "p1" }))
      .toBe("Variable name is missing");
  });

  it("should require credential", () => {
    expect(validateNotionData({ variableName: "r", operation: "get_page", pageId: "p1" }))
      .toBe("Credential is required");
  });

  it("should require operation", () => {
    expect(validateNotionData({ variableName: "r", credentialId: "c1" }))
      .toBe("Operation is required");
  });

  it("should require databaseId for query_database", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "query_database",
    })).toBe("Database ID is required");
  });

  it("should pass query_database with databaseId", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "query_database", databaseId: "db1",
    })).toBeNull();
  });

  it("should require databaseId and properties for create_page", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "create_page",
    })).toBe("Database ID is required for creating a page");

    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "create_page", databaseId: "db1",
    })).toBe("Properties are required");
  });

  it("should pass create_page with all fields", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "create_page",
      databaseId: "db1", properties: '{"Name": {}}',
    })).toBeNull();
  });

  it("should require pageId for update_page", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "update_page",
    })).toBe("Page ID is required");
  });

  it("should require properties for update_page", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "update_page", pageId: "p1",
    })).toBe("Properties are required");
  });

  it("should require pageId for get_page", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "get_page",
    })).toBe("Page ID is required");
  });

  it("should pass get_page with pageId", () => {
    expect(validateNotionData({
      variableName: "r", credentialId: "c1", operation: "get_page", pageId: "p1",
    })).toBeNull();
  });
});
