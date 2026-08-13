const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 30000;

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

function requireInteger(value, label, { minimum = 0 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new IncompleteRosterError(`Invalid RescueGroups metadata ${label}: ${value}`);
  }
  return number;
}

function validatePage({ json, requestedOrgId, requestedPage, pageLimit }) {
  if (!json || !Array.isArray(json.data) || !json.meta) {
    throw new IncompleteRosterError("RescueGroups response is missing data or metadata.");
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

    const response = await fetchWithTimeout(
      pagedUrl(apiUrl, page, pageLimit),
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/vnd.api+json",
        },
        body: JSON.stringify(buildRequestBody({ orgId: String(orgId), page, pageLimit })),
      },
      timeoutMs,
      fetchImpl
    );

    if (!response.ok) {
      const body = await response.text();
      throw new IncompleteRosterError(
        `RescueGroups request failed for org ${orgId}, page ${page}: ${response.status} ${body.slice(0, 500)}`
      );
    }

    let json;
    try {
      json = await response.json();
    } catch (error) {
      throw new IncompleteRosterError(
        `RescueGroups returned invalid JSON for org ${orgId}, page ${page}: ${error.message}`
      );
    }

    const meta = validatePage({
      json,
      requestedOrgId: String(orgId),
      requestedPage: page,
      pageLimit,
    });

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
    throw new Error(`One or more dog upserts failed for ${source.name}; stale marking aborted.`);
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
  DEFAULT_PAGE_LIMIT,
  IncompleteRosterError,
  fetchCompleteRescueGroupsRoster,
  getAnimalOrgIds,
  pagedUrl,
  planStaleDogs,
  reconcileCompleteRoster,
  validatePage,
};
