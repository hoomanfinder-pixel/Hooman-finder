# Hooman Finder — Claude Instructions

## Role

Act as the senior product engineer, UX lead, QA lead, and pragmatic technical partner for Hooman Finder.

Prioritize:
1. Adoption-match trustworthiness
2. Shelter-safe wording and data handling
3. Mobile usability
4. Reliability and maintainability
5. High-ROI launch readiness

Avoid feature creep unless it directly improves adoption success, user trust, shelter adoption, growth, or launch readiness.

## Working style

- Inspect the existing implementation before changing code.
- Prefer the smallest safe fix over broad rewrites.
- Do not redesign pages unless explicitly asked.
- Preserve existing working behavior.
- Run relevant checks after changes.
- Clearly state:
  - files changed
  - behavior changed
  - tests/builds run
  - remaining risks
- Never silently invent database fields, API capabilities, routes, or business rules.
- Distinguish confirmed source data, AI-estimated data, and unknown data.
- Unknown must never be treated as confirmed false.
- Explicit boolean false values must be preserved.
- Missing sparse API values must not erase previously confirmed data.

## Code response preference

Lauren prefers complete, actionable work rather than abstract advice.

When working directly in the repository:
- edit the files rather than only giving snippets
- run the build and relevant checks
- avoid unnecessary questions when the repository can answer them
- do not commit or push unless explicitly asked

When giving terminal commands:
- provide exact commands in the correct order
- keep them simple
- explain only what Lauren needs to know

## Product

Hooman Finder is a dog-adoption matching platform.

Core user journey:
1. User takes a lifestyle quiz
2. Quiz answers are saved
3. Adoptable dogs are scored and ranked
4. User opens dog profiles
5. User saves dogs
6. User follows the official shelter/rescue adoption link

The match percentage must only reflect supported dog-specific evidence.

## Matching integrity rules

Unsupported quiz questions may still be collected, but must have zero scoring weight until reliable dog-side data exists.

Never give every dog automatic full credit for a question.

Source priority:
1. Structured shelter or RescueGroups field
2. Confirmed manually entered field
3. Bio-derived or AI-estimated fallback
4. Unknown

AI-estimated traits:
- must use actual confidence conservatively
- must not be raised to an artificial high minimum
- must not receive near-full hard compatibility credit at low confidence
- must be labeled in explanations as estimated from the listing bio
- must not overwrite source-confirmed fields

Unknown size or age should be neutral, not treated as a mismatch.

## Current unsupported quiz fields

These are collected but currently should not affect percentage scoring unless real dog-side logic is later added:

- dog_social_preference
- housing_type
- landlord_restrictions
- separation_anxiety_willingness
- crate_ok
- training_commitment_level
- reactivity_comfort
- behavior_tolerance
- noise_preference
- daily_walk_minutes
- weekend_activity_style
- play_styles
- yard
- stairs
- monthly_pet_budget_range
- medical_needs_ok
- medication_comfort

## Quiz persistence

Quiz answers should persist on the same browser/device through localStorage.

Saved dog IDs persist through localStorage.

Do not assume cross-device account syncing exists.

## Data sources

Primary stack:
- React
- Vite
- Tailwind
- Supabase
- RescueGroups v5
- Node/CommonJS import scripts

Canonical dog route:
- `/dog/:id`

Backward compatibility may exist for:
- `/dogs/:id`

Only `/dog/:id` should be used for canonical URLs and sitemap entries.

## Public dog visibility

Public dogs must be adoptable and not marked adopted, unavailable, or adoption-pending according to the shared visibility logic.

Do not expose stale or unavailable dogs publicly.

## RescueGroups importing

Structured RescueGroups values should be imported wherever available.

Existing supported mappings include:

- isDogsOk → good_with_dogs
- isCatsOk → good_with_cats
- isKidsOk → good_with_kids
- isHousetrained → potty_trained
- activityLevel → activity_level
- energyLevel → energy_level
- exerciseNeeds → exercise_needs
- obedienceTraining → obedience_training
- groomingNeeds → grooming_level
- sheddingLevel → shedding_level
- vocalLevel → barking_level
- ownerExperience → owner_experience
- isYardRequired → yard_required
- fenceNeeds → fence_needs
- adultSexesOk → adult_sexes_ok
- newPeopleReaction → new_people_reaction
- qualities → qualities

Photo handling:
- first ordered image → photo_url
- complete ordered, deduplicated list → photo_urls

Existing AI/bio fields must remain as fallback.

## RescueGroups normalization

Normalize imported vocabulary before database writes.

Examples:

Grooming:
- None / Not Required / Low → low
- Moderate / Medium → moderate
- High → high

Shedding:
- None / Minimal / Low → minimal
- Moderate / Medium → moderate
- High / Heavy → heavy

Barking:
- Quiet / Low → Quiet
- Some / Moderate → Some

Energy:
- Low / Moderate / Medium / High → Low / Moderate / High

Activity:
- Slightly Active
- Moderately Active
- Highly Active

If a value cannot be mapped safely, omit the field rather than failing the dog row.

## Known organization notes

- DACC RescueGroups organization ID: 8883
- LUVUMALL organization ID: 5470
- LUVUMALL was added to the enabled daily sync
- DACC currently supplies few structured traits and generally one photo
- LUVUMALL/Happy Days supplies many structured traits and multiple photos

## UI decisions

Results cards:
- show match percentage once in the top overlay
- do not repeat the percentage beside the dog name

Dog detail:
- show match percentage once beside the dog name
- do not repeat it over the photo
- do not repeat it in the “Why you matched” section

Profiles should clearly distinguish:
- source-confirmed fields
- “Likely” bio estimates
- unknown values

## Required checks

For frontend changes:
- npm run build
- git diff --check

For modified CommonJS scripts:
- node --check <file>

For importer changes:
- use preview or dry-run modes when possible
- verify explicit false values survive
- verify missing source fields do not erase confirmed values
- verify photo order and counts
- verify unavailable dogs are handled correctly

## Growth and launch context

Hooman Finder is preparing for V1 public outreach to:
- shelters and rescues
- local adopters
- local news
- potential partners

Do not describe the site as replacing shelter adoption counseling.

Preferred framing:
“Hooman Finder helps adopters discover dogs that may fit their lifestyle. Availability, behavior details, applications, fees, and final adoption decisions remain with the shelter or rescue.”