export const GITHUB_REPO_URL = "https://github.com/aak1247/atools";

export const GITHUB_ADD_TOOL_URL = `${GITHUB_REPO_URL}?tab=readme-ov-file#%E6%96%B0%E5%A2%9E%E5%B7%A5%E5%85%B7`;

export const githubToolDirUrl = (toolSlug: string) =>
  `${GITHUB_REPO_URL}/tree/master/src/app/tools/${encodeURIComponent(toolSlug)}`;
