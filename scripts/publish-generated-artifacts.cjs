const { spawnSync } = require("node:child_process");

const DEFAULT_FILES = [
  "public/sitemap.xml",
  "public/dog-sitemap.xml",
  "src/generated/platform-stats.json",
];

class ConcurrentPublishError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConcurrentPublishError";
  }
}

function defaultRunner(args, { cwd, timeoutMs = 30_000 } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: timeoutMs });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function runGit(runner, args, options) {
  const result = runner(args, options);
  if (result.status !== 0) {
    const error = new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
    error.result = result;
    throw error;
  }
  return result.stdout.trim();
}

function readRemoteHead(runner, remote, branch, cwd) {
  const output = runGit(runner, ["ls-remote", remote, `refs/heads/${branch}`], { cwd });
  return output.split(/\s+/)[0] || null;
}

function isTransientPushFailure(error) {
  const message = `${error?.result?.stderr || ""}\n${error?.result?.stdout || ""}\n${error?.message || ""}`.toLowerCase();
  return /internal server error|http(?:\/\d(?:\.\d)?)?\s+50[0234]|remote end hung up|connection reset|econnreset|connection timed out|etimedout|eai_again|could not resolve host|temporary failure in name resolution|the operation timed out/.test(message);
}

async function publishGeneratedArtifacts({
  cwd = process.cwd(),
  remote = "origin",
  branch = "main",
  files = DEFAULT_FILES,
  commitMessage = "Auto-update public dog artifacts [skip ci]",
  maxAttempts = 3,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  runner = defaultRunner,
} = {}) {
  const baseSha = runGit(runner, ["rev-parse", "HEAD"], { cwd });
  const changedFiles = runGit(runner, ["diff", "--name-only"], { cwd }).split("\n").filter(Boolean);
  const alreadyStaged = runGit(runner, ["diff", "--cached", "--name-only"], { cwd }).split("\n").filter(Boolean);
  if (alreadyStaged.length) throw new Error(`Refusing to publish with pre-staged changes: ${alreadyStaged.join(", ")}`);
  const unexpected = changedFiles.filter((file) => !files.includes(file));
  if (unexpected.length) throw new Error(`Refusing to publish with unrelated working-tree changes: ${unexpected.join(", ")}`);
  if (!changedFiles.length) return { changed: false, commitSha: null, attempts: 0 };

  const remoteBefore = readRemoteHead(runner, remote, branch, cwd);
  if (remoteBefore !== baseSha) {
    throw new ConcurrentPublishError("Remote branch advanced before artifact publication; refusing to publish a possibly stale generated snapshot.");
  }

  runGit(runner, ["add", "--", ...files], { cwd });
  const stagedDiff = runner(["diff", "--cached", "--quiet"], { cwd });
  if (stagedDiff.status === 0) return { changed: false, commitSha: null, attempts: 0 };
  if (stagedDiff.status !== 1) throw new Error(`Could not inspect staged generated artifacts: ${stagedDiff.stderr || stagedDiff.stdout}`);

  runGit(runner, ["config", "user.name", "github-actions[bot]"], { cwd });
  runGit(runner, ["config", "user.email", "github-actions[bot]@users.noreply.github.com"], { cwd });
  runGit(runner, ["commit", "-m", commitMessage], { cwd });
  const commitSha = runGit(runner, ["rev-parse", "HEAD"], { cwd });
  const backoffMs = [1000, 3000, 7000];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const currentRemote = readRemoteHead(runner, remote, branch, cwd);
    if (currentRemote !== baseSha && currentRemote !== commitSha) {
      throw new ConcurrentPublishError("Remote branch advanced during artifact publication; refusing to rebase or overwrite a newer snapshot.");
    }
    if (currentRemote === commitSha) return { changed: true, commitSha, attempts: attempt - 1, alreadyPublished: true };

    const push = runner(["push", remote, `HEAD:refs/heads/${branch}`], { cwd, timeoutMs: 45_000 });
    if (push.status === 0) return { changed: true, commitSha, attempts: attempt };

    const error = new Error(`git push failed: ${(push.stderr || push.stdout).trim()}`);
    error.result = push;
    runGit(runner, ["fetch", "--no-tags", remote, branch], { cwd });
    const fetchedRemote = runGit(runner, ["rev-parse", "FETCH_HEAD"], { cwd });
    if (fetchedRemote === commitSha || runner(["merge-base", "--is-ancestor", commitSha, "FETCH_HEAD"], { cwd }).status === 0) {
      return { changed: true, commitSha, attempts: attempt, alreadyPublished: true };
    }
    if (fetchedRemote !== baseSha) {
      throw new ConcurrentPublishError("Remote branch advanced while push was in flight; generated artifacts were not rebased or overwritten.");
    }
    if (!isTransientPushFailure(error) || attempt >= maxAttempts) throw error;
    const delayMs = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
    console.warn(`Transient GitHub push failure (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms.`);
    await sleep(delayMs);
  }

  throw new Error(`Artifact push failed after ${maxAttempts} bounded attempts.`);
}

if (require.main === module) {
  publishGeneratedArtifacts().then((result) => {
    console.log(result.changed ? `Published generated artifact commit ${result.commitSha} after ${result.attempts} attempt(s).` : "Public dog artifacts unchanged; nothing to commit.");
  }).catch((error) => {
    console.error("Generated artifact publishing failed safely:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ConcurrentPublishError,
  DEFAULT_FILES,
  isTransientPushFailure,
  publishGeneratedArtifacts,
};
