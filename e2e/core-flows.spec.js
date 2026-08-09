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
