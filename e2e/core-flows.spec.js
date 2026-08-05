import {
  answerEssentialQuiz,
  expect,
  expectDecodedImage,
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
