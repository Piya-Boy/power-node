import { describe, it, expect } from "vitest";
import { CredentialType } from "@/generated/prisma";
import {
  credentialSchemas,
  getCredentialSchema,
  validateCredentialData,
  getRequiredCredentialTypes,
} from "./credential-schema";

describe("Credential Schema", () => {
  it("should have schemas for all credential types", () => {
    const allTypes = Object.values(CredentialType);
    for (const type of allTypes) {
      expect(credentialSchemas[type], `Missing schema for ${type}`).toBeDefined();
    }
  });

  it("should have non-empty labels and descriptions", () => {
    for (const schema of Object.values(credentialSchemas)) {
      expect(schema.label.length).toBeGreaterThan(0);
      expect(schema.description.length).toBeGreaterThan(0);
    }
  });

  it("should have at least one field per schema", () => {
    for (const schema of Object.values(credentialSchemas)) {
      expect(schema.fields.length).toBeGreaterThan(0);
    }
  });

  it("should have valid field types", () => {
    const validTypes = ["text", "password", "url", "email", "number", "textarea"];
    for (const schema of Object.values(credentialSchemas)) {
      for (const field of schema.fields) {
        expect(validTypes).toContain(field.type);
      }
    }
  });

  describe("getCredentialSchema", () => {
    it("should return schema for known type", () => {
      const schema = getCredentialSchema(CredentialType.OPENAI);
      expect(schema).toBeDefined();
      expect(schema?.label).toBe("OpenAI");
    });

    it("should return undefined for unknown type", () => {
      expect(getCredentialSchema("UNKNOWN")).toBeUndefined();
    });
  });

  describe("validateCredentialData", () => {
    it("should validate OpenAI requires apiKey", () => {
      const errors = validateCredentialData(CredentialType.OPENAI, {});
      expect(errors).toContain("Missing required field: API Key");
    });

    it("should pass valid OpenAI data", () => {
      const errors = validateCredentialData(CredentialType.OPENAI, { apiKey: "sk-test" });
      expect(errors).toHaveLength(0);
    });

    it("should validate SMTP requires host, port, user, pass", () => {
      const errors = validateCredentialData(CredentialType.SMTP, {});
      expect(errors.length).toBe(4); // host, port, user, pass
    });

    it("should validate MySQL required fields", () => {
      const errors = validateCredentialData(CredentialType.MYSQL, {});
      expect(errors.length).toBeGreaterThanOrEqual(4); // host, database, user, password
    });

    it("should return empty errors for unknown type", () => {
      const errors = validateCredentialData("UNKNOWN", {});
      expect(errors).toHaveLength(0);
    });

    it("should handle null values as missing", () => {
      const errors = validateCredentialData(CredentialType.OPENAI, { apiKey: null });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should handle empty string as missing", () => {
      const errors = validateCredentialData(CredentialType.GITHUB_TOKEN, { token: "" });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("getRequiredCredentialTypes", () => {
    it("should return array of credential types", () => {
      const types = getRequiredCredentialTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });

    it("should include common types", () => {
      const types = getRequiredCredentialTypes();
      expect(types).toContain(CredentialType.OPENAI);
      expect(types).toContain(CredentialType.TELEGRAM);
      expect(types).toContain(CredentialType.GITHUB_TOKEN);
    });
  });
});
