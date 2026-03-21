import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { githubChannel } from "@/inngest/channels/github";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type GitHubData = {
  variableName?: string;
  credentialId?: string;
  operation?:
    | "list_repos"
    | "get_repo"
    | "list_issues"
    | "create_issue"
    | "list_prs"
    | "create_pr"
    | "get_file";
  owner?: string;
  repo?: string;
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  path?: string;
  labels?: string;
  state?: "open" | "closed" | "all";
};

const GITHUB_API = "https://api.github.com";

export const githubExecutor: NodeExecutor<GitHubData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(githubChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(githubChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("GitHub node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(githubChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("GitHub node: Credential is required");
  }

  if (!data.operation) {
    await publish(githubChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("GitHub node: Operation is required");
  }

  try {
    const result = await step.run("github-operation", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("GitHub node: Credential not found");
      }

      const token = decrypt(credential.value);
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      const owner = data.owner ? Handlebars.compile(data.owner)(context) : "";
      const repo = data.repo ? Handlebars.compile(data.repo)(context) : "";

      let responseData: unknown;

      switch (data.operation) {
        case "list_repos": {
          responseData = await ky
            .get(`${GITHUB_API}/user/repos`, {
              headers,
              searchParams: { sort: "updated", per_page: "100" },
            })
            .json();
          break;
        }

        case "get_repo": {
          if (!owner || !repo) {
            throw new NonRetriableError("GitHub node: Owner and repo are required");
          }
          responseData = await ky
            .get(`${GITHUB_API}/repos/${owner}/${repo}`, { headers })
            .json();
          break;
        }

        case "list_issues": {
          if (!owner || !repo) {
            throw new NonRetriableError("GitHub node: Owner and repo are required");
          }
          responseData = await ky
            .get(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
              headers,
              searchParams: { state: data.state || "open", per_page: "100" },
            })
            .json();
          break;
        }

        case "create_issue": {
          if (!owner || !repo) {
            throw new NonRetriableError("GitHub node: Owner and repo are required");
          }
          if (!data.title) {
            throw new NonRetriableError("GitHub node: Issue title is required");
          }
          const title = Handlebars.compile(data.title)(context);
          const body = data.body ? Handlebars.compile(data.body)(context) : undefined;
          const labels = data.labels
            ? data.labels.split(",").map((l) => l.trim())
            : undefined;

          responseData = await ky
            .post(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
              headers,
              json: { title, body, labels },
            })
            .json();
          break;
        }

        case "list_prs": {
          if (!owner || !repo) {
            throw new NonRetriableError("GitHub node: Owner and repo are required");
          }
          responseData = await ky
            .get(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
              headers,
              searchParams: { state: data.state || "open", per_page: "100" },
            })
            .json();
          break;
        }

        case "create_pr": {
          if (!owner || !repo) {
            throw new NonRetriableError("GitHub node: Owner and repo are required");
          }
          if (!data.title || !data.head || !data.base) {
            throw new NonRetriableError("GitHub node: Title, head, and base are required for PR");
          }
          const title = Handlebars.compile(data.title)(context);
          const body = data.body ? Handlebars.compile(data.body)(context) : undefined;
          const head = Handlebars.compile(data.head)(context);
          const base = Handlebars.compile(data.base)(context);

          responseData = await ky
            .post(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
              headers,
              json: { title, body, head, base },
            })
            .json();
          break;
        }

        case "get_file": {
          if (!owner || !repo || !data.path) {
            throw new NonRetriableError("GitHub node: Owner, repo, and path are required");
          }
          const filePath = Handlebars.compile(data.path)(context);
          responseData = await ky
            .get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, {
              headers,
            })
            .json();
          break;
        }

        default:
          throw new NonRetriableError(`GitHub node: Unknown operation "${data.operation}"`);
      }

      return {
        ...context,
        [data.variableName!]: responseData,
      };
    });

    await publish(githubChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(githubChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
