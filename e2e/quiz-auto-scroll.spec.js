import { answerEssentialQuiz, expect, test } from "./support.js";

async function trackScrollIntoView(page) {
  await page.addInitScript(() => {
    window.__quizScrollCalls = [];
    Element.prototype.scrollIntoView = function scrollIntoView(options) {
      window.__quizScrollCalls.push({
        behavior: options?.behavior,
        questionId: this.getAttribute("data-quiz-question"),
      });
    };
  });
}

async function clearScrollCalls(page) {
  await page.evaluate(() => {
    window.__quizScrollCalls = [];
  });
}

async function scrollCalls(page) {
  return page.evaluate(() => window.__quizScrollCalls);
}

test("essential progress is semantic and completion actions appear at the stage boundary", async ({
  page,
}) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=form-progress&mode=dealbreakers", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const progress = page.getByRole("progressbar", { name: "Essentials quiz progress" });
  await expect(progress).toHaveAttribute("aria-valuemin", "0");
  await expect(progress).toHaveAttribute("aria-valuemax", "5");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: "See My Matches" })).toHaveCount(0);
  await expect(page.getByText("Answer 5 more essential questions to view your matches.")).toBeVisible();

  await answerEssentialQuiz(page);

  await expect(progress).toHaveAttribute("aria-valuenow", "5");
  await expect(page.getByRole("button", { name: "See My Matches" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deeper questions →" })).toBeVisible();
  expect(await scrollCalls(page)).toEqual([]);
});

test("single-select stays in place, remains editable, and persists", async ({ page }) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=form-single&mode=refine", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const question = page.locator('[data-quiz-question="dog_social_preference"]');
  const firstAnswer = question.getByRole("button", {
    name: "Must be very dog-friendly",
    exact: true,
  });
  const secondAnswer = question.getByRole("button", {
    name: "Selective is okay",
    exact: true,
  });

  await firstAnswer.click();
  await expect(firstAnswer).toHaveAttribute("aria-pressed", "true");
  await secondAnswer.click();
  await expect(firstAnswer).toHaveAttribute("aria-pressed", "false");
  await expect(secondAnswer).toHaveAttribute("aria-pressed", "true");
  expect(await scrollCalls(page)).toEqual([]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page
      .locator('[data-quiz-question="dog_social_preference"]')
      .getByRole("button", { name: "Selective is okay", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
});

test("multi-select supports changes and exclusive answers without navigation controls", async ({
  page,
}) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=form-multi&mode=dealbreakers", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const question = page.locator('[data-quiz-question="size_preference"]');
  const small = question.getByRole("button", { name: "Small", exact: true });
  const medium = question.getByRole("button", { name: "Medium", exact: true });

  await small.click();
  await medium.click();
  await expect(small).toHaveAttribute("aria-pressed", "true");
  await expect(medium).toHaveAttribute("aria-pressed", "true");

  await question.getByRole("button", { name: "Any size / flexible", exact: true }).click();
  await expect(small).toHaveAttribute("aria-pressed", "false");
  await expect(medium).toHaveAttribute("aria-pressed", "false");
  await expect(
    question.getByRole("button", { name: "Any size / flexible", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(question.getByRole("button", { name: "Continue" })).toHaveCount(0);
  expect(await scrollCalls(page)).toEqual([]);
});

test("text input remains editable without moving the form", async ({ page }) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=form-text&mode=refine", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button", { name: /Care & Lifestyle/ }).click();
  const input = page
    .locator('[data-quiz-question="adoption_city"]')
    .getByPlaceholder("City, MI", { exact: true });
  await expect(input).toBeVisible();
  await page.waitForTimeout(50);
  await clearScrollCalls(page);

  await input.fill("Detroit, MI");
  await expect(input).toHaveValue("Detroit, MI");
  expect(await scrollCalls(page)).toEqual([]);
});

test("Back to essentials changes stages without auto-scrolling to a question", async ({ page }) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=form-back&mode=refine", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  await page.getByRole("button", { name: "← Back to essentials" }).click();
  await expect(page).toHaveURL(/mode=dealbreakers/);
  await expect.poll(() => scrollCalls(page)).not.toEqual([]);
  expect((await scrollCalls(page)).filter((call) => call.questionId)).toEqual([]);
});

test("reduced-motion preference disables selection animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=form-reduced&mode=refine", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const answer = page
    .locator('[data-quiz-question="dog_social_preference"]')
    .getByRole("button", { name: "Must be very dog-friendly", exact: true });
  await answer.click();
  await expect
    .poll(() => answer.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
  expect(await scrollCalls(page)).toEqual([]);
});
