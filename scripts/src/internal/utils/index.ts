import { $ } from "bun";

export async function findGitRoot(): Promise<string> {
  try {
    const gitRoot = await $`git rev-parse --show-toplevel`.text();
    return gitRoot.trim();
  } catch (error) {
    throw new Error("Not in a git repository or git not found");
  }
}
