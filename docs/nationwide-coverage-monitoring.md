# Nationwide matching coverage monitoring

## Workflow

`.github/workflows/nationwide-coverage-audit.yml` runs every Monday at 16:17 UTC, after the scheduled sync and production monitor. It can also be started manually. It uses the public Supabase URL and anonymous key for SELECT requests only; it does not use the service-role key, call an AI model, write production data, or activate sources.

The audit queries the same available/adoptable candidate population used by the application, asks PostgREST for an exact count, and paginates with a stable creation-time/ID order. It requires a stable count across pages, unique IDs, and a complete row count. It applies the existing `filterPublicDogs` rules with one recorded reference timestamp. Any query error, missing exact count, pagination inconsistency, or failed public listing validation produces an **unverified** report. A verified empty query is reported as zero inventory; a failed query is never converted to zero.

Only `coverage-output/report.json` and `coverage-output/report.md` are uploaded. The report contains aggregate counts and fixed scenario labels. It excludes dog IDs, dog names, descriptions, URLs, and raw inventory rows. Artifacts are retained for 90 days. The workflow searches recent successful runs for the latest artifact whose report, matcher, profile-set, and report-definition signatures match the current run. It then validates the downloaded report again before comparison.

## Definitions

- **Public inventory:** Rows returned by the current public candidate query and accepted by the existing `filterPublicDogs` publication checks.
- **Dog geography:** `placement_state` and `placement_city`. Shelter directory state/city are reported separately and are not treated as dog placement or verified headquarters.
- **Sources:** Distinct ingestion-source records linked to public listings. This does not count enabled sources that have no matching dog row.
- **Freshness:** Public listing checks are counted at 24 and 72 hours. Candidate RescueGroups records with missing or older-than-72-hour checks are reported separately because the existing publication rule already excludes them from public results; they are never described as public listings.
- **Enrichment backlog:** Existing eligibility helper output only. The workflow does not run enrichment.
- **Realistic scenarios:** `realistic-match-profiles.mjs` profiles passed to the production `computeRankedMatches` function. The app's exact state filter is applied after matching. City and travel radius remain informational because the current product does not use them to filter.
- **Suitable match:** A result whose production tier is `Good potential fit` or `Strong potential fit`.
- **Strong match:** A result whose production tier label is `Strong potential fit`. A raw score alone does not make a result Strong.
- **Evidence:** `structured` scorer contributions are reported as structured-confirmed because that is how the production matcher treats them; field-level source provenance is not always retained, so this label does not independently prove which shelter supplied a value. `bio_explicit` is a separate explicit-biography category (including traits marked with that evidence basis and deterministic description matches). `breed_coat_inference` and `profile_inference` are AI estimates. `mixed` remains mixed, and absent or unrecognized sources are unknown. No category is silently folded into another.
- **High compatibility diagnostic:** Raw compatibility of at least 90 among ranked dog/profile pairs from the 128-profile nationwide scenario set, reported separately from displayed score, evidence coverage, tier, and the existing limited-information label. The report tracks shares below the current 60% boundary and below 80% coverage. This is not directly comparable to the earlier 10,398-profile audit's `suspicious_high_count`, which counted displayed scores of at least 90 only when evidence coverage was below 80% or a scored dimension had zero compatibility.
- **Alone-time evidence:** Reported as a separate question dimension because the baseline audit found 1,063 dogs without evidence for that dimension.
- **Unscored quiz answers:** All current questions without a `MATCH_WEIGHTS` entry are listed as informational/stored answers, not matching signals.

## Comparison safety

Every report includes `report_version`, `matcher_revision`, `profile_set_version`, `report_definition_revision`, and `verification.reference_timestamp`. Matcher and report revisions are hashes of the relevant local source files; the profile-set revision hashes the realistic profile generator. A report comparison is unavailable when either report is unverified, timestamps are invalid, or any revision differs. The report does not compare raw percentages across changed profiles or definitions.

## Alert thresholds

The workflow runs weekly, so known baseline gaps are summarized without generating daily alerts. Historical alerts are emitted only when the reports are comparable:

- A state that previously had public dogs falls to zero.
- Additional RescueGroups candidate records have checks older than 72 hours (the existing publication guard continues to hide them).
- No-suitable-match state/profile scenarios increase by at least 20% and at least 10 scenarios.
- The share of raw-90+ results below 80% evidence coverage rises by at least 10 percentage points, with at least 30 high-compatibility results.
- The enrichment eligibility backlog grows by at least 25% and at least 25 dogs.
- The number of sources linked to public listings decreases.

If no comparable prior artifact exists, the report says so and does not treat the existing zero-coverage states as new alerts. Inventory verification failures produce an unverified report artifact and a failed workflow run so the failure remains visible.

## Operating cost and limits

There are no AI calls, paid research services, schema changes, service-role credentials, or production writes. A weekly run uses one standard GitHub-hosted Ubuntu job, locked dependency installation, a read-only Supabase query, deterministic matching, and two small aggregate artifacts. Expected usage is roughly 1–3 GitHub Actions minutes per week; actual billing depends on the repository's Actions plan and npm cache state. No new recurring third-party cost is introduced.

The report is a deterministic coverage diagnostic, not a prediction of adoption success or an estimate of adopter demand. It cannot rank metro opportunity reliably while placement city is missing for a large share of dogs and the product does not filter by travel distance. It only counts sources connected to public listings. A new matcher, profile set, report definition, or visibility rule requires a new comparable baseline before trend claims resume.
