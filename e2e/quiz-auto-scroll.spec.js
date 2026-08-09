import { expect, test } from "./support.js";

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

test("single-select waits for Continue before scrolling and keeps its answer", async ({
  page,
}) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=scroll-single&mode=refine", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const answer = page
    .locator('[data-quiz-question="dog_social_preference"]')
    .getByRole("button", { name: /^Must be very dog-friendly/ });
  const continueButton = page
    .locator('[data-quiz-question="dog_social_preference"]')
    .getByRole("button", { name: "Continue", exact: true });

  await expect(continueButton).toBeDisabled();
  await answer.click();

  await expect(continueButton).toBeEnabled();
  expect(await scrollCalls(page)).toEqual([]);
  await continueButton.click();
  await expect
    .poll(() => scrollCalls(page))
    .toContainEqual({ behavior: "smooth", questionId: "first_time_owner" });
  await expect(answer).toHaveAttribute("aria-pressed", "true");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page
      .locator('[data-quiz-question="dog_social_preference"]')
      .getByRole("button", { name: /^Must be very dog-friendly/ })
  ).toHaveAttribute("aria-pressed", "true");
});

test("multi-select allows changes and exclusive answers before Continue scrolls", async ({
  page,
}) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=scroll-multi&mode=dealbreakers", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const sizeQuestion = page.locator('[data-quiz-question="size_preference"]');
  const small = sizeQuestion.getByRole("button", { name: /^Small/ });
  const medium = sizeQuestion.getByRole("button", { name: /^Medium/ });
  const continueButton = sizeQuestion.getByRole("button", {
    name: "Continue",
    exact: true,
  });

  await expect(continueButton).toBeDisabled();
  await small.click();
  await expect(continueButton).toBeEnabled();
  await medium.click();

  await expect(small).toHaveAttribute("aria-pressed", "true");
  await expect(medium).toHaveAttribute("aria-pressed", "true");
  expect(await scrollCalls(page)).toEqual([]);

  await sizeQuestion
    .getByRole("button", { name: "Any size / flexible", exact: true })
    .click();
  await expect(small).toHaveAttribute("aria-pressed", "false");
  await expect(medium).toHaveAttribute("aria-pressed", "false");
  await expect(
    sizeQuestion.getByRole("button", { name: /^Any size \/ flexible/ })
  ).toHaveAttribute("aria-pressed", "true");
  expect(await scrollCalls(page)).toEqual([]);

  await continueButton.click();
  await expect
    .poll(() => scrollCalls(page))
    .toContainEqual({ behavior: "smooth", questionId: "age_preference" });
});

test("text input does not scroll while typing and enables Continue when valid", async ({
  page,
}) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=scroll-text&mode=refine", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button", { name: /Care & Lifestyle/ }).click();
  const question = page.locator('[data-quiz-question="adoption_city"]');
  const input = question.getByPlaceholder("City, MI", { exact: true });
  const continueButton = question.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await clearScrollCalls(page);

  await input.fill("   ");
  await expect(continueButton).toBeDisabled();
  expect(await scrollCalls(page)).toEqual([]);

  await input.fill("Detroit, MI");
  await expect(continueButton).toBeEnabled();
  expect(await scrollCalls(page)).toEqual([]);

  await continueButton.click();
  await expect
    .poll(() => scrollCalls(page))
    .toContainEqual({ behavior: "smooth", questionId: "adoption_travel_radius" });
});

test("Back to essentials does not auto-scroll forward to a question", async ({ page }) => {
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=scroll-back&mode=refine", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  await page.getByRole("button", { name: "← Back to essentials" }).click();
  await expect(page).toHaveURL(/mode=dealbreakers/);
  await expect.poll(() => scrollCalls(page)).not.toEqual([]);

  expect((await scrollCalls(page)).filter((call) => call.questionId)).toEqual([]);
});

test("reduced-motion preference uses immediate scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trackScrollIntoView(page);
  await page.goto("/quiz?session=scroll-reduced&mode=refine", {
    waitUntil: "domcontentloaded",
  });
  await clearScrollCalls(page);

  const question = page.locator('[data-quiz-question="dog_social_preference"]');
  await question
    .getByRole("button", { name: "Must be very dog-friendly", exact: true })
    .click();
  expect(await scrollCalls(page)).toEqual([]);
  await question.getByRole("button", { name: "Continue", exact: true }).click();

  await expect
    .poll(() => scrollCalls(page))
    .toContainEqual({ behavior: "auto", questionId: "first_time_owner" });
});
