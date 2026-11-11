import {
  aloneTimeDogs,
  catCompatibilityDogs,
  childCompatibilityDogs,
  dogCompatibilityDogs,
  deeperQuizDogs,
  evidenceCoverageDogs,
  olderChildrenEditDogs,
  sizePreferenceDogs,
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
  openResultProfile,
  test,
} from "./support.js";

async function expectResultImagesDecoded(page, dogs) {
  for (const dog of dogs) {
    await expectDecodedImage(
      page.getByRole("img", { name: new RegExp(`${dog.name}, adoptable`, "i") }).first()
    );
  }
}

async function openResultsWithAnswers(page, sessionId, answersById) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ id, answers }) => {
      const sessionKey = `hoomanFinder.quizResponses.session.v1:${id}`;
      const localKey = `hoomanFinder.quizResponses.local.v1:${id}`;
      window.sessionStorage.setItem(sessionKey, JSON.stringify(answers));
      window.localStorage.setItem(localKey, JSON.stringify(answers));
      window.sessionStorage.setItem("hoomanFinderActiveQuizSession", id);
      window.localStorage.setItem("hoomanFinderActiveQuizSession", id);
    },
    { id: sessionId, answers: answersById }
  );
  await page.goto(`/results?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Dogs that may fit your lifestyle." })).toBeVisible();
}

async function expectConfirmedConflictExcluded(page, incompatibleName, unknownName) {
  const incompatibleCard = getResultCard(page, incompatibleName);
  const unknownCard = getResultCard(page, unknownName);

  await expect(incompatibleCard).toHaveCount(0);
  await expect(unknownCard).toBeVisible();
  await expect(unknownCard.getByRole("alert")).toHaveCount(0);

  return unknownCard;
}

test.describe("young children compatibility safety", () => {
  test.use({ scenario: { dogs: childCompatibilityDogs } });

  test("confirmed child incompatibility is hard-excluded while unknown remains eligible", async ({
    page,
  }) => {
    await completeEssentialQuiz(page, "e2e-young-children", {
      children: "Under 3",
    });

    await expectValidMatchPercentages(page);
    const unknownCard = await expectConfirmedConflictExcluded(
      page,
      "Juniper",
      "Scout"
    );

    await expectDecodedImage(page.getByRole("img", { name: /Scout, adoptable/i }).first());
    await openResultProfile(unknownCard);
    await expect(page).toHaveURL(/\/dog\/e2e-child-unknown/);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page
      .getByRole("button", { name: /Open fit score details\. Fit score: \d+\/100/i })
      .click();
    const matchDialog = page.getByRole("dialog", { name: "Why this dog may fit" });
    await expect(matchDialog).toBeVisible();
    await expect(matchDialog.getByRole("alert")).toHaveCount(0);
    await matchDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expectNoBareProtocolLinks(page);
    await expect(page.getByRole("link", { name: "View official listing" })).toHaveAttribute(
      "href",
      /greatlakesdogrescue\.example\.org\/dogs\/e2e-child-unknown\/apply/
    );
  });

  test("generic child-positive evidence stays eligible but does not confirm under-3 compatibility", async ({
    page,
  }) => {
    await completeEssentialQuiz(page, "e2e-under-three-general-positive", {
      children: "Under 3",
    });

    const generalCard = getResultCard(page, "Harper");
    await expect(generalCard).toBeVisible();
    await expect(generalCard).toContainText("3 scored preferences · Limited information");
    await expect(generalCard).not.toContainText(/supports a home with children/i);
    await expect(
      generalCard.getByLabel(/Fit score: \d+\/100.*Based on 3 scored preferences/i)
    ).toBeVisible();

    await openResultProfile(generalCard);
    await expect(page).toHaveURL(/\/dog\/e2e-child-general-positive/);
    await expect(page.getByText("General shelter fact; child ages are not specified.")).toBeVisible();
    await expect(page.getByText(/supports a home with children/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Open fit score details.*Fit score: \d+\/100.*Based on 3 scored preferences/i,
      })
    ).toBeVisible();
  });
});

test.describe("editing child ages preserves older-children-only exclusions", () => {
  test.use({ scenario: { dogs: olderChildrenEditDogs } });

  test("updating a mixed-age household removes an older-children-only dog", async ({ page }) => {
    const sessionId = "e2e-edit-child-safety";
    await completeEssentialQuiz(page, sessionId, {
      children: "13+",
    });

    await expect(getResultCard(page, "Older Child Fit")).toBeVisible();
    await expect(getResultCard(page, "Family Friendly")).toBeVisible();

    await page.getByRole("button", { name: "Edit Quiz", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`session=${sessionId}&mode=dealbreakers&edit=1`));
    await page.getByRole("button", { name: "Under 3", exact: true }).click();
    await page.getByRole("button", { name: "3 to 5", exact: true }).click();
    await page.getByRole("button", { name: "Update Matches", exact: true }).click();

    await expect(getResultCard(page, "Older Child Fit")).toHaveCount(0);
    await expect(getResultCard(page, "Family Friendly")).toBeVisible();

    const savedChildAges = await page.evaluate((id) => JSON.parse(
      window.localStorage.getItem(`hoomanFinder.quizResponses.local.v1:${id}`)
    ).kids_in_home, sessionId);
    expect(savedChildAges).toEqual(["13_plus", "under_3", "3_5"]);
  });
});

test.describe("cat compatibility safety", () => {
  test.use({ scenario: { dogs: catCompatibilityDogs } });

  test("confirmed cat incompatibility is hard-excluded while unknown remains eligible", async ({ page }) => {
    await completeEssentialQuiz(page, "e2e-cat-home", { pets: "Cats" });

    await expectValidMatchPercentages(page);
    await expectConfirmedConflictExcluded(page, "Clover", "Wren");
    await expectDecodedImage(page.getByRole("img", { name: /Wren, adoptable/i }).first());
    await expectNoBareProtocolLinks(page);
  });
});

test.describe("dog compatibility safety", () => {
  test.use({ scenario: { dogs: dogCompatibilityDogs } });

  test("confirmed dog incompatibility is hard-excluded while unknown remains eligible", async ({ page }) => {
    await completeEssentialQuiz(page, "e2e-dog-home", { pets: "Other dogs" });

    await expectValidMatchPercentages(page);
    await expectConfirmedConflictExcluded(page, "Piper", "Marlow");
    await expectDecodedImage(page.getByRole("img", { name: /Marlow, adoptable/i }).first());
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
    await page.getByRole("button", { name: "See My Matches" }).click();

    await expect(page).toHaveURL(/\/results\?session=e2e-alone-time/);
    await expectValidMatchPercentages(page);
    await expectResultImagesDecoded(page, aloneTimeDogs);

    const fittingCard = getResultCard(page, "Harbor");
    const lowerSuitabilityCard = getResultCard(page, "Dash");
    const fittingScore = await getCardPercentage(fittingCard);
    const lowerSuitabilityScore = await getCardPercentage(lowerSuitabilityCard);

    expect(fittingScore).toBeGreaterThan(lowerSuitabilityScore);
    await expect(fittingCard).toContainText("Top potential fit");
    await expect(lowerSuitabilityCard).toContainText("#2 potential fit");
    await expect(lowerSuitabilityCard).toContainText(
      "Shelter-listed alone-time capacity may not fit your weekday routine"
    );
    await expect(page.getByText("Important compatibility caution")).toHaveCount(0);

    await openResultProfile(fittingCard);
    await expect(page).toHaveURL(/\/dog\/e2e-alone-fit/);
    await expect(page.getByRole("heading", { name: "Harbor", exact: true })).toBeVisible();
    await expect(
      page.getByText("Shelter-listed alone-time capacity fits your weekday routine", {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoBareProtocolLinks(page);
  });
});

test.describe("match evidence coverage", () => {
  test.use({ scenario: { dogs: evidenceCoverageDogs } });

  test("coverage prevents sparse perfect evidence from displaying a 100 fit score", async ({
    page,
  }) => {
    await completeEssentialQuiz(page, "e2e-evidence-coverage", {
      size: "Any size / flexible",
      age: "Any age / flexible",
      children: "Under 3",
      pets: "Other dogs",
      potty: "Must be potty trained",
    });

    const richCard = getResultCard(page, "Atlas");
    const sparseCard = getResultCard(page, "Sapphire");
    await expect(richCard).toContainText("Fit score: 87/100");
    await expect(richCard).toContainText("3 scored preferences · Limited information");
    await expect(richCard).toContainText("Based on 3 scored preferences");
    await expect(richCard).not.toContainText(/supports a home with children/i);
    await expect(sparseCard).toContainText("Fit score: 73/100 · Limited listing information");

    await openResultProfile(sparseCard);
    await expect(page).toHaveURL(/\/dog\/e2e-coverage-sparse/);
    await expect(
      page.getByRole("button", {
        name: "Open fit score details. Fit score: 73/100. Based on 3 scored preferences. Limited listing information",
      })
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Open fit score details. Fit score: 73/100. Based on 3 scored preferences. Limited listing information",
      })
      .click();
    await expect(page.getByRole("dialog", { name: "Why this dog may fit" })).toContainText(
      "Limited listing information"
    );
  });
});

test.describe("deeper quiz scoring", () => {
  test.use({ scenario: { dogs: deeperQuizDogs } });

  test("exact ties are disclosed and refinement preserves the current session", async ({ page }) => {
    const sessionId = "e2e-honest-ties";
    await openResultsWithAnswers(page, sessionId, {
      size_preference: ["medium"],
      age_preference: ["adult"],
      potty_requirement: "flexible",
    });

    await expect(page.getByText("Based on 2 scored preferences: size and age.")).toBeVisible();
    await expect(page.getByText(/2 dogs share the leading fit score/)).toBeVisible();
    await expect(getResultCard(page, "Quiet Homebody")).toContainText("Tied fit score");
    await expect(getResultCard(page, "Quiet Homebody")).toContainText(
      "2 scored preferences · Information available"
    );
    await expect(
      getResultCard(page, "Quiet Homebody").getByLabel(
        /Fit score: 100\/100.*Based on 2 scored preferences/i
      )
    ).toBeVisible();
    await expect(getResultCard(page, "Active Vocal")).toContainText("Tied fit score");
    await expect(page.getByText("Top potential fit")).toHaveCount(0);
    await expect(page.getByText("#2 potential fit")).toHaveCount(0);

    await page.getByRole("button", { name: "Refine your matches", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`session=${sessionId}&mode=refine&edit=1`));
    await page.getByRole("button", { name: /Care & Lifestyle/ }).click();

    const unscoredQuestion = page.locator('[data-quiz-question="weekend_activity_style"]');
    await expect(unscoredQuestion).toContainText(
      "Saved for context · does not currently affect fit scores or ranking."
    );
    await page.getByRole("button", { name: "15 to 30 minutes/day", exact: true }).click();
    await page.getByRole("button", { name: "Update Matches", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/results\\?session=${sessionId}`));
    await expect(
      page.getByText("Based on 3 scored preferences: size, age, and daily exercise.")
    ).toBeVisible();
    const savedAnswers = await page.evaluate((id) => JSON.parse(
      window.localStorage.getItem(`hoomanFinder.quizResponses.local.v1:${id}`)
    ), sessionId);
    expect(savedAnswers.size_preference).toEqual(["medium"]);
    expect(savedAnswers.age_preference).toEqual(["adult"]);
    expect(savedAnswers.daily_walk_minutes).toBe("15_30");

    await openResultProfile(getResultCard(page, "Quiet Homebody"));
    await expect(
      page.getByText("Based on 3 scored preferences: size, age, and daily exercise.")
    ).toBeVisible();
    await expect(page.getByText("Information is available for all scored preferences.")).toBeVisible();
  });

  test("supported deeper answers change ranking and explanations use scored traits", async ({ page }) => {
    await openResultsWithAnswers(page, "e2e-deeper-ranking", {
      size_preference: ["medium"],
      age_preference: ["adult"],
      housing_type: "apartment",
      separation_anxiety_willingness: "no",
      training_commitment_level: "low",
      noise_preference: "prefer_quiet",
      daily_walk_minutes: "15_30",
      weekend_activity_style: "homebody",
      energy_preference: "low",
    });

    const quietCard = getResultCard(page, "Quiet Homebody");
    const activeCard = getResultCard(page, "Active Vocal");
    await expect(quietCard).toContainText("Top potential fit");
    await expect(activeCard).toContainText("#2 potential fit");
    expect(await getCardPercentage(quietCard)).toBeGreaterThan(await getCardPercentage(activeCard));

    await openResultProfile(quietCard);
    await expect(page).toHaveURL(/\/dog\/e2e-deep-quiet/);
    await expect(page.getByText("Shelter-listed exercise level fits your daily walking capacity")).toBeVisible();
  });
});

test.describe("prominent fit-score scope presentation", () => {
  test.use({ scenario: { dogs: deeperQuizDogs } });

  test("keeps score scope visible and accessible on mobile and desktop", async ({ page }) => {
    for (const [label, viewport] of [
      ["mobile", { width: 390, height: 844 }],
      ["desktop", { width: 1440, height: 900 }],
    ]) {
      await page.setViewportSize(viewport);
      await openResultsWithAnswers(page, `e2e-score-scope-${label}`, {
        size_preference: ["medium"],
        age_preference: ["adult"],
      });

      const card = getResultCard(page, "Quiet Homebody");
      const cardScore = card.getByLabel(
        /Fit score: 100\/100.*Based on 2 scored preferences/i
      );
      await expect(cardScore).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(viewport.width);

      await openResultProfile(card);
      await expect(
        page.getByRole("button", {
          name: /Open fit score details.*Fit score: 100\/100.*Based on 2 scored preferences/i,
        })
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(viewport.width);
    }
  });
});

test.describe("quiz size preferences constrain eligible results", () => {
  test.use({ scenario: { dogs: sizePreferenceDogs } });

  test("extra large selection keeps only confirmed extra large and unknown sizes, without an overall score", async ({ page }) => {
    for (const [label, viewport] of [
      ["mobile", { width: 390, height: 844 }],
      ["desktop", { width: 1440, height: 900 }],
    ]) {
      await page.setViewportSize(viewport);
      await openResultsWithAnswers(page, `e2e-only-extra-large-${label}`, {
        size_preference: ["extra_large"],
      });
      const xlarge = page.getByRole("article", { name: "Extra Large Pup match result", exact: true });
      const unknown = page.getByRole("article", { name: "Size Unknown Pup match result", exact: true });
      await expect(xlarge).toBeVisible();
      await expect(unknown).toBeVisible();
      for (const name of ["Small Pup", "Medium Pup", "Large Pup"]) {
        await expect(page.getByRole("article", { name: `${name} match result`, exact: true })).toHaveCount(0);
      }
      await expect(xlarge.getByLabel(/Size match · X-Large/)).toBeVisible();
      await expect(unknown.getByLabel(/Size not listed · Unverified/)).toBeVisible();
      await expect(xlarge).not.toContainText(/\d+\/100/);
      await expect(unknown).not.toContainText(/\d+\/100/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("multiple selected sizes and manual size filter intersect without admitting confirmed mismatches", async ({ page }) => {
    await openResultsWithAnswers(page, "e2e-size-combination", {
      size_preference: ["large", "extra_large"],
    });
    await expect(page.getByRole("article", { name: "Large Pup match result", exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "Extra Large Pup match result", exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "Small Pup match result", exact: true })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Medium Pup match result", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Size", exact: true }).selectOption("Large");
    await expect(page.getByRole("article", { name: "Large Pup match result", exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "Extra Large Pup match result", exact: true })).toHaveCount(0);
  });
});
