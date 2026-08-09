import {
  aloneTimeDogs,
  catCompatibilityDogs,
  childCompatibilityDogs,
  dogCompatibilityDogs,
  evidenceCoverageDogs,
} from "./fixtures/dogs.js";
import {
  answerEssentialQuiz,
  completeEssentialQuiz,
  expect,
  expectDecodedImage,
  expectNoBareProtocolLinks,
  expectValidMatchPercentages,
  getCardPercentage,
  getResultCard,
  test,
} from "./support.js";

const childWarning =
  "This dog is listed as not compatible with children, but your household includes children.";
const catWarning =
  "This dog is listed as not compatible with cats, but your home includes a cat.";
const dogWarning =
  "This dog is listed as not compatible with other dogs, but your home includes a dog.";

async function expectResultImagesDecoded(page, dogs) {
  for (const dog of dogs) {
    await expectDecodedImage(
      page.getByRole("img", { name: new RegExp(`${dog.name}, adoptable`, "i") }).first()
    );
  }
}

async function expectExplicitConflictOnly(page, incompatibleName, unknownName, warning) {
  const incompatibleCard = getResultCard(page, incompatibleName);
  const unknownCard = getResultCard(page, unknownName);

  await expect(incompatibleCard).toBeVisible();
  await expect(unknownCard).toBeVisible();
  const visibleAlert = incompatibleCard.getByRole("alert");
  await expect(visibleAlert).toBeVisible();
  await expect(visibleAlert.getByLabel(warning)).toBeVisible();
  await expect(unknownCard.getByRole("alert")).toHaveCount(0);

  const incompatibleScore = await getCardPercentage(incompatibleCard);
  const unknownScore = await getCardPercentage(unknownCard);
  expect(incompatibleScore).toBeLessThanOrEqual(49);
  expect(unknownScore).toBeGreaterThan(49);

  return { incompatibleCard, unknownCard, incompatibleScore, unknownScore };
}

test.describe("young children compatibility safety", () => {
  test.use({ scenario: { dogs: childCompatibilityDogs } });

  test("explicit child incompatibility is capped and warned across results and profile", async ({
    page,
  }) => {
    await completeEssentialQuiz(page, "e2e-young-children", {
      children: "Under 3",
    });

    await expectValidMatchPercentages(page);
    await expectResultImagesDecoded(page, childCompatibilityDogs);
    const { incompatibleCard, unknownCard } = await expectExplicitConflictOnly(
      page,
      "Juniper",
      "Scout",
      childWarning
    );

    await incompatibleCard.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dog\/e2e-child-incompatible/);
    await expect(page.getByRole("alert").first()).toContainText(childWarning);
    await expectDecodedImage(
      page.getByRole("img", { name: /Juniper, adoptable/i }).first()
    );

    await page
      .getByRole("button", { name: /Open why you matched\. \d+ percent match/i })
      .click();
    const matchDialog = page.getByRole("dialog", { name: "Why you matched" });
    await expect(matchDialog).toBeVisible();
    await expect(matchDialog.getByRole("alert")).toContainText(childWarning);
    await matchDialog.getByRole("button", { name: "Close", exact: true }).click();

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Your best-fit dogs, ranked." })
    ).toBeVisible();
    await unknownCard.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dog\/e2e-child-unknown/);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectDecodedImage(page.getByRole("img", { name: /Scout, adoptable/i }).first());
    await expectNoBareProtocolLinks(page);
    await expect(
      page.getByRole("link", { name: "Application link unavailable" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("cat compatibility safety", () => {
  test.use({ scenario: { dogs: catCompatibilityDogs } });

  test("only confirmed cat incompatibility creates a warning and score cap", async ({ page }) => {
    await completeEssentialQuiz(page, "e2e-cat-home", { pets: "Cats" });

    await expectValidMatchPercentages(page);
    await expectResultImagesDecoded(page, catCompatibilityDogs);
    await expectExplicitConflictOnly(page, "Clover", "Wren", catWarning);
    await expectNoBareProtocolLinks(page);
  });
});

test.describe("dog compatibility safety", () => {
  test.use({ scenario: { dogs: dogCompatibilityDogs } });

  test("only confirmed dog incompatibility creates a warning and score cap", async ({ page }) => {
    await completeEssentialQuiz(page, "e2e-dog-home", { pets: "Other dogs" });

    await expectValidMatchPercentages(page);
    await expectResultImagesDecoded(page, dogCompatibilityDogs);
    await expectExplicitConflictOnly(page, "Piper", "Marlow", dogWarning);
    await expectNoBareProtocolLinks(page);
  });
});

test.describe("alone-time preference ranking", () => {
  test.use({ scenario: { dogs: aloneTimeDogs } });

  test("longer alone-time need lowers suitability without inventing a hard warning", async ({
    page,
  }) => {
    await page.goto("/quiz?session=e2e-alone-time&mode=dealbreakers", {
      waitUntil: "domcontentloaded",
    });
    await answerEssentialQuiz(page);
    await page.getByRole("button", { name: "Deeper questions →" }).click();
    await expect(page).toHaveURL(/mode=refine/);
    await page.getByRole("button", { name: /Care & Lifestyle/ }).click();
    await page.getByRole("button", { name: "8+ hours", exact: true }).click();
    await page.getByRole("button", { name: "See my matches" }).click();

    await expect(page).toHaveURL(/\/results\?session=e2e-alone-time/);
    await expectValidMatchPercentages(page);
    await expectResultImagesDecoded(page, aloneTimeDogs);

    const fittingCard = getResultCard(page, "Harbor");
    const lowerSuitabilityCard = getResultCard(page, "Dash");
    const fittingScore = await getCardPercentage(fittingCard);
    const lowerSuitabilityScore = await getCardPercentage(lowerSuitabilityCard);

    expect(fittingScore).toBeGreaterThan(lowerSuitabilityScore);
    await expect(fittingCard).toContainText("Top match");
    await expect(lowerSuitabilityCard).toContainText("#2 match");
    await expect(page.getByText("Important compatibility caution")).toHaveCount(0);

    await fittingCard.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dog\/e2e-alone-fit/);
    await expect(
      page.getByText("Listed alone-time capacity fits your weekday routine")
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoBareProtocolLinks(page);
  });
});

test.describe("match evidence coverage", () => {
  test.use({ scenario: { dogs: evidenceCoverageDogs } });

  test("equal high scores distinguish sparse from data-rich evidence in results and profile", async ({
    page,
  }) => {
    await completeEssentialQuiz(page, "e2e-evidence-coverage", {
      children: "Under 3",
      pets: "Other dogs",
      potty: "Must be potty trained",
    });

    const richCard = getResultCard(page, "Atlas");
    const sparseCard = getResultCard(page, "Sapphire");
    await expect(richCard).toContainText("100% match");
    await expect(richCard).not.toContainText("Limited info");
    await expect(sparseCard).toContainText("Limited info · 100% match");

    await sparseCard.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dog\/e2e-coverage-sparse/);
    await expect(
      page.getByRole("button", {
        name: "Open why you matched. Limited information. 100 percent match",
      })
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Open why you matched. Limited information. 100 percent match",
      })
      .click();
    await expect(page.getByRole("dialog", { name: "Why you matched" })).toContainText(
      "Limited information"
    );
  });
});
