begin;

alter table public.dogs
  drop constraint dogs_bio_good_with_dogs_check;

alter table public.dogs
  add constraint dogs_bio_good_with_dogs_check
  check (
    bio_good_with_dogs = any (
      array[
        'yes'::text,
        'most_likely'::text,
        'may_do_well'::text,
        'selective'::text,
        'only_dog'::text,
        'no'::text,
        'unknown'::text
      ]
    )
  );

alter table public.dogs
  drop constraint dogs_bio_good_with_kids_check;

alter table public.dogs
  add constraint dogs_bio_good_with_kids_check
  check (
    bio_good_with_kids = any (
      array[
        'yes'::text,
        'most_likely'::text,
        'may_do_well'::text,
        'older_children_only'::text,
        'no'::text,
        'unknown'::text
      ]
    )
  );

commit;
