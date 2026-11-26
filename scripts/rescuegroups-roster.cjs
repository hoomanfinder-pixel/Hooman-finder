const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 60_000;

class IncompleteRosterError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "IncompleteRosterError";
    this.details = details;
  }
}

function cleanId(value) {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id || null;
}

function relationshipIds(animal, relationshipName) {
  const data = animal?.relationships?.[relationshipName]?.data;
  const values = Array.isArray(data) ? data : data ? [data] : [];
  return values.map((item) => cleanId(item?.id)).filter(Boolean);
}

function getAnimalOrgIds(animal) {
  return ["orgs", "org", "organizations", "organization"]
    .flatMap((name) => relationshipIds(animal, name));
}

function pagedUrl(apiUrl, page, limit) {
  const url = new URL(apiUrl);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryable(error) {
  return error?.name === "AbortError" || error instanceof TypeError ||
    error?.status === 408 || error?.status === 425 || error?.status === 429 ||
    [500, 502, 503, 504].includes(Number(error?.status)) || error?.retryableResponse === true;
}

function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function retryDelay(error, attempt, retryDelayMs, now = Date.now()) {
  const retryAfterMs = parseRetryAfter(error?.retryAfter, now);
  if (retryAfterMs !== null) {
    if (retryAfterMs > MAX_RETRY_AFTER_MS) return null;
    return retryAfterMs;
  }
  return Math.min(retryDelayMs * (2 ** (attempt - 1)), 10_000);
}

function safeErrorCategory(error) {
  if (error?.name === "AbortError") return "timeout";
  if (error?.status) return `http_${Number(error.status)}`;
  if (error?.retryableResponse) return "incomplete_response";
  if (error instanceof TypeError) return "network_error";
  return "invalid_roster";
}

async function fetchRosterPage({
  url,
  options,
  timeoutMs,
  fetchImpl,
  maxAttempts,
  retryDelayMs,
  sleep,
  logger,
  orgId,
  page,
  validate,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs, fetchImpl);
      if (!response.ok) {
        // Some read-only diagnostics wrap HTTP 400 responses to extract a
        // bounded error-pointer category. Consume only that redacted wrapper;
        // never attach upstream response text to the thrown error or logs.
        if (Number(response.status) === 400 && typeof response.text === "function") {
          try { await response.text(); } catch { /* retain the status-only diagnostic */ }
        }
        const error = new IncompleteRosterError(
          `RescueGroups request failed for org ${orgId}, page ${page}: HTTP ${response.status}`
        );
        error.status = response.status;
        error.retryAfter = response.headers?.get?.("retry-after") || null;
        throw error;
      }
      let json;
      try {
        json = await response.json();
      } catch {
        const error = new IncompleteRosterError(
          `RescueGroups returned invalid JSON for org ${orgId}, page ${page}.`
        );
        error.retryableResponse = true;
        error.retryAfter = response.headers?.get?.("retry-after") || null;
        throw error;
      }
      if (typeof validate !== "function") return { response, json };
      return { response, json, metadata: validate(json) };
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      const delayMs = retryDelay(error, attempt, retryDelayMs);
      if (delayMs === null) {
        throw new IncompleteRosterError(
          `RescueGroups retry for org ${orgId}, page ${page} stopped because Retry-After exceeds the bounded retry window (${MAX_RETRY_AFTER_MS}ms).`,
          { orgId, page, retryAfterExceeded: true }
        );
      }
      logger.warn(
        `RescueGroups org ${orgId} page ${page} attempt ${attempt}/${maxAttempts} failed (${safeErrorCategory(error)}); retrying in ${delayMs}ms.`
      );
      await sleep(delayMs);
    }
  }
  throw new IncompleteRosterError(`RescueGroups retries exhausted for org ${orgId}, page ${page}.`);
}

function requireInteger(value, label, { minimum = 0 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new IncompleteRosterError(`Invalid RescueGroups metadata ${label}: ${value}`);
  }
  return number;
}

function validatePage({ json, requestedOrgId, requestedPage, pageLimit }) {
  if (!json || !Array.isArray(json.data) || !json.meta) {
    const error = new IncompleteRosterError("RescueGroups response is missing data or metadata.");
    error.retryableResponse = true;
    throw error;
  }

  const count = requireInteger(json.meta.count, "count");
  const countReturned = requireInteger(json.meta.countReturned, "countReturned");
  const pageReturned = requireInteger(json.meta.pageReturned, "pageReturned", { minimum: 1 });
  const limit = requireInteger(json.meta.limit, "limit", { minimum: 1 });
  const pages = requireInteger(json.meta.pages, "pages");

  if (pageReturned !== requestedPage) {
    throw new IncompleteRosterError(
      `RescueGroups returned page ${pageReturned} when page ${requestedPage} was requested.`
    );
  }
  if (limit !== pageLimit) {
    throw new IncompleteRosterError(
      `RescueGroups used limit ${limit}; expected ${pageLimit}.`
    );
  }
  if (countReturned !== json.data.length) {
    throw new IncompleteRosterError(
      `RescueGroups countReturned ${countReturned} does not match ${json.data.length} rows.`
    );
  }

  const expectedPages = count === 0 ? 0 : Math.ceil(count / limit);
  if (pages !== expectedPages) {
    throw new IncompleteRosterError(
      `RescueGroups pages ${pages} does not match count ${count} at limit ${limit}.`
    );
  }

  for (const animal of json.data) {
    const animalId = cleanId(animal?.id);
    if (!animalId) {
      throw new IncompleteRosterError("RescueGroups returned an animal without an ID.");
    }
    const orgIds = getAnimalOrgIds(animal);
    if (
      orgIds.length === 0 ||
      orgIds.some((orgId) => orgId !== String(requestedOrgId))
    ) {
      throw new IncompleteRosterError(
        `Animal ${animalId} did not identify requested organization ${requestedOrgId}.`
      );
    }
  }

  return { count, countReturned, pageReturned, limit, pages };
}

async function fetchCompleteRescueGroupsRoster({
  apiUrl,
  apiKey,
  orgId,
  buildRequestBody,
  fetchImpl = fetch,
  pageLimit = DEFAULT_PAGE_LIMIT,
  maxPages = DEFAULT_MAX_PAGES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowVerifiedEmptyRoster = false,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  sleep = wait,
  logger = console,
}) {
  if (!cleanId(orgId)) throw new Error("A RescueGroups organization ID is required.");
  if (!apiKey) throw new Error("A RescueGroups API key is required.");

  const animals = [];
  const included = [];
  const authoritativeIds = new Set();
  let expectedCount = null;
  let expectedPages = null;

  for (let page = 1; ; page += 1) {
    if (page > maxPages) {
      throw new IncompleteRosterError(
        `RescueGroups roster requires more than the configured ${maxPages} pages.`,
        { orgId, expectedPages }
      );
    }

    const fetched = await fetchRosterPage({
      url: pagedUrl(apiUrl, page, pageLimit),
      options: {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/vnd.api+json",
        },
        body: JSON.stringify(buildRequestBody({ orgId: String(orgId), page, pageLimit })),
      },
      timeoutMs,
      fetchImpl,
      maxAttempts,
      retryDelayMs,
      sleep,
      logger,
      orgId,
      page,
      validate: (json) => validatePage({
        json,
        requestedOrgId: String(orgId),
        requestedPage: page,
        pageLimit,
      }),
    });
    const { json, metadata: meta } = fetched;

    if (expectedCount === null) {
      expectedCount = meta.count;
      expectedPages = meta.pages;
      if (expectedPages > maxPages) {
        throw new IncompleteRosterError(
          `RescueGroups reports ${expectedPages} pages, exceeding the configured ${maxPages}.`,
          { orgId, expectedPages }
        );
      }
    } else if (meta.count !== expectedCount || meta.pages !== expectedPages) {
      throw new IncompleteRosterError(
        `RescueGroups roster metadata changed during pagination for org ${orgId}.`
      );
    }

    for (const animal of json.data) {
      const animalId = String(animal.id);
      if (authoritativeIds.has(animalId)) {
        throw new IncompleteRosterError(
          `RescueGroups repeated animal ${animalId} across pages for org ${orgId}.`
        );
      }
      authoritativeIds.add(animalId);
      animals.push(animal);
    }
    if (Array.isArray(json.included)) included.push(...json.included);

    if (expectedCount === 0 || page >= expectedPages) break;
  }

  if (authoritativeIds.size !== expectedCount || animals.length !== expectedCount) {
    throw new IncompleteRosterError(
      `RescueGroups returned ${authoritativeIds.size} unique animals; metadata declared ${expectedCount}.`
    );
  }

  const empty = expectedCount === 0;
  return {
    animals,
    included,
    authoritativeIds,
    count: expectedCount,
    pages: expectedPages,
    complete: true,
    staleMarkingAllowed: !empty || allowVerifiedEmptyRoster,
    quarantineReason:
      empty && !allowVerifiedEmptyRoster
        ? "Zero-result roster is not explicitly verified as legitimate"
        : null,
  };
}

async function reconcileCompleteRoster({
  source,
  fetchRoster,
  mapRoster,
  upsert,
  markUnavailable,
}) {
  const roster = await fetchRoster(source);
  if (!roster?.complete) {
    throw new IncompleteRosterError(`Roster for ${source.name} was not proven complete.`);
  }

  const mapped = await mapRoster(roster, source);
  const upsertResult = await upsert(mapped.rows, source, mapped);
  if (Number(upsertResult?.failed || upsertResult?.skipped || 0) > 0) {
    const error = new Error(`One or more dog upserts failed for ${source.name}; stale marking aborted.`);
    error.partial = Number(upsertResult?.inserted || 0) + Number(upsertResult?.updated || 0) > 0;
    error.upsertResult = upsertResult;
    error.roster = roster;
    throw error;
  }

  let staleResult = { skipped: true, reason: roster.quarantineReason };
  if (roster.staleMarkingAllowed) {
    staleResult = await markUnavailable(source, [...roster.authoritativeIds]);
  }

  return { roster, mapped, upsertResult, staleResult };
}

function planStaleDogs(existingDogs, orgId, authoritativeIds) {
  const seen = authoritativeIds instanceof Set
    ? authoritativeIds
    : new Set((authoritativeIds || []).map(String));
  return (existingDogs || []).filter(
    (dog) =>
      dog?.adoptable === true &&
      cleanId(dog?.rescuegroups_org_id) === String(orgId) &&
      cleanId(dog?.rescuegroups_id) &&
      !seen.has(String(dog.rescuegroups_id))
  );
}

module.exports = {
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_PAGE_LIMIT,
  DEFAULT_RETRY_DELAY_MS,
  IncompleteRosterError,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
  fetchCompleteRescueGroupsRoster,
  getAnimalOrgIds,
  pagedUrl,
  planStaleDogs,
  reconcileCompleteRoster,
  validatePage,
};
