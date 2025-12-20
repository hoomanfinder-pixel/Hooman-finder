# Next (Shelter MVP)

## 1) Shelter login
- Add Supabase Auth (email + password)
- Shelter accounts only (no adopters yet)
- After login, route to /shelter dashboard

## 2) Add dog form
- Simple form: name, age_years, size, energy_level, play_styles, potty_trained, good_with_kids, good_with_cats, description, adoptable
- On submit: insert into public.dogs with shelter_id = logged-in shelter’s id
- Add “My Dogs” list under the form to confirm it worked

## 3) RLS (Row Level Security)
- Turn on RLS for dogs + shelters tables
- Policies:
  - Shelters can read their own shelter row
  - Shelters can read/insert/update ONLY their own dogs (dogs.shelter_id matches)
  - Public can read ONLY adoptable dogs (later)
- Don’t turn on public restrictions until shelter flow works

## Notes / gotchas
- Confirm how shelter_id is mapped (auth user id vs shelters table id)
- Keep MVP clean: no photos upload yet (next step after form works)
