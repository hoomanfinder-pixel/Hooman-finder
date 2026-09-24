// Privacy-minimized handling for RescueGroups' animal -> locations relationship.
//
// RescueGroups documents locations as an includable animal relationship, but
// does not document primary/default ordering or a public/adoption-site role.
// Consequently this module retains source evidence without treating it as a
// display placement or as mileage-ready geography.

const LOCATION_FIELDS = [
  "name",
  "city",
  "state",
  "postalcode",
  "lat",
  "lon",
  "coordinates",
];

const SOURCE_LOCATION_FIELDS = [
  "source_location_id",
  "source_location_city",
  "source_location_state",
  "source_location_postal_code",
  "source_location_latitude",
  "source_location_longitude",
  "source_location_name",
  "source_location_provenance",
  "source_location_checked_at",
];

const PROVENANCE = {
  resolved: "rescuegroups:animal.locations",
  absent: "rescuegroups:animal.locations:absent",
  multiple: "rescuegroups:animal.locations:multiple",
};

function clean(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function finiteCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function parseCoordinates(value) {
  const parts = clean(value)?.split(",").map((part) => part.trim()) || [];
  if (parts.length !== 2) return { latitude: null, longitude: null };
  return {
    latitude: finiteCoordinate(parts[0], -90, 90),
    longitude: finiteCoordinate(parts[1], -180, 180),
  };
}

function findIncludedLocation(included, id) {
  return (included || []).find(
    (item) => item?.type === "locations" && String(item.id) === String(id)
  ) || null;
}

function clearedLocation(provenance, checkedAt) {
  return {
    source_location_id: null,
    source_location_city: null,
    source_location_state: null,
    source_location_postal_code: null,
    source_location_latitude: null,
    source_location_longitude: null,
    source_location_name: null,
    source_location_provenance: provenance,
    source_location_checked_at: checkedAt,
  };
}

function resolveAnimalLocation(
  animal,
  included,
  { checkedAt = new Date().toISOString(), relationshipRequested = false } = {}
) {
  const relationships = animal?.relationships;
  if (!relationships || !Object.prototype.hasOwnProperty.call(relationships, "locations")) {
    // RescueGroups documents that null attributes/relationships may be omitted.
    // Only interpret omission as removal when the caller knows this came from
    // a complete response that explicitly requested the relationship.
    if (relationshipRequested) {
      return {
        status: "absent",
        reason: "complete response omitted the requested null location relationship",
        values: clearedLocation(PROVENANCE.absent, checkedAt),
      };
    }
    return { status: "incomplete", reason: "locations relationship missing", values: {} };
  }

  const relationship = relationships.locations;
  if (!relationship || !Object.prototype.hasOwnProperty.call(relationship, "data")) {
    return { status: "incomplete", reason: "locations relationship data missing", values: {} };
  }

  const refs = relationship.data === null
    ? []
    : Array.isArray(relationship.data)
      ? relationship.data
      : [relationship.data];

  if (refs.length === 0) {
    return {
      status: "absent",
      reason: "source explicitly returned no animal location",
      values: clearedLocation(PROVENANCE.absent, checkedAt),
    };
  }

  if (refs.length > 1) {
    return {
      status: "multiple",
      reason: "source returned multiple unordered animal locations",
      locationIds: refs.map((ref) => clean(ref?.id)).filter(Boolean),
      values: clearedLocation(PROVENANCE.multiple, checkedAt),
    };
  }

  const ref = refs[0];
  const id = clean(ref?.id);
  if (!id || (ref?.type && ref.type !== "locations")) {
    return { status: "incomplete", reason: "location relationship reference invalid", values: {} };
  }

  const location = findIncludedLocation(included, id);
  if (!location || !location.attributes) {
    return { status: "incomplete", reason: "included location resource missing", locationIds: [id], values: {} };
  }

  const attrs = location.attributes;
  const parsed = parseCoordinates(attrs.coordinates);
  const latitude = finiteCoordinate(attrs.lat, -90, 90) ?? parsed.latitude;
  const longitude = finiteCoordinate(attrs.lon, -180, 180) ?? parsed.longitude;

  return {
    status: "resolved",
    reason: "single included animal location retained as source evidence",
    locationIds: [id],
    values: {
      source_location_id: id,
      source_location_city: clean(attrs.city),
      source_location_state: clean(attrs.state)?.toUpperCase() || null,
      source_location_postal_code: clean(attrs.postalcode),
      source_location_latitude: latitude,
      source_location_longitude: longitude,
      source_location_name: clean(attrs.name),
      source_location_provenance: PROVENANCE.resolved,
      source_location_checked_at: checkedAt,
    },
  };
}

function preserveSourceLocationOnIncomplete(updateRow) {
  for (const field of SOURCE_LOCATION_FIELDS) delete updateRow[field];
}

module.exports = {
  LOCATION_FIELDS,
  PROVENANCE,
  SOURCE_LOCATION_FIELDS,
  preserveSourceLocationOnIncomplete,
  resolveAnimalLocation,
};
