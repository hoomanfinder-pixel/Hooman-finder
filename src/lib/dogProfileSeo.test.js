import test from "node:test";
import assert from "node:assert/strict";

import { buildDogProfileMetadata, getConfirmedDogProfile } from "./dogProfileSeo.js";
import { buildDogMetadata, injectDogDocument } from "../../middleware.js";

const APP_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Hooman Finder</title>
    <meta name="description" content="Default description" />
    <link rel="canonical" href="https://hoomanfinder.com/" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

function buildDogDocument(dog) {
  const metadata = buildDogMetadata(dog, dog.id);
  return injectDogDocument(APP_SHELL, dog, metadata);
}

const PUBLIC_DOG = {
  id: "dog-123",
  name: "Mabel & Friends",
  breed: "Labrador Retriever",
  age_text: "2 years",
  age_years: 2,
  size: "Large",
  placement_city: "Detroit",
  placement_state: "MI",
  shelter_name: "Detroit Dog Rescue",
  description: "A gentle, house-trained dog who enjoys neighborhood walks.",
  photo_url: "https://images.example.org/mabel.jpg",
  adoption_url: "https://adopt.example.org/mabel",
  adoptable: true,
  adoption_pending: false,
  urgency_level: "Standard",
  availability_status: "available",
  rescuegroups_id: "12345",
  ai_traits: {
    energy_level: "high",
  },
};

test("confirmed dog profile excludes AI-estimated traits", () => {
  const profile = getConfirmedDogProfile(PUBLIC_DOG);

  assert.deepEqual(profile, {
    name: "Mabel & Friends",
    breed: "Labrador Retriever",
    age: "2 years",
    size: "Large",
    location: "Detroit, MI",
    shelterName: "Detroit Dog Rescue",
    description: "A gentle, house-trained dog who enjoys neighborhood walks.",
    image: "https://images.example.org/mabel.jpg",
    adoptionUrl: "https://adopt.example.org/mabel",
    adoptionLabel: "View official listing",
  });
  assert.equal("energyLevel" in profile, false);
});

test("server dog document contains crawlable profile content and canonical metadata", () => {
  const html = buildDogDocument(PUBLIC_DOG);

  assert.match(html, /<title>Mabel &amp; Friends - Adoptable Labrador Retriever \| Hooman Finder<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/hoomanfinder\.com\/dog\/dog-123" \/>/);
  assert.match(html, /<main data-dog-profile-snapshot="true">/);
  assert.match(html, /<h1>Mabel &amp; Friends<\/h1>/);
  assert.match(html, /<dt>Breed<\/dt><dd>Labrador Retriever<\/dd>/);
  assert.match(html, /<dt>Age<\/dt><dd>2 years<\/dd>/);
  assert.match(html, /<dt>Size<\/dt><dd>Large<\/dd>/);
  assert.match(html, /<dt>Location<\/dt><dd>Detroit, MI<\/dd>/);
  assert.match(html, /Listed by <strong>Detroit Dog Rescue<\/strong>/);
  assert.match(html, /A gentle, house-trained dog who enjoys neighborhood walks\./);
  assert.match(html, /src="https:\/\/images\.example\.org\/mabel\.jpg"/);
  assert.match(html, /href="https:\/\/adopt\.example\.org\/mabel"/);
  assert.doesNotMatch(html, /high/);
});

test("unsafe images and adoption links are omitted from the server snapshot", () => {
  const html = buildDogDocument({
    ...PUBLIC_DOG,
    photo_url: "javascript:alert(1)",
    adoption_url: "javascript:alert(2)",
    source_url: "",
  });

  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /javascript:/);
});

test("unavailable dogs keep noindex metadata and receive no public snapshot", () => {
  const html = buildDogDocument({
    ...PUBLIC_DOG,
    adoptable: false,
    availability_status: "unavailable",
  });

  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.doesNotMatch(html, /data-dog-profile-snapshot/);
  assert.doesNotMatch(html, /<h1>Mabel &amp; Friends<\/h1>/);
});

test("long source bios are compacted only in the server snapshot", () => {
  const longDescription = `${"Source-backed adoption biography. ".repeat(40)}Final sentence.`;
  const html = buildDogDocument({ ...PUBLIC_DOG, description: longDescription });
  const snapshotBio = html.match(/<h2 id="dog-snapshot-about">[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1];

  assert.ok(snapshotBio);
  assert.ok(snapshotBio.length <= 900);
  assert.match(snapshotBio, /…$/);
  assert.equal(
    getConfirmedDogProfile({ ...PUBLIC_DOG, description: longDescription }).description,
    longDescription
  );
});

test("shared metadata keeps React and server title and description inputs aligned", () => {
  const metadata = buildDogProfileMetadata(PUBLIC_DOG, PUBLIC_DOG.id, {
    publiclyVisible: true,
  });

  assert.equal(
    metadata.title,
    "Mabel & Friends - Adoptable Labrador Retriever | Hooman Finder"
  );
  assert.equal(
    metadata.description,
    "Meet Mabel & Friends, an adoptable Labrador Retriever listed through Detroit Dog Rescue. View photos, rescue details, and lifestyle fit information on Hooman Finder."
  );
});
