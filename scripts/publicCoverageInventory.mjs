import { filterPublicDogs } from "../src/lib/dogVisibility.js";

export const PUBLIC_DOG_SELECT = "*,shelters(id,name,city,state),ingestion_sources(id,source_type,external_org_id,enabled,publication_eligible,last_successful_sync_at)";
export const PUBLIC_DOG_PAGE_SIZE = 1000;

export class IncompleteInventorySnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = "IncompleteInventorySnapshotError";
  }
}

export async function fetchPublicInventorySnapshot({
  client,
  referenceTime = Date.now(),
  pageSize = PUBLIC_DOG_PAGE_SIZE,
} = {}) {
  if (!client?.from) throw new TypeError("A read-only Supabase client is required.");
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new TypeError("pageSize must be a positive integer.");

  const rows = [];
  const ids = new Set();
  let expectedCount = null;
  let pages = 0;

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await client
      .from("dogs")
      .select(PUBLIC_DOG_SELECT, { count: "exact" })
      .eq("adoptable", true)
      .or("adoption_pending.is.null,adoption_pending.eq.false")
      .in("availability_status", ["available", "active", "unknown"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error("Public inventory query failed.", { cause: error });
    if (!Array.isArray(data)) throw new IncompleteInventorySnapshotError("Public inventory page was not an array.");
    if (!Number.isInteger(count) || count < 0) {
      throw new IncompleteInventorySnapshotError("Public inventory did not provide an exact row count.");
    }
    if (expectedCount === null) expectedCount = count;
    else if (count !== expectedCount) {
      throw new IncompleteInventorySnapshotError("Public inventory changed during pagination.");
    }

    pages += 1;
    for (const dog of data) {
      if (dog?.id === null || dog?.id === undefined) {
        throw new IncompleteInventorySnapshotError("A public inventory row had no stable identifier.");
      }
      const id = String(dog.id);
      if (ids.has(id)) throw new IncompleteInventorySnapshotError("Public inventory pagination returned a duplicate row.");
      ids.add(id);
      rows.push(dog);
    }

    if (rows.length === expectedCount) break;
    if (data.length === 0 || data.length < pageSize) {
      throw new IncompleteInventorySnapshotError("Public inventory pagination ended before the exact row count.");
    }
  }

  if (rows.length !== expectedCount) {
    throw new IncompleteInventorySnapshotError("Public inventory row count did not match the exact count.");
  }

  const timestamp = Number(referenceTime);
  if (!Number.isFinite(timestamp)) throw new TypeError("A finite snapshot reference time is required.");

  return {
    reference_timestamp: new Date(timestamp).toISOString(),
    query_rows: expectedCount,
    pages,
    candidate_rows: rows,
    public_dogs: filterPublicDogs(rows, { now: timestamp }),
  };
}
