import { describe, it, expect } from "vitest";

type GitHubData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  owner?: string;
  repo?: string;
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  path?: string;
};

function validateGitHubData(data: GitHubData): string | null {
  if (!data.variableName) return "Variable name is missing";
  if (!data.credentialId) return "Credential is required";
  if (!data.operation) return "Operation is required";

  const needsRepo = ["get_repo", "list_issues", "create_issue", "list_prs", "create_pr", "get_file"];
  if (needsRepo.includes(data.operation) && (!data.owner || !data.repo)) {
    return "Owner and repo are required";
  }

  if (data.operation === "create_issue" && !data.title) {
    return "Issue title is required";
  }

  if (data.operation === "create_pr") {
    if (!data.title) return "PR title is required";
    if (!data.head || !data.base) return "Head and base branches are required";
  }

  if (data.operation === "get_file" && !data.path) {
    return "File path is required";
  }

  return null;
}

describe("GitHub Executor Validation", () => {
  it("should require variable name", () => {
    expect(validateGitHubData({ credentialId: "c1", operation: "list_repos" }))
      .toBe("Variable name is missing");
  });

  it("should require credential", () => {
    expect(validateGitHubData({ variableName: "r", operation: "list_repos" }))
      .toBe("Credential is required");
  });

  it("should require operation", () => {
    expect(validateGitHubData({ variableName: "r", credentialId: "c1" }))
      .toBe("Operation is required");
  });

  it("should pass list_repos without owner/repo", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "list_repos",
    })).toBeNull();
  });

  it("should require owner and repo for get_repo", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "get_repo",
    })).toBe("Owner and repo are required");
  });

  it("should pass get_repo with owner and repo", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "get_repo",
      owner: "user", repo: "project",
    })).toBeNull();
  });

  it("should require title for create_issue", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "create_issue",
      owner: "user", repo: "project",
    })).toBe("Issue title is required");
  });

  it("should pass create_issue with title", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "create_issue",
      owner: "user", repo: "project", title: "Bug fix",
    })).toBeNull();
  });

  it("should require title, head, base for create_pr", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "create_pr",
      owner: "user", repo: "project",
    })).toBe("PR title is required");

    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "create_pr",
      owner: "user", repo: "project", title: "PR",
    })).toBe("Head and base branches are required");
  });

  it("should pass create_pr with all fields", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "create_pr",
      owner: "user", repo: "project", title: "Feature",
      head: "feature-branch", base: "main",
    })).toBeNull();
  });

  it("should require path for get_file", () => {
    expect(validateGitHubData({
      variableName: "r", credentialId: "c1", operation: "get_file",
      owner: "user", repo: "project",
    })).toBe("File path is required");
  });
});
