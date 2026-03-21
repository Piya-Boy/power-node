import { CredentialType } from "@/generated/prisma";

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "number" | "textarea";
  required: boolean;
  placeholder?: string;
  description?: string;
}

export interface CredentialSchema {
  type: CredentialType;
  label: string;
  description: string;
  docsUrl?: string;
  fields: CredentialField[];
  /**
   * If true, the value field holds a JSON object string.
   * Otherwise it's a single string value.
   */
  isJson: boolean;
}

export const credentialSchemas: Record<string, CredentialSchema> = {
  [CredentialType.OPENAI]: {
    type: CredentialType.OPENAI,
    label: "OpenAI",
    description: "API key for OpenAI GPT models",
    docsUrl: "https://platform.openai.com/api-keys",
    isJson: false,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "sk-...",
        description: "Your OpenAI API key from platform.openai.com",
      },
    ],
  },
  [CredentialType.ANTHROPIC]: {
    type: CredentialType.ANTHROPIC,
    label: "Anthropic",
    description: "API key for Claude models",
    docsUrl: "https://console.anthropic.com/",
    isJson: false,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "sk-ant-...",
      },
    ],
  },
  [CredentialType.GEMINI]: {
    type: CredentialType.GEMINI,
    label: "Google Gemini",
    description: "API key for Google Gemini models",
    docsUrl: "https://ai.google.dev/",
    isJson: false,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "AIza...",
      },
    ],
  },
  [CredentialType.TELEGRAM]: {
    type: CredentialType.TELEGRAM,
    label: "Telegram Bot",
    description: "Bot token from Telegram BotFather",
    docsUrl: "https://core.telegram.org/bots#botfather",
    isJson: false,
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        type: "password",
        required: true,
        placeholder: "1234567890:ABC...",
        description: "Token from @BotFather",
      },
    ],
  },
  [CredentialType.NOTION]: {
    type: CredentialType.NOTION,
    label: "Notion",
    description: "Notion integration token",
    docsUrl: "https://www.notion.so/my-integrations",
    isJson: false,
    fields: [
      {
        key: "apiKey",
        label: "Integration Token",
        type: "password",
        required: true,
        placeholder: "secret_...",
      },
    ],
  },
  [CredentialType.GOOGLE]: {
    type: CredentialType.GOOGLE,
    label: "Google OAuth",
    description: "Google OAuth credentials for Sheets, Drive, Gmail, Calendar",
    docsUrl: "https://console.cloud.google.com/",
    isJson: true,
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        type: "password",
        required: true,
      },
      {
        key: "refreshToken",
        label: "Refresh Token",
        type: "password",
        required: true,
      },
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
    ],
  },
  [CredentialType.GITHUB_TOKEN]: {
    type: CredentialType.GITHUB_TOKEN,
    label: "GitHub",
    description: "GitHub personal access token",
    docsUrl: "https://github.com/settings/tokens",
    isJson: false,
    fields: [
      {
        key: "token",
        label: "Personal Access Token",
        type: "password",
        required: true,
        placeholder: "ghp_...",
      },
    ],
  },
  [CredentialType.SMTP]: {
    type: CredentialType.SMTP,
    label: "SMTP Email",
    description: "SMTP server credentials for sending email",
    isJson: true,
    fields: [
      {
        key: "host",
        label: "SMTP Host",
        type: "text",
        required: true,
        placeholder: "smtp.gmail.com",
      },
      {
        key: "port",
        label: "Port",
        type: "number",
        required: true,
        placeholder: "587",
      },
      {
        key: "user",
        label: "Username",
        type: "email",
        required: true,
      },
      {
        key: "pass",
        label: "Password",
        type: "password",
        required: true,
      },
    ],
  },
  [CredentialType.POSTGRES]: {
    type: CredentialType.POSTGRES,
    label: "PostgreSQL",
    description: "PostgreSQL database connection",
    isJson: true,
    fields: [
      {
        key: "connectionString",
        label: "Connection String",
        type: "password",
        required: false,
        placeholder: "postgresql://user:pass@host:5432/db",
        description: "Full connection string (overrides individual fields)",
      },
      {
        key: "host",
        label: "Host",
        type: "text",
        required: false,
        placeholder: "localhost",
      },
      {
        key: "port",
        label: "Port",
        type: "number",
        required: false,
        placeholder: "5432",
      },
      {
        key: "database",
        label: "Database",
        type: "text",
        required: false,
      },
      {
        key: "user",
        label: "Username",
        type: "text",
        required: false,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: false,
      },
    ],
  },
  [CredentialType.MYSQL]: {
    type: CredentialType.MYSQL,
    label: "MySQL",
    description: "MySQL database connection",
    isJson: true,
    fields: [
      {
        key: "host",
        label: "Host",
        type: "text",
        required: true,
        placeholder: "localhost",
      },
      {
        key: "port",
        label: "Port",
        type: "number",
        required: false,
        placeholder: "3306",
      },
      {
        key: "database",
        label: "Database",
        type: "text",
        required: true,
      },
      {
        key: "user",
        label: "Username",
        type: "text",
        required: true,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
      },
    ],
  },
  [CredentialType.OLLAMA]: {
    type: CredentialType.OLLAMA,
    label: "Ollama",
    description: "Local Ollama server configuration",
    docsUrl: "https://ollama.ai/",
    isJson: true,
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        required: true,
        placeholder: "http://localhost:11434",
      },
    ],
  },
};

export function getCredentialSchema(type: string): CredentialSchema | undefined {
  return credentialSchemas[type];
}

export function validateCredentialData(
  type: string,
  data: Record<string, unknown>,
): string[] {
  const schema = getCredentialSchema(type);
  if (!schema) return [];

  const errors: string[] = [];
  for (const field of schema.fields) {
    if (!field.required) continue;
    const value = data[field.key];
    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required field: ${field.label}`);
    }
  }
  return errors;
}

export function getRequiredCredentialTypes(): CredentialType[] {
  return Object.keys(credentialSchemas) as CredentialType[];
}
