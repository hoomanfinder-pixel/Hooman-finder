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
  await expect(page).toHaveURL(/\/quiz\?session=[^&]+&mode=dealbreakers/);
  await expect(page.getByRole("heading", { name: "Start your match" })).toBeVisible();

  const firstAnswer = page.getByRole("button", {
    name: "Any size / flexible",
    exact: true,
  });
  const seeMatches = page.getByRole("button", { name: "See my matches" });
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
    page.getByRole("heading", { name: "Your best-fit dogs, ranked." })
  ).toBeVisible();
  await expectValidMatchPercentages(page);
  await expectNoHorizontalOverflow(page);

  const firstCard = getResultCard(page, "Maple");
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("Maple");
  await expectDecodedImage(
    page.getByRole("img", { name: /Maple, adoptable/i }).first()
  );
});
