// rescuegroups-rescues.cjs

const RESCUES = [
  {
    name: "Happy Days Dog and Cat Rescue",
    city: "Livonia",
    state: "MI",
    rescueGroupsOrgId: "7921",
    supabaseShelterId: "2bd4355c-93f6-4f8d-8e47-4b734a24e953",
    enabled: true,
  },

  // Peace Love and Paws did not return usable dogs from RescueGroups yet.
  // Keep it disabled until we confirm whether they are listed in RescueGroups
  // or need a different import method.
  {
    name: "Peace Love and Paws",
    city: "Detroit",
    state: "MI",
    rescueGroupsOrgId: null,
    supabaseShelterId: null,
    enabled: false,
  },

  // Saved for later once we confirm sources/import method
  {
    name: "Detroit Dog Rescue",
    city: "Detroit",
    state: "MI",
    rescueGroupsOrgId: null,
    supabaseShelterId: null,
    enabled: false,
  },
  {
    name: "Rebel Dogs Detroit",
    city: "Detroit",
    state: "MI",
    rescueGroupsOrgId: null,
    supabaseShelterId: null,
    enabled: false,
  },
  {
    name: "Friends of Detroit Animal Care and Control",
    city: "Detroit",
    state: "MI",
    rescueGroupsOrgId: null,
    supabaseShelterId: null,
    enabled: false,
  },
];

module.exports = { RESCUES };