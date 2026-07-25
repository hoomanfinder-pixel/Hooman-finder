# Enrichment dry run — rerun after fixes

Same 20 dogs as the first pass (IDs fixed, not reselected). Nothing was written to Supabase — confirmed, the review script never calls `.update()`.

## Code changes made (all in `scripts/enrich-dogs-ai.cjs`, still dry-run only)

1. **Explicit coat length now outranks breed-name heuristics for shedding/grooming.** Added `explicitCoatLength(breed)`, which extracts `"short"` / `"medium"` / `"long"` from a `"(... coat)"` suffix on the breed field when present. It's checked *after* the structured field and direct bio-text phrases (both still win when present) but *before* the breed-name-family fallback list.
2. **Alone-time estimates are now preserved across re-enrichment.** `mergeExistingBioColumns` now carries forward the existing `bio_max_alone_hours` / `bio_max_alone_hours_label` whenever the new run comes back with no qualifying evidence (null), the same pattern already used for every other `bio_*` field. A fresh run that *does* find real evidence still overrides the old value, evidence-backed values are never suppressed.
3. **Added the same evidence gate to `good_with_dogs`** that already existed for kids and (from last review) cats: a positive claim only survives if the bio contains other-dog-specific language (`"other dogs"`, `"foster sibling"`, `"dog park"`, etc.) or the structured field already confirms it. Generic sociability language alone no longer produces a positive dogs claim.

---

## Answers to your four questions

### 1. Which outputs changed (vs. the first dry-run pass)?

- **8 dogs with empty bios** (MARVA, KOFIA, COOKIE, JADE JASMINE, POPOCA, BOLO, TALISA, PANSIE) — all have `"(medium coat)"` in their breed text. Shedding/grooming flipped from `low`/`low` (wrong — driven by a "pit bull = short coat" breed-name guess that ignored the dog's own listed coat) to `medium`/`moderate` (now correctly sourced from the explicit annotation).
- **Ava** — breed says `"(short coat)"`. Grooming flipped from `moderate` (wrong — German Shepherd/double-coat breed-name guess) to `low` (now correct, matches the stated coat).
- **Rose in Pittsburgh** — breed says `"(medium coat)"`. Shedding flipped from `low` to `medium`.
- **SKYMIR, D103 Litter Susie, Sonic** — all say `"(short coat)"` in their breed text (all are Labrador-mix breeds). Shedding flipped from `high` (breed-based, e.g. "Labrador → higher shedding") to `low` (coat-length-based, "short coat → low shedding"). **Flagging this one — see item 4 below, I think this is a real regression, not an improvement.**
- **Alone time**: Scout, Doli, Rose in Pittsburgh, Rudy, and SKYMIR all now correctly keep their prior estimate (`1-2` in each case) instead of getting wiped to `unknown`. Mia's alone-time also stayed at `5-6` rather than going to `unknown` — see item 4, this one's worth a second look too.
- **Compatibility fields**: no behavior change observed in this sample — every positive `good_with_dogs`/`cats`/`kids` claim in both runs was already backed by either a confirmed structured field or dog/cat/kid-specific bio language, so the new dogs-gate didn't need to block anything here (it's there for the next dog where it would matter).

### 2. Are all explicit coat annotations now respected?

Yes. Every dog with a `"(short/medium/long coat)"` suffix in its breed field now gets that value applied to both shedding and grooming (or is skipped in favor of a stronger structured/bio-text signal, per priority order) — checked all 14 dogs in this sample that have the annotation, all correctly reflect it now. Zero contradictions remaining between breed text and the shedding/grooming estimate.

### 3. Would any prior non-empty estimates be erased?

No. **9 dogs had a non-empty prior `bio_max_alone_hours`** going into this run (Scout, Doli, D128 Litter Nala, Mia, Rose in Pittsburgh, Blaze, Canelo, Rudy, SKYMIR). All 9 came out with that value preserved or reconfirmed — zero erasures, matching what you asked for. (Note: the "Confidence" column in the table below shows the *fresh* run's confidence, which reads `0` for the ones that were preserved rather than freshly re-evidenced — that's a reporting quirk in my review script, not a sign the value is unreliable. The actual value written would be the carried-forward one.)

### 4. Remaining questionable outputs

1. **Shedding for short-coated-but-heavy-shedding breeds is now worse, not better.** SKYMIR, D103 Litter Susie, and Sonic are all Labrador (or Labrador/Aussie) mixes. Labs are famous for shedding heavily *despite* having a short coat — coat length and shedding amount aren't reliably correlated for double-coated short-haired breeds. The breed-name heuristic used to get this right (`high` shedding for Labrador-type breeds); now the explicit `"(short coat)"` annotation overrides it and produces `low`, which is the same general problem you originally flagged (explicit coat *length* text being trusted for something it doesn't reliably predict) — just moved to a different breed instead of eliminated. I did **not** change this yet since it directly conflicts with your instruction to prioritize explicit coat info over breed heuristics, and I want your call: options are (a) accept this tradeoff since it's still a defensible middle-ground guess, (b) keep explicit-coat-first for grooming only (which correlates well with length) but keep breed-name priority for shedding specifically, or (c) add a short list of known heavy-shedding-despite-short-coat breeds (Labrador, Aussie, German Shepherd, etc.) that override the coat-length signal for shedding only. I'd lean toward (b) or (c) but didn't want to make that call unilaterally given it's a direct consequence of what you asked for.
2. **Mia's alone-time (`5-6`) is now permanently "sticky" despite having zero supporting bio evidence, ever.** Her bio has never mentioned alone-time behavior in any version. The `5-6` value is whatever the original v6 run guessed; since no run has ever found real evidence for or against it, the new preservation rule means it will now persist indefinitely rather than ever settling to `unknown`. This is exactly the behavior you asked for ("never let unknown replace a usable existing estimate"), so I left it — but wanted to flag that "existing estimate" here means "an old AI guess that was never bio-verified," not "a value someone confirmed once." Worth knowing in case that distinction matters for how confidently this gets shown to adopters.
3. **Minor, unchanged from last time:** LLM output has small run-to-run variability at temperature 0.1 (e.g. Canelo's exercise-needs reasoning text differs slightly between runs even though the value stayed the same). Not a bug, just a limitation of using an LLM for extraction.

---

## Per-dog before/after (this rerun)

Legend: **Before** = current value in `bio_*` columns (production, unchanged all session). **After** = what this dry run would now write. `Barking (NEW)` / `Grooming (NEW)` are the two new columns.

### 1. MARVA (id: de3092c9-6f34-41bf-9b0f-c626009899f3)  
Breed: Pit Bull Terrier / Mixed (medium coat) | Coat category: short | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.608 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_high | 0.64 | YES | Puppy age gives an estimate of above-average energy unless the bio says calm. |
| Exercise needs | unknown | medium_high | 0.6 | YES | Puppy age suggests regular exercise and enrichment needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_high | 0.68 | YES | Puppy age suggests extra training and structure. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 2. KOFIA (id: b5d68b68-2db3-424d-a43a-880baa71490b)

Breed: Pointer / Mixed (medium coat) | Coat category: unclassified | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.58 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_high | 0.6 | YES | Breed group commonly needs above-average activity. |
| Exercise needs | unknown | medium_high | 0.62 | YES | Working, herding, sporting, hound, or terrier breed type suggests above-average exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_low | 0.56 | YES | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 3. COOKIE (id: f86e3e2a-5737-42b7-87e6-f1f11b6429db)

Breed: American Pit Bull Terrier / Mixed (medium coat) | Coat category: short | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.5766666666666667 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_low | 0.62 | YES | Senior/older-dog language gives a lower-energy estimate unless the bio says otherwise. |
| Exercise needs | unknown | medium_low | 0.58 | YES | Senior/older-dog language suggests lower-to-moderate exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_low | 0.56 | YES | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | 5-6 | 0.58 | YES | Calm, trained, or low-energy adult/senior evidence supports a five-to-six-hour estimate. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 4. JADE JASMINE (id: 854f1679-7a4a-47eb-a80b-28f3ab36dc41)

Breed: Pointer / Mixed (medium coat) | Coat category: unclassified | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.58 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_high | 0.6 | YES | Breed group commonly needs above-average activity. |
| Exercise needs | unknown | medium_high | 0.62 | YES | Working, herding, sporting, hound, or terrier breed type suggests above-average exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_low | 0.56 | YES | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 5. POPOCA (id: afa8e566-dec7-409b-955e-a470ceab02f0)

Breed: Pit Bull Terrier / Mixed (medium coat) | Coat category: short | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.58 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_high | 0.6 | YES | Breed group commonly needs above-average activity. |
| Exercise needs | unknown | medium_high | 0.62 | YES | Working, herding, sporting, hound, or terrier breed type suggests above-average exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_low | 0.56 | YES | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 6. BOLO (id: a8e1695d-bbc0-4006-9c88-3505be245188)

Breed: Staffordshire Bull Terrier / Mixed (medium coat) | Coat category: unclassified | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.536 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium | 0.56 | YES | Young adult age gives a moderate baseline energy estimate. |
| Exercise needs | unknown | medium | 0.54 | YES | Young adult age suggests at least moderate exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium | 0.46 | YES | Basic profile context supports a moderate training-needs baseline. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 7. TALISA (id: 48fd1846-55ec-431d-9489-eb8dab7cf7a1)

Breed: Boxer / Labrador Retriever / Mixed (medium coat) | Coat category: short | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.58 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_high | 0.6 | YES | Breed group commonly needs above-average activity. |
| Exercise needs | unknown | medium_high | 0.62 | YES | Working, herding, sporting, hound, or terrier breed type suggests above-average exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_low | 0.56 | YES | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 8. PANSIE (id: b3274cec-6f84-4440-99c3-822849efd265)

Breed: Pit Bull Terrier / Mixed (medium coat) | Coat category: short | Mixed: true | Bio: none | Prior enrichment: none  
Description (0 chars): (none)  
Overall confidence: 0.58 | needs_human_review: true  
Caution notes: Listing has limited description text, so AI trait extraction may be incomplete.  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | medium_high | 0.6 | YES | Breed group commonly needs above-average activity. |
| Exercise needs | unknown | medium_high | 0.62 | YES | Working, herding, sporting, hound, or terrier breed type suggests above-average exercise needs. |
| Shedding | unknown | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | unknown | medium_low | 0.56 | YES | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.52 | YES | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 9. Scout (id: 6755067d-c9a0-4098-8e90-503c53e9166e)

Breed: Bluetick Coonhound / Great Pyrenees / Mixed (medium coat) | Coat category: medium/double-coat | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1815 chars): Meet Scout &ndash; Your Loyal Packmate! Breed: Blue Tick Coonhound / Great Pyrenees Mix Age: 1 year old Scout is a gentle, laid-back soul with a playful streak and a heart full of loyalty. He&rsquo;s ...  
Overall confidence: 1 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | low | low | 0.88 |  | Bio clearly describes low energy or a calm lifestyle. |
| Exercise needs | low | low | 0.82 |  | Bio clearly describes low exercise needs or a calm lifestyle. |
| Shedding | high | high | 1 |  | current_shedding_level is 'heavy' |
| Trainability | medium_high | medium_high | 0.82 |  | Bio describes training needs or experienced-adopter support. |
| Barking (NEW) | unknown | some | 1 | YES | current_barking_level is 'Some' |
| Grooming (NEW) | unknown | moderate | 1 | YES | current_grooming_level is 'moderate' |
| Alone time | 1-2 | 1-2 | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | yes | yes | 1 |  | current_good_with_dogs is true |
| Good w/ cats | yes | yes | 1 |  | current_good_with_cats is true |
| Good w/ kids | most_likely | yes | 1 | YES | current_good_with_kids is true |
| Potty trained | yes | yes | 1 |  | current_potty_trained is true |
| First-time friendly | no | no | 0.86 |  | Bio or profile indicates major behavior, medical, handling, training, fear, or lifestyle complexity for a first-time owner. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 10. Doli (id: 9f1ab755-45d1-4a5b-9e9e-b92eacfce032)

Breed: Husky / Shepherd / Mixed | Coat category: medium/double-coat | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1517 chars): Hi hoomans, my name is Doli, and I&#39;m in the prime of my life at about 11-years-old.&nbsp; Everyone comments on my sky blue eyes and thick husky-type hair that is every shade of gold you can imagin...  
Overall confidence: 0.7 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | low | low | 0.88 |  | Bio clearly describes low energy or a calm lifestyle. |
| Exercise needs | low | low | 0.82 |  | Bio clearly describes low exercise needs or a calm lifestyle. |
| Shedding | high | high | 0.68 |  | Breed/coat type commonly indicates higher shedding. |
| Trainability | medium_high | medium_high | 0.82 |  | Bio describes training needs or experienced-adopter support. |
| Barking (NEW) | unknown | quiet | 1 | YES | Described as rarely barking. |
| Grooming (NEW) | unknown | moderate | 0.6 | YES | Double-coated breed type commonly needs regular brushing. |
| Alone time | 1-2 | 1-2 | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | no | no | 1 |  | Not a fan of other animals. |
| Good w/ cats | no | no | 1 |  | Not a fan of other animals. |
| Good w/ kids | may_do_well | may_do_well | 0 |  | Generic family language was not treated as child-specific kid compatibility evidence. |
| Potty trained | yes | yes | 1 |  | Current potty trained. |
| First-time friendly | may_do_well | may_do_well | 0.52 |  | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 11. Ava (id: 34b6dd8d-149f-4ea2-add6-c36b6b88c816)

Breed: German Shepherd Dog / Mixed (short coat) | Coat category: medium/double-coat | Mixed: true | Bio: detailed | Prior enrichment: none  
Description (1249 chars): Meet Ava, one of our newest residents at the Mikey & Me Kennels for Happy Days Rescue. Ava is a Shepherd mix, she&rsquo;s only 4 months of age, she has a beautiful black and tan coat, and her current ...  
Overall confidence: 0.7 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | unknown | high | 1 | YES | Current energy level is described as 'Highly Active'. |
| Exercise needs | unknown | high | 1 | YES | High energy level indicates high exercise needs. |
| Shedding | unknown | low | 0.62 | YES | Listing explicitly states a short coat. |
| Trainability | unknown | medium | 0.7 | YES | Young age suggests some training is needed, but no specific issues mentioned. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | low | 0.68 | YES | Listing explicitly states a short coat. |
| Alone time | unknown | 1-2 | 0.74 | YES | Clear distress, very young puppy, support, or monitoring needs indicate a short alone-time tolerance. |
| Good w/ dogs | unknown | yes | 1 | YES | Current good with dogs is true. |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | unknown | may_do_well | 0.58 | YES | Profile suggests manageable needs without major first-time-owner red flags. |
| Size (puppy est.) | unknown | Large | - | YES |  |

### 12. D128 Litter Nala PLEASE READ BIO FIRST (id: c9bc09a7-eef1-4a6c-aa59-1438d431e2e5)

Breed: Bichon Frise / Maltese / Mixed (long coat) | Coat category: long/high-maintenance | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (3408 chars): UPDATE: Nala is a bit standoffish when she first meets people, she is more comfortable with women than men but still growls and barks when meeting any new people, we are working on socialization skill...  
Overall confidence: 0.7 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | low | low | 0.88 |  | Bio clearly describes low energy or a calm lifestyle. |
| Exercise needs | low | low | 0.82 |  | Bio clearly describes low exercise needs or a calm lifestyle. |
| Shedding | medium | low | 0.84 | YES | Existing structured shedding level is minimal. |
| Trainability | medium | medium | 0.7 |  | Needs basic training, including potty training. |
| Barking (NEW) | unknown | some | 0.84 | YES | Existing structured barking level is Some. |
| Grooming (NEW) | unknown | high | 0.84 | YES | Existing structured grooming level is high. |
| Alone time | 5-6 | 5-6 | 0.58 |  | Calm, trained, or low-energy adult/senior evidence supports a five-to-six-hour estimate. |
| Good w/ dogs | no | no | 0.9 |  | Bio clearly indicates the dog should not live with other dogs. |
| Good w/ cats | unknown | unknown | 0 |  | We don't know how they are with cats. |
| Good w/ kids | may_do_well | may_do_well | 0.6 |  | Prefers older children that are not loud or no children at all. |
| Potty trained | yes | yes | 1 |  | Current potty trained is true. |
| First-time friendly | no | no | 0.86 |  | Bio or profile indicates major behavior, medical, handling, training, fear, or lifestyle complexity for a first-time owner. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 13. Mia (id: 192c0012-72d0-490e-b33f-aa9502c3b210)

Breed: Poodle (Miniature) / Shih Tzu / Mixed (long coat) | Coat category: long/high-maintenance | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (802 chars): Mia is what is called a "Daisy Dog", a designer breed. "Daisy Dogs" were bred in the 1960's from a Poodle, Shih Tzu, and Bichon to create the 'perfect' dog. Mia is a sweet 9-year-old "Daisy" dog. She ...  
Overall confidence: 0.6866666666666665 | needs_human_review: true  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium | medium | 0.82 |  | Existing structured energy level is medium. |
| Exercise needs | medium | medium | 0.72 |  | Exercise needs inferred from structured energy level medium. |
| Shedding | medium | medium | 0.5 |  | Listing explicitly states a long coat; shedding amount varies by coat type so this is a cautious middle estimate. |
| Trainability | medium_low | medium_low | 0.56 |  | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | high | 1 | YES | Current grooming level is high. |
| Alone time | 5-6 | 5-6 | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | unknown | unknown | 0 |  |  |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | yes | 1 | YES | Current potty trained status is true. |
| First-time friendly | may_do_well | may_do_well | 0.52 |  | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 14. Rose in Pittsburgh (id: 6c22afa2-d36f-4ada-b01e-9b321a942e42)

Breed: Bichon Frise (medium coat) | Coat category: long/high-maintenance | Mixed: false | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1799 chars): Hi!  I&rsquo;m Rose but my foster Mom also calls me Rosie, Rosie Posie, Rosemarie and other silly things. My favorite things are soft beds, yummy food, treats and other dogs.  I like being out in the ...  
Overall confidence: 0.6 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium | medium | 0.82 |  | Existing structured energy level is medium. |
| Exercise needs | medium | medium | 0.72 |  | Exercise needs inferred from structured energy level medium. |
| Shedding | low | medium | 0.6 | YES | Listing explicitly states a medium coat. |
| Trainability | medium | medium | 0.6 |  | needs more training steps and leash work |
| Barking (NEW) | unknown | some | 0.6 | YES | usually very quiet but follows along if siblings start barking |
| Grooming (NEW) | unknown | moderate | 0.66 | YES | Listing explicitly states a medium coat. |
| Alone time | 1-2 | 1-2 | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | most_likely | most_likely | 0.7 |  | comfort found in dogs and enjoys their company |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | may_do_well | may_do_well | 0.58 |  | Profile suggests manageable needs without major first-time-owner red flags. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 15. Blaze (id: 6cf79f64-124f-4b5b-9e1f-6564f2ede107)

Breed: Boxer / Pit Bull Terrier / Mixed (short coat) | Coat category: short | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1856 chars): **UPDATE** Blaze is a ball of energy and a cuddle bug! On the go 24/7 and would be great in a home with lots of exercise and a big backyard to run and play. Due to his past, he is animal reactive and ...  
Overall confidence: 0.7 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium | medium | 0.82 |  | Existing structured energy level is medium. |
| Exercise needs | high | high | 0.8 |  | Description indicates he is always ready for walks and needs lots of exercise. |
| Shedding | low | medium | 0.84 | YES | Existing structured shedding level is moderate. |
| Trainability | medium_high | medium_high | 0.82 |  | Bio describes training needs or experienced-adopter support. |
| Barking (NEW) | unknown | some | 0.6 | YES | Description states he loves to talk, implying some vocalization. |
| Grooming (NEW) | unknown | low | 0.84 | YES | Existing structured grooming level is low. |
| Alone time | 1-2 | 1-2 | 0.74 |  | Clear distress, very young puppy, support, or monitoring needs indicate a short alone-time tolerance. |
| Good w/ dogs | may_do_well | may_do_well | 0.68 |  | Bio describes possible dog compatibility with caveats or introductions. |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | may_do_well | may_do_well | 0.5 |  | Best for kids 12 and up due to being hyper and jumping. |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | no | no | 0.86 |  | Bio or profile indicates major behavior, medical, handling, training, fear, or lifestyle complexity for a first-time owner. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 16. Canelo (id: 4bca0462-a9a1-4056-83b5-d9403b74f28e)

Breed: Pit Bull Terrier / Mixed (short coat) | Coat category: short | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (2050 chars): Meet Canelo &ndash; Your Dream Companion in His Golden Years Canelo is an 8-year-old pit bull with a heart full of love and a lifetime of loyalty to give. This gentle soul is the total package: calm, ...  
Overall confidence: 0.8 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium | medium | 0.82 |  | Existing structured energy level is medium. |
| Exercise needs | medium | medium_low | 0.8 | YES | Described as calm and well-trained, indicating lower exercise needs. |
| Shedding | low | low | 0.62 |  | Listing explicitly states a short coat. |
| Trainability | low | low | 0.8 |  | Described as obedient and well-trained. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | low | 0.68 | YES | Listing explicitly states a short coat. |
| Alone time | 5-6 | 5-6 | 0.58 |  | Calm, trained, or low-energy adult/senior evidence supports a five-to-six-hour estimate. |
| Good w/ dogs | yes | yes | 1 |  | Gets along great with other dogs. |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | yes | yes | 1 |  | Described as wonderful with kids and family-friendly. |
| Potty trained | yes | yes | 1 |  | Described as potty trained. |
| First-time friendly | yes | yes | 0.84 |  | Bio explicitly describes an easy or beginner-friendly dog, and no major complexity signals were found. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 17. Rudy (id: c478725e-41ca-43d0-b5cd-6a3a7bc079ef)

Breed: American Pit Bull Terrier | Coat category: short | Mixed: false | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1697 chars): *Update*  
Rudy was returned to us due to unforseen circumstances at his adoptive home.  He is still the fun loving goofy boy we knew before.  He loves to romp aroud and go for short walks.  He is worki...  
Overall confidence: 0.7 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium_low | medium_low | 0.78 |  | Bio suggests lower-to-moderate energy. |
| Exercise needs | medium_low | medium_low | 0.74 |  | Bio suggests lower-to-moderate exercise needs. |
| Shedding | low | low | 0.58 |  | Short-coated breed type gives a cautious low shedding estimate. |
| Trainability | medium_low | medium_low | 0.7 |  | Bio suggests some training foundation is already present. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | low | 0.58 | YES | Short-coated breed type gives a cautious low grooming estimate. |
| Alone time | 1-2 | 1-2 | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | most_likely | most_likely | 0.7 |  | He would love a doggie friend about the same size as him. |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  | False was not treated as confirmed because the listing does not explicitly say this. |
| Potty trained | unknown | unknown | 0 |  |  |
| First-time friendly | may_do_well | may_do_well | 0.52 |  | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 18. SKYMIR (id: bb5f69bb-8a3a-467a-814c-06246082b0bd)

Breed: Labrador Retriever / Mixed (short coat) | Coat category: short | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (2013 chars): Meet Skymir!  
Your 40-pound bundle of joy, wagging his way into your heart!  
Hi there! I&rsquo;m Skymir &mdash; a lively, 1.5-year-old male black Lab mix with a heart full of love and a tail that never...  
Overall confidence: 0.7 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium | medium | 0.82 |  | Existing structured energy level is medium. |
| Exercise needs | medium | medium | 0.72 |  | Exercise needs inferred from structured energy level medium. |
| Shedding | high | low | 0.62 | YES | Listing explicitly states a short coat. |
| Trainability | medium_low | medium_low | 0.7 |  | Bio suggests some training foundation is already present. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | low | 0.68 | YES | Listing explicitly states a short coat. |
| Alone time | 1-2 | 1-2 | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | most_likely | most_likely | 0.7 |  | Described as doing great with another playful pup and having foster siblings. |
| Good w/ cats | unknown | unknown | 0 |  |  |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | yes | yes | 1 |  | Listed as fully housebroken. |
| First-time friendly | most_likely | most_likely | 0.68 |  | Stable, manageable profile with low-to-moderate training needs and no major first-time-owner complexity signals. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 19. D103 Litter Susie (id: ae3eee97-e7f1-4ff4-9139-7a8c9633c24a)

Breed: Australian Shepherd / Labrador Retriever / Mixed (short coat) | Coat category: short | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1799 chars): Susie is a beautiful Aussie mix. She is a 2 years old and is 70lbs. Susie is fearful when meeting new people and takes time to be comfortable. It may take multiple meet and greets for Susie. She would...  
Overall confidence: 0.75 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium_high | medium_high | 0.84 |  | Bio describes an active dog with above-average exercise needs. |
| Exercise needs | medium_high | medium_high | 0.84 |  | Bio describes an active lifestyle fit. |
| Shedding | high | low | 0.62 | YES | Listing explicitly states a short coat. |
| Trainability | medium_high | medium_high | 0.82 |  | Bio describes training needs or experienced-adopter support. |
| Barking (NEW) | unknown | some | 1 | YES | Will bark when someone comes to the door and sees things in the yard. |
| Grooming (NEW) | unknown | low | 0.68 | YES | Listing explicitly states a short coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | most_likely | yes | 1 | YES | Current good with dogs. |
| Good w/ cats | no | no | 0.9 |  | Bio clearly indicates the dog should not live with cats. |
| Good w/ kids | unknown | unknown | 0 |  |  |
| Potty trained | yes | yes | 1 |  | Described as housebroken. |
| First-time friendly | may_do_well | may_do_well | 0.52 |  | Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious. |
| Size (puppy est.) | unknown | none | - | YES |  |

### 20. Sonic (id: edd49656-d1ba-4204-8d3a-f7ea78b2496a)

Breed: Labrador Retriever / Hound / Mixed (short coat) | Coat category: short | Mixed: true | Bio: detailed | Prior enrichment: dog-ai-traits-v6  
Description (1871 chars): We have one of the friendliest, most lovable dogs at Mikey & Me for Happy Days Rescue that&rsquo;s still waiting to meet his new family. He has come so far since his arrival and he loves all people, i...  
Overall confidence: 0.811111111111111 | needs_human_review: false  

| Field | Before | After | Confidence | Changed | Evidence |
|---|---|---|---|---|---|
| Energy | medium | medium | 0.82 |  | Existing structured energy level is medium. |
| Exercise needs | medium | medium | 0.72 |  | Exercise needs inferred from structured energy level medium. |
| Shedding | high | low | 0.62 | YES | Listing explicitly states a short coat. |
| Trainability | medium_low | medium_low | 0.56 |  | Stable temperament, age, or foundation skills suggest lower training needs. |
| Barking (NEW) | unknown | unknown | 0 |  |  |
| Grooming (NEW) | unknown | low | 0.68 | YES | Listing explicitly states a short coat. |
| Alone time | unknown | unknown | 0 |  | Not enough supported alone-time evidence. |
| Good w/ dogs | most_likely | yes | 1 | YES | Loves being with other dogs. |
| Good w/ cats | unknown | yes | 1 | YES | Current good with cats. |
| Good w/ kids | most_likely | yes | 1 | YES | Loves all people, including kids. |
| Potty trained | unknown | yes | 1 | YES | Current potty trained. |
| First-time friendly | may_do_well | may_do_well | 0.58 |  | Profile suggests manageable needs without major first-time-owner red flags. |
| Size (puppy est.) | unknown | none | - | YES |  |

