import { dogFixtures } from "./fixtures/dogs.js";
import {
  answerEssentialQuiz,
  expect,
  expectDecodedImage,
  expectNoHorizontalOverflow,
  expectValidMatchPercentages,
  getResultCard,
  test,
} from "./support.js";

test.use({ scenario: { dogs: dogFixtures } });

test("mobile homepage to quiz to results stays usable without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /Find adoptable dogs that fit your real life/i })
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Take the Quiz", exact: true }).first().click();
  await expect(page).toHaveURL(/\/quiz$/);
  await expect(
    page.getByRole("heading", { name: "Find an adoptable dog that fits your lifestyle" })
  ).toBeVisible();

  const firstAnswer = page.getByRole("button", {
    name: "Any size / flexible",
    exact: true,
  });
  const seeMatches = page.getByRole("button", { name: "See My Matches" });
  await expect(firstAnswer).toBeVisible();
  await expect(firstAnswer).toBeEnabled();
  await expect(seeMatches).toBeVisible();
  await expect(seeMatches).toBeEnabled();
  await expectNoHorizontalOverflow(page);

  await answerEssentialQuiz(page);
  await expect(seeMatches).toBeVisible();
  await seeMatches.click();

  await expect(page).toHaveURL(/\/results\?session=/);
  await expect(
    page.getByRole("heading", { name: "Dogs that may fit your lifestyle." })
  ).toBeVisible();
  await expectValidMatchPercentages(page);
  await expect(page.getByRole("button", { name: "Refine your matches", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const editQuiz = page.getByRole("button", { name: "Edit Quiz", exact: true });
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await expect(editQuiz).toBeVisible();
  await expect(filters).toBeVisible();
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await filters.click();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await expectNoHorizontalOverflow(page);

  await editQuiz.click();
  await expect(page).toHaveURL(/mode=dealbreakers&edit=1/);
  await expect(page.getByRole("button", { name: "Update Matches", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back to results", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "← Back to results", exact: true }).click();

  const firstCard = getResultCard(page, "Maple");
  const secondCard = getResultCard(page, "River");
  await expect(firstCard).toBeVisible();
  await expect(secondCard).toBeVisible();
  await expect(firstCard).toContainText("Maple");
  await expect(firstCard.locator("a button, button a")).toHaveCount(0);

  const firstCardBox = await firstCard.boundingBox();
  const secondCardBox = await secondCard.boundingBox();
  expect(firstCardBox).not.toBeNull();
  expect(secondCardBox).not.toBeNull();
  expect(Math.abs(firstCardBox.x - secondCardBox.x)).toBeLessThan(1);
  expect(secondCardBox.y).toBeGreaterThan(firstCardBox.y + firstCardBox.height);

  const saveButton = firstCard.getByRole("button", { name: "Save dog" });
  await expect(saveButton).toBeVisible();
  await saveButton.focus();
  await expect(saveButton).toBeFocused();

  const profileLink = firstCard.getByRole("link", { name: "View profile for Maple" });
  await expect(profileLink).toBeVisible();
  await profileLink.focus();
  await expect(profileLink).toBeFocused();
  await expectDecodedImage(
    page.getByRole("img", { name: /Maple, adoptable/i }).first()
  );
});
