const DACC_RESCUEGROUPS_ORG_ID = "8883";
const DACC_SHELTER_NAME = "Detroit Animal Care and Control";
const DACC_WEBSITE = "https://www.friendsofdacc.org/";
const DACC_ADOPT_URL = "https://www.friendsofdacc.org/adopt/";

const SHELTER_SELECT =
  "id, name, contact_email, verified, city, state, website, logo_url, owner_user_id, apply_url, rescuegroups_org_id";

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isBlank(value) {
  return clean(value) === null;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function isDaccOrg(orgId) {
  return String(orgId || "") === DACC_RESCUEGROUPS_ORG_ID;
}

function sourceFromDog(dog) {
  const orgId = clean(dog?.rescuegroups_org_id);
  const dacc = isDaccOrg(orgId);

  return {
    shelter_id: clean(dog?.shelter_id),
    rescuegroups_org_id: orgId,
    name: dacc ? DACC_SHELTER_NAME : clean(dog?.shelter_name),
    city: dacc ? "Detroit" : clean(dog?.placement_city),
    state: dacc ? "MI" : clean(dog?.placement_state),
    website: dacc ? DACC_WEBSITE : clean(dog?.shelter_website),
    apply_url: dacc
      ? DACC_ADOPT_URL
      : clean(dog?.adoption_url) || clean(dog?.source_url) || clean(dog?.shelter_website),
    contact_email: clean(dog?.shelter_contact_email),
  };
}

async function findShelterByOrgId(supabase, orgId) {
  if (!orgId) return null;

  const { data, error } = await supabase
    .from("shelters")
    .select(SHELTER_SELECT)
    .eq("rescuegroups_org_id", String(orgId))
    .limit(1);

  if (error) {
    throw new Error(`Could not look up shelter by RescueGroups org ID ${orgId}: ${error.message}`);
  }

  return data?.[0] || null;
}

async function findShelterById(supabase, shelterId) {
  if (!shelterId) return null;

  const { data, error } = await supabase
    .from("shelters")
    .select(SHELTER_SELECT)
    .eq("id", shelterId)
    .limit(1);

  if (error) {
    throw new Error(`Could not look up shelter by ID ${shelterId}: ${error.message}`);
  }

  return data?.[0] || null;
}

async function findShelterByName(supabase, name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;

  const { data: exactMatches, error: exactError } = await supabase
    .from("shelters")
    .select(SHELTER_SELECT)
    .eq("name", name)
    .limit(10);

  if (exactError) {
    throw new Error(`Could not look up shelter by name ${name}: ${exactError.message}`);
  }

  const exactMatch = (exactMatches || []).find(
    (shelter) => normalizeName(shelter.name) === normalizedName
  );

  if (exactMatch) return exactMatch;

  const { data: shelters, error: listError } = await supabase
    .from("shelters")
    .select(SHELTER_SELECT)
    .limit(1000);

  if (listError) {
    throw new Error(`Could not list shelters for normalized name match: ${listError.message}`);
  }

  return (
    (shelters || []).find((shelter) => normalizeName(shelter.name) === normalizedName) ||
    null
  );
}

function buildShelterInsert(source) {
  return {
    name: source.name,
    contact_email: source.contact_email || null,
    verified: true,
    city: source.city || null,
    state: source.state || null,
    website: source.website || null,
    logo_url: null,
    apply_url: source.apply_url || null,
    rescuegroups_org_id: source.rescuegroups_org_id || null,
  };
}

function buildShelterUpdate(existingShelter, source) {
  const update = {};

  if (existingShelter.verified !== true) {
    update.verified = true;
  }

  if (isBlank(existingShelter.rescuegroups_org_id) && source.rescuegroups_org_id) {
    update.rescuegroups_org_id = source.rescuegroups_org_id;
  }

  if (isBlank(existingShelter.name) && source.name) update.name = source.name;
  if (isBlank(existingShelter.city) && source.city) update.city = source.city;
  if (isBlank(existingShelter.state) && source.state) update.state = source.state;
  if (isBlank(existingShelter.website) && source.website) update.website = source.website;
  if (isBlank(existingShelter.apply_url) && source.apply_url) update.apply_url = source.apply_url;
  if (isBlank(existingShelter.contact_email) && source.contact_email) {
    update.contact_email = source.contact_email;
  }

  return update;
}

async function ensureShelterForSource(supabase, sourceInput) {
  const source = {
    shelter_id: clean(sourceInput?.shelter_id),
    rescuegroups_org_id: clean(sourceInput?.rescuegroups_org_id),
    name: clean(sourceInput?.name),
    city: clean(sourceInput?.city),
    state: clean(sourceInput?.state),
    website: clean(sourceInput?.website),
    apply_url: clean(sourceInput?.apply_url),
    contact_email: clean(sourceInput?.contact_email),
  };

  if (isDaccOrg(source.rescuegroups_org_id)) {
    source.name = DACC_SHELTER_NAME;
    source.city = "Detroit";
    source.state = "MI";
    source.website = DACC_WEBSITE;
    source.apply_url = DACC_ADOPT_URL;
  }

  if (!source.name && !source.rescuegroups_org_id) {
    return null;
  }

  const existingShelter =
    (await findShelterById(supabase, source.shelter_id)) ||
    (await findShelterByOrgId(supabase, source.rescuegroups_org_id)) ||
    (await findShelterByName(supabase, source.name));

  if (existingShelter?.id) {
    const update = buildShelterUpdate(existingShelter, source);

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from("shelters")
        .update(update)
        .eq("id", existingShelter.id);

      if (error) {
        throw new Error(`Could not update shelter ${source.name}: ${error.message}`);
      }
    }

    return existingShelter.id;
  }

  const { data: newShelter, error } = await supabase
    .from("shelters")
    .insert(buildShelterInsert(source))
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create shelter ${source.name}: ${error.message}`);
  }

  return newShelter.id;
}

async function attachShelterIdsToDogs(supabase, dogs) {
  const shelterIdCache = new Map();

  for (const dog of dogs) {
    const source = sourceFromDog(dog);
    const cacheKey =
      source.shelter_id ||
      source.rescuegroups_org_id ||
      (source.name ? `name:${normalizeName(source.name)}` : null);

    if (!cacheKey) continue;

    if (!shelterIdCache.has(cacheKey)) {
      shelterIdCache.set(cacheKey, await ensureShelterForSource(supabase, source));
    }

    const shelterId = shelterIdCache.get(cacheKey);
    if (shelterId) {
      dog.shelter_id = shelterId;
    }
  }

  return dogs;
}

module.exports = {
  DACC_ADOPT_URL,
  DACC_RESCUEGROUPS_ORG_ID,
  DACC_SHELTER_NAME,
  DACC_WEBSITE,
  attachShelterIdsToDogs,
  ensureShelterForSource,
};
