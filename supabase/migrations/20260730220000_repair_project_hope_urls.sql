begin;

update public.dogs
set
  source_url = 'https://projecthoperescue.org',
  adoption_url = 'https://projecthoperescue.org',
  shelter_website = 'https://projecthoperescue.org'
where rescuegroups_org_id = '6454'
  and (
    btrim(coalesce(source_url, '')) in ('http://', 'https://')
    or btrim(coalesce(adoption_url, '')) in ('http://', 'https://')
    or btrim(coalesce(shelter_website, '')) in ('http://', 'https://')
  );

commit;
