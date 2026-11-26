export const DEFAULT_MATCH_TIMEOUT_MS = 30_000;
export const DEFAULT_SYNC_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export const PUBLIC_LISTING_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const SOURCE_SYNC_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export const SYNC_STATUS_ARTIFACT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ANALYTICS_HOSTS = [
  "www.googletagmanager.com",
  "www.google-analytics.com",
  "google-analytics.com",
  "analytics.google.com",
];

function check(name, status, detail, { blocksAdoption = false, informational = false } = {}) {
  return { name, status, detail, blocksAdoption, informational };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runWebsiteJourney(adapter, { matchTimeoutMs = DEFAULT_MATCH_TIMEOUT_MS } = {}) {
  const checks = [];
  let homepageReady = false;
  let quizReady = false;
  let resultsReady = false;
  let match = null;
  let profile = null;
  let adoptionUrl = "";

  try {
    await adapter.loadHomepage();
    homepageReady = true;
    checks.push(check("Production homepage", "pass", "Homepage returned successfully and its primary heading was visible.", { blocksAdoption: true }));
  } catch (error) {
    checks.push(check("Production homepage", "fail", errorMessage(error), { blocksAdoption: true }));
  }

  if (homepageReady) {
    try {
      await adapter.loadQuiz();
      quizReady = true;
      checks.push(check("Essential quiz", "pass", "The quiz loaded and all essential questions were accessible.", { blocksAdoption: true }));
    } catch (error) {
      checks.push(check("Essential quiz", "fail", errorMessage(error), { blocksAdoption: true }));
    }
  } else {
    checks.push(check("Essential quiz", "unverified", "Skipped because the homepage check failed.", { blocksAdoption: true }));
  }

  if (quizReady) {
    try {
      await adapter.completeQuiz();
      match = await withTimeout(adapter.waitForMatch(), matchTimeoutMs, "Match results");
      resultsReady = true;
      checks.push(check("Quiz-to-results journey", "pass", `At least one match card appeared within ${Math.round(matchTimeoutMs / 1000)} seconds.`, { blocksAdoption: true }));
    } catch (error) {
      checks.push(check("Quiz-to-results journey", "fail", errorMessage(error), { blocksAdoption: true }));
    }
  } else {
    checks.push(check("Quiz-to-results journey", "unverified", "Skipped because the quiz could not be verified.", { blocksAdoption: true }));
  }

  if (resultsReady) {
    try {
      profile = await adapter.openProfile(match);
      checks.push(check("Matched dog profile", "pass", "A match card opened its corresponding public dog profile.", { blocksAdoption: true }));
    } catch (error) {
      checks.push(check("Matched dog profile", "fail", errorMessage(error), { blocksAdoption: true }));
    }
  } else {
    checks.push(check("Matched dog profile", "unverified", "Skipped because no match card was available.", { blocksAdoption: true }));
  }

  if (profile) {
    try {
      adoptionUrl = await adapter.findAdoptionDestination(profile);
      const parsed = new URL(adoptionUrl);
      if (parsed.protocol !== "https:" || !parsed.hostname) {
        throw new Error("The profile's official adoption destination is not a valid HTTPS URL.");
      }
      if (["hoomanfinder.com", "www.hoomanfinder.com"].includes(parsed.hostname.toLowerCase())) {
        throw new Error("The profile's adoption destination does not leave Hooman Finder for an official shelter or rescue site.");
      }
      checks.push(check("Official adoption destination", "pass", `The profile exposes an HTTPS destination on ${parsed.hostname}.`, { blocksAdoption: true }));
    } catch (error) {
      checks.push(check("Official adoption destination", "fail", errorMessage(error), { blocksAdoption: true }));
    }
  } else {
    checks.push(check("Official adoption destination", "unverified", "Skipped because the profile could not be verified.", { blocksAdoption: true }));
  }

  const criticalErrors = typeof adapter.getCriticalErrors === "function"
    ? await adapter.getCriticalErrors()
    : [];
  if (criticalErrors.length) {
    checks.push(check("Critical JavaScript exceptions", "fail", criticalErrors.slice(0, 3).join(" | "), { blocksAdoption: true }));
  } else {
    checks.push(check("Critical JavaScript exceptions", "pass", "No uncaught page exceptions occurred during the monitored journey.", { blocksAdoption: true }));
  }

  return { checks, match, profile, adoptionUrl };
}

export function evaluateMonitoringCredentials({ githubToken, repository }) {
  if (!githubToken || !repository) {
    return check(
      "RescueGroups sync workflow evidence",
      "unverified",
      "GitHub workflow evidence was not queried because GITHUB_TOKEN or GITHUB_REPOSITORY was unavailable.",
      { informational: true }
    );
  }
  return check("RescueGroups sync workflow evidence", "pass", "GitHub workflow evidence credentials are available.");
}

export function evaluateSyncApiFailure(error) {
  return check(
    "RescueGroups sync workflow evidence",
    "unverified",
    `GitHub sync-run history could not be verified: ${errorMessage(error)}`,
    { informational: true }
  );
}

export function classifyMonitoringRequest(url, method = "GET") {
  let hostname = "";
  try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* handled as a non-analytics request */ }
  if (ANALYTICS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return "block_analytics";
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase())) {
    return "block_write";
  }
  return "allow";
}

export function evaluateSyncRuns(runs, {
  now = Date.now(),
  maxSuccessfulAgeMs = DEFAULT_SYNC_MAX_AGE_MS,
} = {}) {
  const observed = Array.isArray(runs)
    ? runs.filter((run) => run?.created_at).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    : [];
  if (observed.length && observed[0].status !== "completed") {
    return check("RescueGroups sync workflow", "unverified", `The latest sync run is ${observed[0].status || "not completed"}; a completed source-health artifact is not yet available.`, { informational: true });
  }
  const completed = Array.isArray(runs)
    ? runs.filter((run) => run?.status === "completed" && run?.created_at)
    : [];
  if (!completed.length) {
    return check("RescueGroups sync freshness", "unverified", "No completed sync workflow runs were returned.", { informational: true });
  }

  completed.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latest = completed[0];
  const successful = completed.find((run) => run.conclusion === "success");
  if (!successful) {
    return check("RescueGroups sync freshness", "fail", "No recent successful RescueGroups sync workflow run was found.");
  }

  const successfulAt = Date.parse(successful.updated_at || successful.created_at);
  if (!Number.isFinite(successfulAt)) {
    return check("RescueGroups sync freshness", "unverified", "The latest successful workflow timestamp was invalid.", { informational: true });
  }

  const ageMs = Number(now) - successfulAt;
  if (latest.conclusion !== "success") {
    return check(
      "RescueGroups sync workflow",
      "fail",
      `The latest completed sync run concluded ${latest.conclusion || "without a conclusion"}; source-level outcomes are reported separately.`
    );
  }
  if (ageMs > maxSuccessfulAgeMs) {
    return check(
      "RescueGroups sync freshness",
      "fail",
      `The most recent successful sync is ${Math.round(ageMs / 3_600_000)} hours old; expected within ${Math.round(maxSuccessfulAgeMs / 3_600_000)} hours.`
    );
  }

  return check(
    "RescueGroups sync freshness",
    "pass",
    `A complete sync completed ${Math.max(0, Math.round(ageMs / 3_600_000))} hours ago.`
  );
}

export function evaluateSourceFreshnessArtifact(artifact, latestRun, {
  now = Date.now(),
  repository,
  maxSourceAgeMs = SOURCE_SYNC_MAX_AGE_MS,
  maxArtifactAgeMs = SYNC_STATUS_ARTIFACT_MAX_AGE_MS,
} = {}) {
  const unverified = (detail) => [check("RescueGroups per-source freshness", "unverified", detail, { informational: true })];
  if (!artifact || !latestRun) return unverified("Source-health evidence or the latest completed sync run is unavailable.");
  if (artifact.schema_version !== 1 || !Array.isArray(artifact.sources) || !artifact.sources.length) {
    return unverified("Source-health artifact has an unsupported or empty format.");
  }
  if (artifact.repository !== repository || String(artifact.run_id) !== String(latestRun.id) ||
      Number(artifact.run_attempt) !== Number(latestRun.run_attempt) || artifact.head_sha !== latestRun.head_sha) {
    return unverified("Source-health artifact provenance does not match the latest completed sync run.");
  }
  const generatedAt = Date.parse(String(artifact.generated_at || ""));
  const artifactAge = Number(now) - generatedAt;
  if (!Number.isFinite(generatedAt) || artifactAge < 0 || artifactAge > maxArtifactAgeMs) {
    return unverified("Source-health artifact is missing a valid timestamp, is from the future, or has expired.");
  }

  const enabled = artifact.sources.filter((source) => source?.enabled === true);
  if (!enabled.length) return unverified("Source-health artifact contains no enabled RescueGroups sources.");
  return enabled.map((source) => {
    const name = String(source.source || "Unnamed source").slice(0, 120);
    const lastSuccess = Date.parse(String(source.last_successful_sync_at || ""));
    const ageMs = Number(now) - lastSuccess;
    if (!Number.isFinite(lastSuccess) || ageMs < 0) {
      return check(`RescueGroups source: ${name}`, "unverified", "No valid last successful sync timestamp is available.", { informational: true });
    }
    const ageHours = Math.round(ageMs / 3_600_000);
    if (ageMs > maxSourceAgeMs) {
      return check(`RescueGroups source: ${name}`, "fail", `Last successful sync was ${ageHours} hours ago; expected within ${Math.round(maxSourceAgeMs / 3_600_000)} hours.`);
    }
    if (["failed", "partial", "unverified"].includes(source.status)) {
      return check(`RescueGroups source: ${name}`, "partial", `Latest source attempt was ${source.status}; last successful sync was ${ageHours} hours ago.`);
    }
    return check(`RescueGroups source: ${name}`, "pass", `Last successful sync was ${ageHours} hours ago.`);
  });
}

export function evaluatePublicDogFreshness(dog, {
  now = Date.now(),
  maxAgeMs = PUBLIC_LISTING_MAX_AGE_MS,
} = {}) {
  if (!dog) {
    return check("Matched listing freshness", "unverified", "The matched dog's public response metadata was not observed.", { informational: true });
  }
  const isRescueGroups = String(dog.source || "").toLowerCase() === "rescuegroups" || dog.rescuegroups_id || dog.rescuegroups_org_id;
  if (!isRescueGroups) {
    return check("Matched listing freshness", "unverified", "The matched dog is not managed by the RescueGroups freshness policy.", { informational: true });
  }
  const checkedAt = Date.parse(String(dog.last_checked_at || ""));
  const ageMs = Number(now) - checkedAt;
  if (!Number.isFinite(checkedAt) || ageMs < 0 || ageMs > maxAgeMs) {
    return check("Matched listing freshness", "fail", "The displayed RescueGroups dog has missing or stale last_checked_at evidence.");
  }
  return check(
    "Matched listing freshness",
    "pass",
    `The displayed RescueGroups dog was authoritatively checked ${Math.max(0, Math.round(ageMs / 3_600_000))} hours ago.`
  );
}

export function classifyExternalLinkResult({ url, ok = false, status = null, error = "" }) {
  let hostname = "unknown host";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error("invalid HTTPS destination");
    hostname = parsed.hostname;
  } catch {
    return { url, hostname, status: "confirmed_broken", detail: "Destination is not a valid HTTPS URL." };
  }

  if (ok) return { url, hostname, status: "reachable", detail: status ? `HTTP ${status}` : "Reachable" };

  const normalizedError = String(error || "");
  const httpStatus = status || Number(normalizedError.match(/http_(\d{3})/)?.[1] || 0);
  if (httpStatus === 404 || httpStatus === 410) {
    return { url, hostname, status: "confirmed_broken", detail: `Observed HTTP ${httpStatus}; review manually before changing shelter-provided data.` };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { url, hostname, status: "blocked", detail: `HTTP ${httpStatus}; likely authentication or bot protection, not a confirmed broken link.` };
  }
  if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500 || /timeout|fetch|network|socket|dns/i.test(normalizedError)) {
    return { url, hostname, status: "temporary_failure", detail: httpStatus ? `HTTP ${httpStatus}` : normalizedError || "Temporary network failure" };
  }
  return { url, hostname, status: "unverified", detail: normalizedError || (httpStatus ? `HTTP ${httpStatus}` : "Could not verify destination") };
}

export function buildMonitoringMarkdown({ checkedAt, checks, externalLinks = [], platformStats = null, limitations = [] }) {
  const actionable = checks.filter((item) => item.status === "fail" || item.status === "partial");
  const adoptionBlockers = actionable.filter((item) => item.blocksAdoption);
  const icon = { pass: "✅", fail: "❌", partial: "⚠️", unverified: "⚪" };
  const lines = [
    "# Hooman Finder production monitoring",
    "",
    `Checked: ${checkedAt}`,
    "",
    adoptionBlockers.length
      ? `**Action required:** ${adoptionBlockers.length} failure(s) could block dog discovery, matching, or adoption.`
      : actionable.length
      ? `**Action required:** ${actionable.length} data-freshness failure(s) or partial result(s) need review; the live adoption journey passed.`
      : "**Overall:** No actionable failure was confirmed.",
    "",
    "## Checks",
    "",
    "| Result | Check | Impact | Detail |",
    "|---|---|---|---|",
    ...checks.map((item) => `| ${icon[item.status] || "ℹ️"} | ${item.name} | ${item.blocksAdoption ? "Adoption journey" : item.informational ? "Informational" : "Listing freshness"} | ${String(item.detail).replace(/\|/g, "\\|")} |`),
  ];

  if (platformStats) {
    lines.push(
      "",
      "## Inventory snapshot (informational)",
      "",
      `- Generated: ${platformStats.generated_at || "unknown"}`,
      `- Public dogs: ${Number.isFinite(platformStats.public_dog_count) ? platformStats.public_dog_count : "unknown"}`,
      `- Public shelters/rescues: ${Number.isFinite(platformStats.public_shelter_count) ? platformStats.public_shelter_count : "unknown"}`,
      "- No inventory-drop threshold is enforced because the repository does not yet contain a trustworthy historical baseline."
    );
  }

  lines.push("", "## External adoption destinations (informational)", "");
  if (!externalLinks.length) {
    lines.push("No external HTTP destination could be sampled.");
  } else {
    for (const result of externalLinks) {
      lines.push(`- **${result.hostname}** — ${result.status}: ${result.detail}`);
    }
  }

  lines.push("", "## Limitations", "");
  for (const limitation of limitations) lines.push(`- ${limitation}`);
  lines.push(
    "",
    "Open the failed workflow run in **Actions → Production Monitoring**, expand **Run production monitor**, and download the seven-day monitoring artifact for the JSON report and failure screenshot."
  );
  return `${lines.join("\n")}\n`;
}

export function hasActionableFailure(checks) {
  return checks.some((item) => item.status === "fail" || item.status === "partial");
}
