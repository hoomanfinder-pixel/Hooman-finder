import {
  answerEssentialQuiz,
  expect,
  expectDecodedImage,
  getCardPercentage,
  getResultCard,
  expectValidMatchPercentages,
  test,
} from "./support.js";
import { dogFixtures, shelterFixture } from "./fixtures/dogs.js";

const incrementalDogs = Array.from({ length: 30 }, (_, index) => ({
  ...dogFixtures[0],
  id: `e2e-incremental-${index}`,
  external_id: `e2e-incremental-${index}`,
  rescuegroups_id: `e2e-incremental-${index}`,
  name: index === 29 ? "Georgia Last Dog" : `Batch Dog ${String(index).padStart(2, "0")}`,
  placement_city: index === 29 ? "Atlanta" : "Detroit",
  placement_state: index === 29 ? "GA" : "MI",
  source_url: `https://greatlakesdogrescue.example.org/dogs/incremental-${index}`,
  adoption_url: `https://greatlakesdogrescue.example.org/dogs/incremental-${index}/apply`,
  created_at: new Date(Date.UTC(2026, 7, 1, 12, 0, index)).toISOString(),
}));

test("homepage loads and navigates to the quiz", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: /Find adoptable dogs that fit your real life/i })
  ).toBeVisible();
  await page.getByRole("link", { name: "Take the Quiz", exact: true }).first().click();

  await expect(page).toHaveURL(/\/quiz$/);
  await expect(
    page.getByRole("heading", { name: "Find an adoptable dog that fits your lifestyle" })
  ).toBeVisible();
});

test("homepage navigates to browse dogs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Browse Dogs", exact: true }).first().click();

  await expect(page).toHaveURL(/\/dogs$/);
  await expect(
    page.getByRole("heading", { name: "Browse current adoptable rescue dogs." }),
  ).toBeVisible();
  await expect(page.getByText("2 available dogs")).toBeVisible();
});

test("browse preserves prerendered dogs after a failed fetch and recovers on retry", async ({
  page,
}) => {
  const prerenderData = JSON.stringify({ dogs: [dogFixtures[0]] }).replace(/</g, "\\u003c");
  let retryRequested = false;
  let failedCatalogRequests = 0;
  let retryCatalogRequestObserved = false;

  await page.route("**/dogs", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }

    const response = await route.fetch();
    const body = (await response.text()).replace(
      /<script id="hooman-prerender-data" type="application\/json">[\s\S]*?<\/script>/,
      `<script id="hooman-prerender-data" type="application/json">${prerenderData}</script>`
    );
    await route.fulfill({ response, body });
  });

  await page.route("**/rest/v1/dogs*", async (route) => {
    if (!retryRequested) {
      failedCatalogRequests += 1;
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Temporary catalog failure" }),
      });
      return;
    }

    retryCatalogRequestObserved = true;
    await route.fallback();
  });

  await page.goto("/dogs", { waitUntil: "domcontentloaded" });

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("We couldn't fully load the latest listings.");
  await expect(alert).toContainText("showing the valid listings that were already available");
  await expect(page.getByRole("heading", { name: "Maple" })).toBeVisible();
  await expect(page.getByText("1 available dogs")).toBeVisible();
  await expect(page.getByText("No dogs match those filters yet.")).toHaveCount(0);
  expect(failedCatalogRequests).toBeGreaterThan(0);

  retryRequested = true;
  await alert.getByRole("button", { name: "Retry loading listings" }).click();

  await expect.poll(() => retryCatalogRequestObserved).toBe(true);
  await expect(alert).toHaveCount(0);
  await expect(page.getByText("2 available dogs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "River" })).toBeVisible();
});

test.describe("incremental dog lists", () => {
  test.use({ scenario: { dogs: incrementalDogs } });

  test("browse filters the complete inventory while mounting cards in batches", async ({ page }) => {
    await page.goto("/dogs", { waitUntil: "domcontentloaded" });

    const cards = page.locator('main a[href^="/dog/"]');
    await expect(page.getByText("30 available dogs")).toBeVisible();
    await expect(cards).toHaveCount(24);
    await expect(page.getByText("Showing 24 of 30 dogs")).toBeVisible();

    await page.getByRole("button", { name: "Load more dogs" }).focus();
    await page.keyboard.press("Enter");
    await expect(cards).toHaveCount(30);
    await expect(page.getByText("Showing 30 of 30 dogs")).toBeVisible();

    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await page.getByLabel("State").selectOption("GA");
    await expect(page.getByText("1 available dogs")).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Georgia Last Dog" })).toBeVisible();
  });

  test("results mount the first batch and load the next ranked batch", async ({ page }) => {
    await page.goto("/quiz?session=e2e-incremental-results&mode=dealbreakers", {
      waitUntil: "domcontentloaded",
    });
    await answerEssentialQuiz(page);
    await page.getByRole("button", { name: "See my matches" }).click();

    const cards = page.locator('main a[href^="/dog/"]');
    await expect(page.getByText("Showing 24 of 30 matches")).toBeVisible();
    await expect(cards).toHaveCount(24);
    await page.getByRole("button", { name: "Load more matches" }).click();
    await expect(cards).toHaveCount(30);
    await expect(page.getByText("Showing 30 of 30 matches")).toBeVisible();
  });
});

test("essential quiz reaches deterministic results with valid percentages", async ({ page }) => {
  await page.goto("/quiz?session=e2e-quiz-session&mode=dealbreakers", {
    waitUntil: "domcontentloaded",
  });

  await answerEssentialQuiz(page);
  await page.getByRole("button", { name: "See my matches" }).click();

  await expect(page).toHaveURL(/\/results\?session=e2e-quiz-session/);
  await expect(
    page.getByRole("heading", { name: "Your best-fit dogs, ranked." })
  ).toBeVisible();

  await expectValidMatchPercentages(page);
});

test("anonymous quiz stays local across refresh, results, profile, edit, and reset", async ({
  page,
}) => {
  const sessionId = "e2e-local-quiz";
  await page.goto(`/quiz?session=${sessionId}&mode=dealbreakers`, {
    waitUntil: "domcontentloaded",
  });

  await answerEssentialQuiz(page);
  await expect(page.getByText(/couldn.t save your quiz/i)).toHaveCount(0);

  const storedAnswers = await page.evaluate((id) => {
    const sessionKey = `hoomanFinder.quizResponses.session.v1:${id}`;
    const localKey = `hoomanFinder.quizResponses.local.v1:${id}`;
    return {
      session: JSON.parse(window.sessionStorage.getItem(sessionKey)),
      local: JSON.parse(window.localStorage.getItem(localKey)),
    };
  }, sessionId);
  expect(storedAnswers.session).toEqual(storedAnswers.local);
  expect(storedAnswers.local).toMatchObject({
    size_preference: ["medium"],
    age_preference: ["adult"],
    kids_in_home: ["no_children"],
    pets_in_home: ["none"],
    potty_requirement: "flexible",
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("5/5 answered")).toBeVisible();
  for (const questionId of [
    "size_preference",
    "age_preference",
    "kids_in_home",
    "pets_in_home",
    "potty_requirement",
  ]) {
    await expect(
      page.locator(`[data-quiz-question="${questionId}"] [aria-pressed="true"]`)
    ).toHaveCount(1);
  }

  await page.getByRole("button", { name: "Deeper questions →" }).click();
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}&mode=refine`));
  await page
    .getByRole("button", { name: "Must be very dog-friendly", exact: true })
    .click();
  await expect(page.getByText(/couldn.t save your quiz/i)).toHaveCount(0);

  await page.getByRole("button", { name: "← Back to essentials" }).click();
  await expect(page.getByText("5/5 answered")).toBeVisible();
  await page.getByRole("button", { name: "See my matches" }).click();
  await expect(page.getByRole("heading", { name: "Your best-fit dogs, ranked." })).toBeVisible();

  const mapleCard = getResultCard(page, "Maple");
  const resultsScore = await getCardPercentage(mapleCard);
  await mapleCard.click();
  await expect(page).toHaveURL(new RegExp(`/dog/e2e-dog-maple\\?session=${sessionId}`));
  await expect(
    page.getByRole("button", {
      name: new RegExp(`${resultsScore} percent match`, "i"),
    })
  ).toBeVisible();

  await page.getByRole("link", { name: /back to matches/i }).click();
  await page.getByRole("button", { name: "Refine", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}&mode=refine`));
  await expect(
    page.locator('[data-quiz-question="dog_social_preference"] [aria-pressed="true"]')
  ).toHaveCount(1);

  await page.getByRole("button", { name: "← Back to essentials" }).click();
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}&mode=dealbreakers`));
  await expect(page.getByText("5/5 answered")).toBeVisible();

  await page.getByRole("button", { name: "Reset answers" }).click();
  await page.getByRole("alertdialog", { name: "Confirm reset answers" })
    .getByRole("button", { name: "Reset", exact: true })
    .click();

  await expect(page).not.toHaveURL(new RegExp(`session=${sessionId}(?:&|$)`));
  await expect(page.getByText("0/5 answered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Medium", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.getByText(/couldn.t save your quiz/i)).toHaveCount(0);
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
