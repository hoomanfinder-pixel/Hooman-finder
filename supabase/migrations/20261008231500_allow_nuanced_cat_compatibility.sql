begin;

alter table public.dogs
  drop constraint if exists dogs_bio_good_with_cats_check;

alter table public.dogs
  add constraint dogs_bio_good_with_cats_check
  check (
    bio_good_with_cats = any (
      array[
        'yes'::text,
        'most_likely'::text,
        'may_do_well'::text,
        'selective'::text,
        'no'::text,
        'unknown'::text
      ]
    )
  );

commit;
