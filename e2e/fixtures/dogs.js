const fixtureImage = (label, color, { width = 800, height = 600 } = {}) =>
  `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${color}" />
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial" font-size="54" fill="#183D35">${label}</text>
    </svg>
  `)}`;

export const shelterFixture = {
  id: "e2e-shelter-1",
  name: "Great Lakes Dog Rescue",
  website: "https://greatlakesdogrescue.example.org",
  apply_url: "https://greatlakesdogrescue.example.org/adopt",
  logo_url: fixtureImage("GLDR", "#DFE7D7", { width: 400, height: 200 }),
  city: "Detroit",
  state: "MI",
  rescuegroups_org_id: "e2e-org-1",
};

export const dogFixtures = [
  {
    id: "e2e-dog-maple",
    name: "Maple",
    breed: "Labrador Retriever Mix",
    age_years: 3,
    age_text: "3 years",
    size: "Medium",
    energy_level: "Moderate",
    description: "Maple is a friendly, adaptable dog who enjoys walks and quiet evenings.",
    photo_url: fixtureImage("Maple", "#F3C982"),
    photo_urls: [],
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    urgency_level: "Standard",
    source: "rescuegroups",
    external_id: "e2e-maple",
    rescuegroups_id: "e2e-maple",
    rescuegroups_org_id: "e2e-org-1",
    source_url: "https://greatlakesdogrescue.example.org/dogs/maple",
    adoption_url: "https://greatlakesdogrescue.example.org/dogs/maple/apply",
    shelter_name: shelterFixture.name,
    placement_city: "Detroit",
    placement_state: "MI",
    good_with_kids: true,
    good_with_dogs: true,
    good_with_cats: true,
    potty_trained: true,
    hypoallergenic: false,
    created_at: "2026-08-01T12:00:00.000Z",
    shelters: shelterFixture,
  },
  {
    id: "e2e-dog-river",
    name: "River",
    breed: "Shepherd Mix",
    age_years: 7,
    age_text: "7 years",
    size: "Large",
    energy_level: "Low",
    description: "River is a calm senior who prefers a relaxed daily routine.",
    photo_url: fixtureImage("River", "#C7D4BB"),
    photo_urls: [],
    adoptable: true,
    adoption_pending: false,
    availability_status: "active",
    urgency_level: "Standard",
    source: "rescuegroups",
    external_id: "e2e-river",
    rescuegroups_id: "e2e-river",
    rescuegroups_org_id: "e2e-org-1",
    source_url: "https://greatlakesdogrescue.example.org/dogs/river",
    adoption_url: "https://greatlakesdogrescue.example.org/dogs/river/apply",
    shelter_name: shelterFixture.name,
    placement_city: "Detroit",
    placement_state: "MI",
    good_with_kids: false,
    good_with_dogs: true,
    good_with_cats: false,
    potty_trained: true,
    hypoallergenic: false,
    created_at: "2026-07-31T12:00:00.000Z",
    shelters: shelterFixture,
  },
];

const scenarioDog = ({ id, name, color, ...overrides }) => ({
  id,
  name,
  breed: "Mixed Breed",
  age_years: 4,
  age_text: "4 years",
  size: "Medium",
  energy_level: "Moderate",
  description: `${name} has deterministic compatibility details for local end-to-end testing.`,
  photo_url: fixtureImage(name, color),
  photo_urls: [],
  adoptable: true,
  adoption_pending: false,
  availability_status: "available",
  urgency_level: "Standard",
  source: "rescuegroups",
  external_id: id,
  rescuegroups_id: id,
  rescuegroups_org_id: shelterFixture.rescuegroups_org_id,
  source_url: `https://greatlakesdogrescue.example.org/dogs/${id}`,
  adoption_url: `https://greatlakesdogrescue.example.org/dogs/${id}/apply`,
  shelter_name: shelterFixture.name,
  placement_city: "Detroit",
  placement_state: "MI",
  good_with_kids: true,
  good_with_dogs: true,
  good_with_cats: true,
  potty_trained: true,
  hypoallergenic: false,
  max_alone_hours: 8,
  created_at: "2026-08-02T12:00:00.000Z",
  shelters: shelterFixture,
  ...overrides,
});

const malformedLinkShelter = {
  ...shelterFixture,
  website: "https://",
  apply_url: "http://",
};

export const childCompatibilityDogs = [
  scenarioDog({
    id: "e2e-child-incompatible",
    name: "Juniper",
    color: "#E8B4A2",
    good_with_kids: false,
  }),
  scenarioDog({
    id: "e2e-child-unknown",
    name: "Scout",
    color: "#B9D7EA",
    good_with_kids: null,
    source_url: "http://",
    adoption_url: "https://",
    shelter_website: "http://",
    shelters: malformedLinkShelter,
  }),
];

export const catCompatibilityDogs = [
  scenarioDog({
    id: "e2e-cat-incompatible",
    name: "Clover",
    color: "#D7C2E8",
    good_with_cats: false,
  }),
  scenarioDog({
    id: "e2e-cat-unknown",
    name: "Wren",
    color: "#BFD8BD",
    good_with_cats: null,
  }),
];

export const dogCompatibilityDogs = [
  scenarioDog({
    id: "e2e-dog-incompatible",
    name: "Piper",
    color: "#F0C7A5",
    good_with_dogs: false,
  }),
  scenarioDog({
    id: "e2e-dog-unknown",
    name: "Marlow",
    color: "#ABC8D8",
    good_with_dogs: null,
  }),
];

export const aloneTimeDogs = [
  scenarioDog({
    id: "e2e-alone-fit",
    name: "Harbor",
    color: "#C7D4BB",
    max_alone_hours: 8,
  }),
  scenarioDog({
    id: "e2e-alone-mismatch",
    name: "Dash",
    color: "#F3C982",
    max_alone_hours: 2,
  }),
];
