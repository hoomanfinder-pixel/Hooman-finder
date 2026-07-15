# Hooman Finder Project Context

## Founder and objective

Hooman Finder was created by Lauren Breukink.

The mission is to help adopters discover rescue dogs that may better fit their home, routine, energy level, and preferences, with the broader goal of reducing mismatched adoptions and returns.

The product is approaching V1 launch readiness.

## Product structure

Main pages:
- Home
- Dogs/Browse
- Quiz
- Results
- Dog Detail
- Saved Dogs
- About
- Contact
- Shelter pages
- Privacy
- Terms

Core stack:
- Vite
- React
- Tailwind
- Supabase
- RescueGroups v5
- Node scripts

## Matching system

The quiz currently collects approximately 29 fields.

Only dog-side-supported answers should affect percentages.

Supported matching areas currently include:
- size
- age
- children compatibility
- dogs/cats/small pets where structured data exists
- potty training
- first-time friendliness
- energy
- alone time
- shedding/allergy guidance

Seventeen previously unsupported fields had been accidentally awarding full credit to every dog. This was fixed so they contribute zero possible points.

Quiz answers now persist through localStorage on the same browser/device.

Low-confidence AI estimates are now treated conservatively rather than being raised to a high confidence floor.

Estimated match explanations explicitly identify themselves as listing-bio estimates.

## RescueGroups improvements completed

The import previously requested only sparse identity and basic listing data.

It now requests structured compatibility, care, training, personality, and photo data.

New Supabase columns added manually:

- photo_urls text[]
- exercise_needs text
- obedience_training text
- owner_experience text
- yard_required boolean
- fence_needs text
- adult_sexes_ok text
- new_people_reaction text

The importer:
- preserves explicit false
- omits missing sparse fields
- does not erase confirmed data
- sorts pictures by source order
- deduplicates URLs
- stores one primary photo and all photos

## Verified LUVUMALL results

Current LUVUMALL dogs successfully received structured data.

Examples:

Sherlock and Watson:
- good with dogs: true
- good with cats: true
- good with kids: true
- potty trained: false
- activity: Moderately Active
- exercise needs: Moderate
- obedience: Needs Training
- grooming: low
- shedding: moderate
- barking: Some
- yard required: true
- multiple qualities
- three photos

Princess Elsa and Prince Hans also received compatibility, training, grooming, shedding, qualities, and multiple photos.

Velvet received available fields and retained nulls where source data was absent.

## Koda debugging result

Koda:
- RescueGroups ID: 22455174
- Organization: LUVUMALL 5470
- No duplicate row
- Historical listing still exists
- No longer returned by the available/dogs endpoint
- Correctly became unavailable after the organization was enabled in the sync

Koda was useful for debugging but should not be used as the active current-dog test case.

## Data safety principles

Never equate:
- null with false
- breed stereotype with confirmed trait
- lower shedding with guaranteed hypoallergenic
- bio estimate with shelter-confirmed behavior

`hypoallergenic` may contain unsafe historical default false values. Allergy matching should primarily use source-confirmed shedding and cautiously labeled bio estimates. A future cleanup may be needed to distinguish unknown from explicitly false.

## SEO and routing

Canonical dog URL:
`https://hoomanfinder.com/dog/{id}`

Do not add `/dogs/{id}` URLs to the sitemap.

Dog cards should link to `/dog/${dog.id}`.

## Visual direction

Style:
- mobile-first
- editorial
- clean and premium
- soft cream/sage/navy palette
- limited unnecessary whitespace
- strong CTA hierarchy
- no duplicated match percentages
- no unnecessary technical AI language on the frontend

## Launch criteria

Before outreach:
- full quiz-to-results flow works
- score percentages are defensible
- unavailable dogs are hidden
- adoption links work
- source fields override AI estimates
- mobile pages look polished
- live deployment is current
- no runtime console errors
- working tree is clean