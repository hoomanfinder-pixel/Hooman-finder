import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

import {
  buildMonitoringMarkdown,
  classifyExternalLinkResult,
  classifyMonitoringRequest,
  evaluateMonitoringCredentials,
  evaluatePublicDogFreshness,
  evaluateSyncApiFailure,
  evaluateSyncRuns,
  evaluateSourceFreshnessArtifact,
  hasActionableFailure,
  runWebsiteJourney,
} from "../src/lib/productionMonitoring.js";

const require = createRequire(import.meta.url);
const { fetchSafely } = require("./shelter-logo-validator.cjs");

const BASE_URL = process.env.MONITOR_BASE_URL || "https://hoomanfinder.com";
const OUTPUT_DIR = path.resolve("monitoring-output");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.md");
const JSON_PATH = path.join(OUTPUT_DIR, "report.json");
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, "failure.png");
const MATCH_TIMEOUT_MS = 30_000;
const MAX_PROFILE_SAMPLES = 3;
const MAX_EXTERNAL_HOSTS = 3;
function publicError(error) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

async function fetchSyncWorkflowRuns(token, repository) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/sync-rescuegroups-dogs.yml/runs?per_page=10`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "hooman-finder-production-monitor",
      },
      signal: AbortSignal.timeout(12_000),
    }
  );
  if (!response.ok) throw new Error(`GitHub workflow API returned HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body.workflow_runs) ? body.workflow_runs : [];
}

async function loadPlatformStats() {
  try {
    return JSON.parse(await fs.readFile("src/generated/platform-stats.json", "utf8"));
  } catch {
    return null;
  }
}

async function loadSyncStatusArtifact() {
  const artifactPath = process.env.SYNC_STATUS_ARTIFACT || "monitoring-input/rescuegroups-sync-status.json";
  try {
    return JSON.parse(await fs.readFile(artifactPath, "utf8"));
  } catch {
    return null;
  }
}

async function checkExternalDestination(url) {
  try {
    const result = await fetchSafely(url, {
      timeoutMs: 12_000,
      maxRedirects: 3,
      maxBytes: 512 * 1024,
      headers: { range: "bytes=0-524287" },
    });
    if (new URL(result.finalUrl).protocol !== "https:") throw new Error("unsafe_redirect_protocol");
    return classifyExternalLinkResult({ url, ok: true, status: result.response.status });
  } catch (error) {
    return classifyExternalLinkResult({ url, error: publicError(error) });
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const checkedAt = new Date().toISOString();
  const checks = [];
  const externalLinks = [];
  const limitations = [
    "A successful sync workflow proves that the managed job completed, not that every shelter independently changed its data that day.",
    "Public RescueGroups dogs are already filtered out when their authoritative last_checked_at is more than 72 hours old; the monitor does not treat a long shelter stay as stale availability.",
    "Third-party adoption sites may block automation. Their HTTP results are informational and never trigger automatic URL changes or listing edits.",
    "Inventory count is reported without a failure threshold until enough trustworthy historical observations exist.",
  ];
  const platformStats = await loadPlatformStats();

  const credentialCheck = evaluateMonitoringCredentials({
    githubToken: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
  });
  if (credentialCheck.status === "pass") {
    try {
      const runs = await fetchSyncWorkflowRuns(process.env.GITHUB_TOKEN, process.env.GITHUB_REPOSITORY);
      checks.push(evaluateSyncRuns(runs));
      const latestRun = Array.isArray(runs)
        ? runs.filter((run) => run?.created_at).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
        : null;
      checks.push(...evaluateSourceFreshnessArtifact(await loadSyncStatusArtifact(), latestRun, {
        repository: process.env.GITHUB_REPOSITORY,
      }));
    } catch (error) {
      checks.push(evaluateSyncApiFailure(error));
      checks.push(...evaluateSourceFreshnessArtifact(null, null, { repository: process.env.GITHUB_REPOSITORY }));
    }
  } else {
    checks.push(credentialCheck);
  }

  let browser;
  let page;
  const pageErrors = [];
  const blockedWrites = [];
  const profileHrefs = [];
  const adoptionDestinations = [];
  const observedDogs = [];
  const responseTasks = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      serviceWorkers: "block",
      userAgent: "HoomanFinder-Production-Monitor/1.0 (+https://hoomanfinder.com)",
    });
    await context.addInitScript(() => {
      window["ga-disable-G-C2VJYSWL4H"] = true;
      window.gtag = () => {};
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const policy = classifyMonitoringRequest(request.url(), request.method());
      if (policy === "block_analytics") {
        await route.abort("blockedbyclient");
        return;
      }
      if (policy === "block_write") {
        let hostname = "unknown";
        try { hostname = new URL(request.url()).hostname; } catch { /* sanitized below */ }
        blockedWrites.push(`${request.method()} ${hostname}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(publicError(error)));
    page.on("response", (response) => {
      let parsed;
      try { parsed = new URL(response.url()); } catch { return; }
      if (!parsed.pathname.endsWith("/rest/v1/dogs") || response.status() >= 400) return;
      responseTasks.push(response.json().then((body) => {
        if (Array.isArray(body)) observedDogs.push(...body);
        else if (body && typeof body === "object") observedDogs.push(body);
      }).catch(() => {}));
    });

    const adapter = {
      async loadHomepage() {
        const response = await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (!response || response.status() >= 400) throw new Error(`Homepage returned HTTP ${response?.status() || "unknown"}`);
        await page.getByRole("heading", { name: "Find a rescue dog who fits your life." }).waitFor({ state: "visible", timeout: 15_000 });
      },
      async loadQuiz() {
        await page.getByRole("link", { name: "Take the Matching Quiz", exact: true }).first().click();
        await page.waitForURL(/\/quiz(?:\?|$)/, { timeout: 15_000 });
        await page.getByRole("heading", { name: "Find an adoptable dog that fits your lifestyle" }).waitFor({ state: "visible", timeout: 15_000 });
        const essentialQuestions = page.locator('[data-quiz-question]');
        await essentialQuestions.first().waitFor({ state: "visible", timeout: 15_000 });
        if (await essentialQuestions.count() < 5) throw new Error("Fewer than five essential quiz questions were rendered.");
      },
      async completeQuiz() {
        for (const answer of [
          "Medium",
          "Adult (2 to 6)",
          "No children in the home",
          "No other animals / not important",
          "Doesn’t matter / I’m open to training",
        ]) {
          await page.getByRole("button", { name: answer, exact: true }).click();
        }
        await page.getByText("5/5 answered").waitFor({ state: "visible", timeout: 10_000 });
        await page.getByRole("button", { name: "See My Matches" }).click();
      },
      async waitForMatch() {
        await page.waitForURL(/\/results\?session=/, { timeout: MATCH_TIMEOUT_MS });
        await page.getByRole("heading", { name: "Dogs that may fit your lifestyle." }).waitFor({ state: "visible", timeout: MATCH_TIMEOUT_MS });
        const links = page.locator('article[aria-label$="match result"] a[aria-label^="View profile for"]');
        await links.first().waitFor({ state: "visible", timeout: MATCH_TIMEOUT_MS });
        const hrefs = (await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")))).filter(Boolean);
        profileHrefs.push(...new Set(hrefs));
        return { profileHref: profileHrefs[0] };
      },
      async openProfile() {
        const profileLink = page.locator('article[aria-label$="match result"] a[aria-label^="View profile for"]').first();
        await profileLink.click();
        await page.waitForURL(/\/dogs?\//, { timeout: 15_000 });
        const heading = page.getByRole("heading", { level: 1 }).first();
        await heading.waitFor({ state: "visible", timeout: 15_000 });
        return { url: page.url(), heading: await heading.textContent() };
      },
      async findAdoptionDestination() {
        const link = page.getByRole("link", { name: /View official listing|View DACC adoptable dogs/ }).first();
        await link.waitFor({ state: "visible", timeout: 15_000 });
        const href = await link.getAttribute("href");
        if (!href) throw new Error("The matched profile has no official adoption destination.");
        adoptionDestinations.push(href);
        return href;
      },
      async getCriticalErrors() {
        return pageErrors;
      },
    };

    const journey = await runWebsiteJourney(adapter, { matchTimeoutMs: MATCH_TIMEOUT_MS });
    checks.push(...journey.checks);
    await Promise.allSettled(responseTasks);
    let matchedDog = null;
    try {
      const profileId = decodeURIComponent(new URL(journey.match?.profileHref || "", BASE_URL).pathname.split("/").filter(Boolean).pop() || "");
      matchedDog = observedDogs.find((dog) => String(dog?.id) === profileId) || null;
    } catch { /* The journey check already reports malformed profile paths. */ }
    checks.push(evaluatePublicDogFreshness(matchedDog));

    let sampledProfiles = journey.profile ? 1 : 0;
    let sampleFailure = "";
    for (const href of profileHrefs.slice(1, MAX_PROFILE_SAMPLES)) {
      try {
        await page.goto(new URL(href, BASE_URL).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: 15_000 });
        const link = page.getByRole("link", { name: /View official listing|View DACC adoptable dogs/ }).first();
        await link.waitFor({ state: "visible", timeout: 15_000 });
        const destination = await link.getAttribute("href");
        if (!destination) throw new Error("profile is missing its official destination");
        new URL(destination);
        adoptionDestinations.push(destination);
        sampledProfiles += 1;
      } catch (error) {
        sampleFailure = publicError(error);
        break;
      }
    }
    checks.push(sampleFailure
      ? { name: "Representative dog profiles", status: "fail", detail: sampleFailure, blocksAdoption: true, informational: false }
      : { name: "Representative dog profiles", status: "pass", detail: `Verified ${sampledProfiles} public profile(s) without clicking an adoption application.`, blocksAdoption: true, informational: false });

    checks.push(blockedWrites.length
      ? { name: "Read-only monitoring", status: "fail", detail: `Blocked unexpected write request(s): ${blockedWrites.slice(0, 3).join(", ")}`, blocksAdoption: false, informational: false }
      : { name: "Read-only monitoring", status: "pass", detail: "The browser journey issued no POST, PUT, PATCH, or DELETE requests.", blocksAdoption: false, informational: false });

    const uniqueHosts = new Map();
    for (const destination of adoptionDestinations) {
      try {
        const hostname = new URL(destination).hostname.toLowerCase();
        if (!uniqueHosts.has(hostname)) uniqueHosts.set(hostname, destination);
      } catch { /* The blocking profile check already reports malformed URLs. */ }
      if (uniqueHosts.size >= MAX_EXTERNAL_HOSTS) break;
    }
    for (const destination of uniqueHosts.values()) {
      externalLinks.push(await checkExternalDestination(destination));
    }
  } catch (error) {
    checks.push({
      name: "Production browser monitor",
      status: "fail",
      detail: publicError(error),
      blocksAdoption: true,
      informational: false,
    });
  }

  if (hasActionableFailure(checks) && page) {
    try { await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true }); } catch { /* The report remains available. */ }
  }
  await browser?.close();

  const markdown = buildMonitoringMarkdown({ checkedAt, checks, externalLinks, platformStats, limitations });
  const report = { checkedAt, baseUrl: BASE_URL, checks, externalLinks, platformStats, limitations };
  await fs.writeFile(REPORT_PATH, markdown, "utf8");
  await fs.writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(markdown);

  if (hasActionableFailure(checks)) process.exitCode = 1;
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const message = publicError(error);
  await fs.writeFile(REPORT_PATH, `# Hooman Finder production monitoring\n\n**Monitor failed before completion:** ${message}\n`, "utf8");
  console.error(message);
  process.exitCode = 1;
});
