import { test as base, expect } from "@playwright/test";
import { dogFixtures, shelterFixture } from "./fixtures/dogs.js";

const test = base.extend({
  page: async ({ page }, use) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await use(page);

    expect(
      pageErrors.map((error) => error.message),
      "The page emitted an uncaught error"
    ).toEqual([]);
  },
});

async function mockSupabase(page) {
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split("/").pop();

    if (resource === "quiz_responses") {
      await route.fulfill({
        status: request.method() === "POST" ? 201 : 204,
        headers: { "content-type": "application/json" },
        body: request.method() === "POST" ? "[]" : "",
      });
      return;
    }

    if (resource === "shelters") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(shelterFixture),
      });
      return;
    }

    if (resource === "dogs") {
      const idFilter = url.searchParams.get("id");
      const dog = idFilter
        ? dogFixtures.find(({ id }) => idFilter === `eq.${id}`)
        : null;
      const wantsSingle = request.headers()["accept"]?.includes("vnd.pgrst.object");

      await route.fulfill({
        status: dog || !idFilter ? 200 : 404,
        headers: {
          "content-type": "application/json",
          "content-range": `0-${dogFixtures.length - 1}/${dogFixtures.length}`,
        },
        body: JSON.stringify(idFilter && wantsSingle ? dog || {} : dog ? [dog] : dogFixtures),
      });
      return;
    }

    await route.abort("blockedbyclient");
  });
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

async function expectDecodedImage(image) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => element.naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() => image.evaluate((element) => element.naturalHeight))
    .toBeGreaterThan(0);
}

test("homepage loads and navigates to the quiz", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: /Find adoptable dogs that fit your real life/i })
  ).toBeVisible();
  await page.getByRole("link", { name: "Take the Quiz", exact: true }).first().click();

  await expect(page).toHaveURL(/\/quiz\?session=[^&]+&mode=dealbreakers/);
  await expect(page.getByRole("heading", { name: "Start your match" })).toBeVisible();
});

test("homepage navigates to browse dogs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Browse Dogs", exact: true }).first().click();

  await expect(page).toHaveURL(/\/dogs$/);
  await expect(page.getByRole("heading", { name: "Browse adoptable dogs." })).toBeVisible();
  await expect(page.getByText("2 available dogs")).toBeVisible();
});

test("essential quiz reaches deterministic results with valid percentages", async ({ page }) => {
  await page.goto("/quiz?session=e2e-quiz-session&mode=dealbreakers", {
    waitUntil: "domcontentloaded",
  });

  for (const answer of [
    "Any size / flexible",
    "Any age / flexible",
    "No children in the home",
    "No other animals / not important",
    "Doesn’t matter / I’m open to training",
  ]) {
    await page.getByRole("button", { name: answer, exact: true }).click();
  }

  await expect(page.getByText("5/5 answered")).toBeVisible();
  await page.getByRole("button", { name: "See my matches" }).click();

  await expect(page).toHaveURL(/\/results\?session=e2e-quiz-session/);
  await expect(
    page.getByRole("heading", { name: "Your best-fit dogs, ranked." })
  ).toBeVisible();

  const matchLabels = await page.getByText(/^\d+% match$/).allTextContents();
  expect(matchLabels.length).toBeGreaterThan(0);
  for (const label of matchLabels) {
    const percentage = Number.parseInt(label, 10);
    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);
  }
});

test("browse opens a complete dog profile and saved state survives reload", async ({ page }) => {
  await page.goto("/dogs", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: /Maple/ }).first().click();
  await expect(page).toHaveURL(/\/dog\/e2e-dog-maple/);
  await expect(page.getByText("Adoptable dog profile")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maple", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open larger photo of Maple" })).toBeVisible();
  const dogImage = page.getByRole("img", { name: /Maple, adoptable/i });
  await expect(dogImage).toHaveAttribute("src", dogFixtures[0].photo_url);
  await expectDecodedImage(dogImage);
  await expect(page.getByText(shelterFixture.name).first()).toBeVisible();
  await expectDecodedImage(page.getByRole("img", { name: `${shelterFixture.name} logo` }));

  const officialListing = page.getByRole("link", { name: "View official listing" });
  await expect(officialListing).toHaveAttribute(
    "href",
    "https://greatlakesdogrescue.example.org/dogs/maple/apply"
  );

  await page.getByRole("button", { name: "♡ Save" }).click();
  await expect(page.getByRole("button", { name: "♥ Saved" })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "♥ Saved" })).toBeVisible();
  await expect(dogImage).toHaveAttribute("src", dogFixtures[0].photo_url);
  await expectDecodedImage(dogImage);
});
