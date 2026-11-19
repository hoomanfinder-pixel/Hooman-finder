import { dogFixtures, premiumResultCardDogs, shelterFixture } from "./fixtures/dogs.js";
import {
  expect,
  expectDecodedImage,
  expectNoHorizontalOverflow,
  test,
} from "./support.js";

const richDog = {
  ...dogFixtures[0],
  id: "e2e-profile-rich",
  external_id: "e2e-profile-rich",
  rescuegroups_id: "e2e-profile-rich",
  name: "Marigold",
  gender: "Female",
  description: "Marigold is a warm, curious companion who loves neighborhood walks, puzzle toys, and settling near her people after an active morning. She has lived comfortably with other dogs and enjoys a predictable routine. Her foster family says she learns quickly, checks in often, and is happiest when included in everyday life. She would appreciate patient introductions, regular exercise, and a home ready to keep building her confidence with positive reinforcement. Marigold can be playful outside and wonderfully calm once the day winds down. The rescue can share more about her current routine, introductions, and transition plan.",
  photo_urls: [
    "https://images.example.org/e2e/Marigold-secondary.svg",
  ],
  shedding_level: "Medium",
  exercise_needs: "Moderate",
  obedience_training: "Basic Training",
  source_url: "https://greatlakesdogrescue.example.org/dogs/marigold",
  adoption_url: "https://greatlakesdogrescue.example.org/dogs/marigold/apply",
};

const estimatedDog = {
  ...richDog,
  id: "e2e-profile-estimated",
  external_id: "e2e-profile-estimated",
  rescuegroups_id: "e2e-profile-estimated",
  name: "Poppy",
  size: null,
  energy_level: null,
  potty_trained: null,
  good_with_dogs: null,
  good_with_cats: null,
  good_with_kids: null,
  shedding_level: null,
  exercise_needs: null,
  obedience_training: null,
  bio_size: "Medium",
  bio_energy_level: "medium",
  bio_potty_trained: "yes",
  bio_good_with_dogs: "most_likely",
  bio_good_with_cats: "unknown",
  bio_good_with_kids: "may_do_well",
  bio_shedding_level: "low",
  bio_exercise_needs: "high",
  bio_training_needs: "medium",
  bio_max_alone_hours_label: "4–6",
  ai_traits: {
    energy_level: { evidence_basis: "profile_inference" },
    potty_trained: { evidence_basis: "bio_explicit" },
    good_with_dogs: { evidence_basis: "profile_inference" },
    good_with_kids: { evidence_basis: "bio_explicit" },
    shedding_level: { evidence_basis: "breed_coat_inference" },
    exercise_needs: { evidence_basis: "profile_inference" },
    training_needs: { evidence_basis: "profile_inference" },
    max_alone_hours_estimate: { evidence_basis: "profile_inference" },
  },
  source_url: "https://greatlakesdogrescue.example.org/dogs/poppy",
  adoption_url: "https://greatlakesdogrescue.example.org/dogs/poppy/apply",
};

const limitedDog = {
  ...richDog,
  id: "e2e-profile-limited",
  name: "Moss",
  source: "manual",
  external_id: "e2e-profile-limited",
  rescuegroups_id: null,
  rescuegroups_org_id: null,
  ingestion_source_id: null,
  ingestion_sources: null,
  verified: true,
  source_confidence: "verified",
  description: "",
  photo_url: null,
  photo_urls: [],
  size: null,
  energy_level: null,
  potty_trained: null,
  good_with_dogs: null,
  good_with_cats: null,
  good_with_kids: null,
  shedding_level: null,
  exercise_needs: null,
  obedience_training: null,
  source_url: "https://www.petfinder.com/dog/moss-e2e",
  adoption_url: "https://www.petfinder.com/dog/moss-e2e",
};

const unavailableDog = {
  ...richDog,
  id: "e2e-profile-unavailable",
  external_id: "e2e-profile-unavailable",
  rescuegroups_id: "e2e-profile-unavailable",
  name: "Archived Listing",
  availability_status: "unavailable",
};

async function seedQuiz(page, sessionId, answers) {
  await page.addInitScript(({ id, values }) => {
    sessionStorage.setItem(`hoomanFinder.quizResponses.session.v1:${id}`, JSON.stringify(values));
    localStorage.setItem(`hoomanFinder.quizResponses.local.v1:${id}`, JSON.stringify(values));
    localStorage.setItem("hoomanFinderActiveQuizSession", id);
  }, { id: sessionId, values: answers });
}

test.describe("premium dog profile", () => {
  test.use({ scenario: { dogs: [richDog] } });

  test("presents a photography-led profile with a validated official destination", async ({ page }) => {
    await page.goto(`/dog/${richDog.id}?from=dogs`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: richDog.name, exact: true })).toBeVisible();
    const image = page.getByRole("img", { name: `${richDog.name}, adoptable ${richDog.breed}` });
    await expect(image).toHaveAttribute("src", richDog.photo_url);
    await expectDecodedImage(image);
    await expect(page.getByText("Detroit, MI").first()).toBeVisible();
    await expect(page.getByText(shelterFixture.name).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View official listing" })).toHaveAttribute(
      "href",
      richDog.adoption_url
    );
    await expect(page.getByRole("region", { name: "Shelter-confirmed" })).toContainText("Good with dogs");
  });

  test("save control is accessible, announced, and survives reload", async ({ page }) => {
    await page.goto(`/dog/${richDog.id}`, { waitUntil: "domcontentloaded" });

    const save = page.getByRole("button", { name: `Save ${richDog.name}` });
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await save.click();
    const remove = page.getByRole("button", { name: `Remove ${richDog.name} from saved dogs` });
    await expect(remove).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status")).toContainText(`${richDog.name} saved to your dogs.`);

    await remove.click();
    await expect(page.getByRole("button", { name: `Save ${richDog.name}` }))
      .toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("status")).toContainText(`${richDog.name} removed from your saved dogs.`);

    await page.getByRole("button", { name: `Save ${richDog.name}` }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: `Remove ${richDog.name} from saved dogs` })).toBeVisible();
  });

  test("shows lifestyle fit without dropping compatibility cautions", async ({ page }) => {
    const cautionDog = premiumResultCardDogs.find(({ id }) => id === "e2e-premium-caution");
    const sessionId = "e2e-profile-caution";
    await seedQuiz(page, sessionId, {
      size_preference: ["medium"],
      age_preference: ["adult"],
      housing_type: "apartment",
      yard: "no",
    });

    await page.route("**/rest/v1/dogs*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("id") === `eq.${cautionDog.id}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cautionDog) });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/dog/${cautionDog.id}?session=${sessionId}&from=results`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /may fit parts of your home and routine/i })).toBeVisible();
    await expect(page.getByText("Important compatibility caution").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View official listing" })).toHaveAttribute("href", cautionDog.adoption_url);
  });
});

test.describe("profile evidence states", () => {
  test.use({ scenario: { dogs: [estimatedDog] } });

  test("keeps AI estimates and unknowns visibly separate from confirmed facts", async ({ page }) => {
    await page.goto(`/dog/${estimatedDog.id}`, { waitUntil: "domcontentloaded" });

    const estimated = page.getByRole("region", { name: "AI-estimated · confirm" });
    await expect(estimated).toContainText("Potty trained");
    await expect(estimated).toContainText("Interpreted from listing bio");
    await expect(estimated).toContainText("AI profile estimate");
    await expect(page.getByRole("region", { name: "Still unknown" })).toContainText("Good with cats");
    await expect(page.getByText("Estimates can help you form questions")).toBeVisible();
  });
});

test.describe("limited and unavailable profiles", () => {
  test("uses an honest fallback when information and photography are limited", async ({ page }) => {
    await page.route("**/rest/v1/dogs*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("id") === `eq.${limitedDog.id}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(limitedDog) });
        return;
      }
      await route.fallback();
    });
    await page.goto(`/dog/${limitedDog.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("img", { name: `Photo unavailable for ${limitedDog.name}` })).toBeVisible();
    await expect(page.getByText("A full description isn't available here yet.").last()).toBeVisible();
    await expect(page.getByRole("region", { name: "Still unknown" })).toContainText("Good with dogs");
    await expect(page.getByRole("link", { name: "View official listing" })).toHaveAttribute("href", limitedDog.adoption_url);
  });

  test("does not infer adoption status for a non-public listing", async ({ page }) => {
    await page.route("**/rest/v1/dogs*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("id") === `eq.${unavailableDog.id}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(unavailableDog) });
        return;
      }
      await route.fallback();
    });
    await page.goto(`/dog/${unavailableDog.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "This listing isn’t currently available to show." })).toBeVisible();
    await expect(page.getByText(/does not confirm whether the dog was adopted/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse available dogs" })).toBeVisible();
  });

  test("offers recovery after a temporary profile fetch error", async ({ page }) => {
    let failRequest = true;
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/rest/v1/**", async (route) => {
      const resource = new URL(route.request().url()).pathname.split("/").pop();
      if (resource !== "dogs") {
        await route.abort("blockedbyclient");
        return;
      }
      if (failRequest) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary failure" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dogFixtures[0]) });
    });
    await page.goto(`/dog/${dogFixtures[0].id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "We couldn’t load this profile." })).toBeVisible();
    failRequest = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: dogFixtures[0].name, exact: true })).toBeVisible();
  });

  test("shows a structured profile skeleton while data is loading", async ({ page }) => {
    await page.route("**/rest/v1/dogs*", async (route) => {
      // React StrictMode can issue more than one development fetch. Hold every
      // matching request long enough to observe the loading UI deterministically.
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fallback();
    });

    await page.goto(`/dog/${dogFixtures[0].id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: dogFixtures[0].name, exact: true })).toBeVisible();
  });
});

for (const [label, viewport] of [
  ["320px mobile", { width: 320, height: 760 }],
  ["390px mobile", { width: 390, height: 844 }],
  ["tablet", { width: 768, height: 1024 }],
  ["desktop", { width: 1440, height: 900 }],
]) {
  test(`${label} profile is readable and overflow-free`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/rest/v1/dogs*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("id") === `eq.${richDog.id}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(richDog) });
        return;
      }
      await route.fallback();
    });
    await page.goto(`/dog/${richDog.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: richDog.name, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View official listing" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
