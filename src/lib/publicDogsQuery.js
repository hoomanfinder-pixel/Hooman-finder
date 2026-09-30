import { filterPublicDogs } from "./dogVisibility.js";

export const PUBLIC_DOG_QUERY_PAGE_SIZE = 500;

export async function fetchAllPublicDogs(
  client,
  { select, now = Date.now(), pageSize = PUBLIC_DOG_QUERY_PAGE_SIZE } = {}
) {
  if (!client?.from) throw new Error("A Supabase client is required.");
  if (!select) throw new Error("A dog select expression is required.");
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("pageSize must be a positive integer.");
  }

  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("dogs")
      .select(select)
      .eq("adoptable", true)
      .or("adoption_pending.is.null,adoption_pending.eq.false")
      .in("availability_status", ["available", "active", "unknown"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return filterPublicDogs(rows, { now });
}
