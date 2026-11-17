import { premiumResultCardDogs } from "./fixtures/dogs.js";
import { expect, expectNoHorizontalOverflow, getResultCard, test } from "./support.js";

async function openResultsWithAnswers(page, sessionId, answersById) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ id, answers }) => {
      window.sessionStorage.setItem(
        `hoomanFinder.quizResponses.session.v1:${id}`,
        JSON.stringify(answers)
      );
      window.localStorage.setItem(
        `hoomanFinder.quizResponses.local.v1:${id}`,
        JSON.stringify(answers)
      );
      window.localStorage.setItem("hoomanFinderActiveQuizSession", id);
    },
    { id: sessionId, answers: answersById }
  );
  await page.goto(`/results?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Dogs that may fit your lifestyle." })).toBeVisible();
}

test.use({ scenario: { dogs: premiumResultCardDogs } });

test("premium cards qualify scores and preserve evidence, cautions, order, and profile routes", async ({
  page,
}) => {
  await openResultsWithAnswers(page, "e2e-premium-result-cards", {
    size_preference: ["medium"],
    age_preference: ["adult"],
    children_in_home: ["under_3"],
    pets_in_home: ["dogs"],
    potty_requirement: "must_be_trained",
    housing_type: "apartment",
    yard: "no",
  });

  await expect(page.getByRole("article", { name: /match result/i })).toHaveCount(3);
  const cardNames = await page
    .getByRole("article", { name: /match result/i })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  expect(cardNames).toEqual([
    "Lumi match result",
    "Sage match result",
    "Cedar match result",
  ]);

  const lumi = getResultCard(page, "Lumi");
  const sage = getResultCard(page, "Sage");
  const cedar = getResultCard(page, "Cedar");

  await expect(lumi).toContainText("Estimated");
  await expect(sage).toContainText("Limited listing information");
  await expect(cedar.getByText("Important compatibility caution")).toBeVisible();
  await expect(cedar.getByRole("link", { name: "View profile for Cedar" })).toHaveAttribute(
    "href",
    /\/dog\/e2e-premium-caution/
  );
  await expect(page.getByText("This is not a complete compatibility assessment.").first()).toBeVisible();
});

test("save control is dog-specific, stateful, announced, and keeps the storage format", async ({
  page,
}) => {
  await openResultsWithAnswers(page, "e2e-premium-save", {
    size_preference: ["medium"],
    age_preference: ["adult"],
  });

  const lumi = getResultCard(page, "Lumi");
  const save = lumi.getByRole("button", { name: "Save Lumi" });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(lumi.getByRole("button", { name: "Remove Lumi from saved dogs" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(lumi.getByRole("status")).toContainText("Lumi saved to your dogs.");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("hooman_saved_dog_ids_v1")))
    .toBe('["e2e-premium-estimated"]');
});

for (const [label, viewport] of [
  ["320px mobile", { width: 320, height: 760 }],
  ["390px mobile", { width: 390, height: 844 }],
  ["tablet", { width: 768, height: 1024 }],
  ["desktop", { width: 1440, height: 900 }],
]) {
  test(`${label} cards avoid horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openResultsWithAnswers(page, `e2e-premium-${viewport.width}`, {
      size_preference: ["medium"],
      age_preference: ["adult"],
      children_in_home: ["under_3"],
      pets_in_home: ["dogs"],
      potty_requirement: "must_be_trained",
      housing_type: "apartment",
      yard: "no",
    });
    await expectNoHorizontalOverflow(page);
    await expect(getResultCard(page, "Lumi")).toBeVisible();
  });
}
