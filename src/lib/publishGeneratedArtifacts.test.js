import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ConcurrentPublishError,
  publishGeneratedArtifacts,
} = require("../../scripts/publish-generated-artifacts.cjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function bareFile(bare, object) {
  return execFileSync("git", ["--git-dir", bare, "show", object], { encoding: "utf8" }).trim();
}

function runGit(args, { cwd }) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || result.error?.message || "" };
}

async function makeRemoteFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-publish-test-"));
  const bare = path.join(root, "remote.git");
  const local = path.join(root, "local");
  await fs.mkdir(bare);
  execFileSync("git", ["init", "--bare", "--initial-branch=main", bare]);
  execFileSync("git", ["init", "--initial-branch=main", local]);
  git(local, "config", "user.name", "Test User");
  git(local, "config", "user.email", "test@example.invalid");
  await fs.mkdir(path.join(local, "public"), { recursive: true });
  await fs.mkdir(path.join(local, "src/generated"), { recursive: true });
  await fs.writeFile(path.join(local, "public/sitemap.xml"), "<urlset>old</urlset>\n");
  await fs.writeFile(path.join(local, "public/dog-sitemap.xml"), "<urlset>old</urlset>\n");
  await fs.writeFile(path.join(local, "src/generated/platform-stats.json"), "{\"count\":1}\n");
  git(local, "add", ".");
  git(local, "commit", "-m", "Initial generated artifacts");
  git(local, "remote", "add", "origin", bare);
  git(local, "push", "-u", "origin", "main");
  return { root, bare, local };
}

test("publisher retries a transient server error with bounded backoff and a normal push", async () => {
  const fixture = await makeRemoteFixture();
  try {
    await fs.writeFile(path.join(fixture.local, "public/sitemap.xml"), "<urlset>fresh</urlset>\n");
    let attempts = 0;
    const waits = [];
    const result = await publishGeneratedArtifacts({
      cwd: fixture.local,
      runner: (args, options) => {
        if (args[0] === "push" && ++attempts === 1) {
          return { status: 1, stdout: "", stderr: "remote: Internal Server Error" };
        }
        return runGit(args, options);
      },
      sleep: async (ms) => waits.push(ms),
    });
    assert.equal(result.changed, true);
    assert.equal(result.attempts, 2);
    assert.equal(attempts, 2);
    assert.deepEqual(waits, [1000]);
    assert.equal(bareFile(fixture.bare, "main:public/sitemap.xml"), "<urlset>fresh</urlset>");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("publisher stops when upstream artifacts advance and never replaces the newer snapshot", async () => {
  const fixture = await makeRemoteFixture();
  const upstream = path.join(fixture.root, "upstream");
  try {
    execFileSync("git", ["clone", fixture.bare, upstream]);
    git(upstream, "config", "user.name", "Upstream");
    git(upstream, "config", "user.email", "upstream@example.invalid");
    await fs.writeFile(path.join(upstream, "public/sitemap.xml"), "<urlset>newer-upstream</urlset>\n");
    git(upstream, "add", "public/sitemap.xml");
    git(upstream, "commit", "-m", "Newer inventory snapshot");
    git(upstream, "push", "origin", "HEAD:main");

    await fs.writeFile(path.join(fixture.local, "public/sitemap.xml"), "<urlset>stale-local</urlset>\n");
    await assert.rejects(
      publishGeneratedArtifacts({ cwd: fixture.local, runner: runGit }),
      ConcurrentPublishError
    );
    assert.equal(bareFile(fixture.bare, "main:public/sitemap.xml"), "<urlset>newer-upstream</urlset>");
    assert.equal(git(fixture.local, "status", "--short").includes("public/sitemap.xml"), true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
