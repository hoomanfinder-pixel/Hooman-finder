import { test as base, expect } from "@playwright/test";
import { dogFixtures, shelterFixture } from "./fixtures/dogs.js";

async function mockSupabase(page, dogs) {
  const quizResponseRequests = [];

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split("/").pop();

    if (resource === "quiz_responses") {
      quizResponseRequests.push({ method: request.method(), url: request.url() });
      await route.abort("blockedbyclient");
      return;
    }

    if (resource === "shelters") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(shelterFixture),
      });
      return;
    }

    if (resource === "dogs") {
      const idFilter = url.searchParams.get("id");
      const dog = idFilter
        ? dogs.find(({ id }) => idFilter === `eq.${id}`)
        : null;
      const wantsSingle = request.headers()["accept"]?.includes("vnd.pgrst.object");

      await route.fulfill({
        status: dog || !idFilter ? 200 : 404,
        headers: {
          "content-type": "application/json",
          "content-range": `0-${Math.max(dogs.length - 1, 0)}/${dogs.length}`,
        },
        body: JSON.stringify(idFilter && wantsSingle ? dog || {} : dog ? [dog] : dogs),
      });
      return;
    }

    await route.abort("blockedbyclient");
  });

  return quizResponseRequests;
}

export const test = base.extend({
  scenario: [{ dogs: dogFixtures }, { option: true }],
  page: async ({ page, scenario }, use) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const quizResponseRequests = await mockSupabase(page, scenario.dogs);

    await use(page);

    expect(
      pageErrors.map((error) => error.message),
      "The page emitted an uncaught error"
    ).toEqual([]);
    expect(
      quizResponseRequests,
      "Anonymous flows must not send GET, POST, PATCH, or any other request to quiz_responses"
    ).toEqual([]);
  },
});

export { expect };

export async function expectDecodedImage(image) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => element.naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() => image.evaluate((element) => element.naturalHeight))
    .toBeGreaterThan(0);
}

export async function answerEssentialQuiz(
  page,
  {
    size = "Medium",
    age = "Adult (2 to 6)",
    children = "No children in the home",
    pets = "No other animals / not important",
    potty = "Doesn’t matter / I’m open to training",
  } = {}
) {
  for (const answer of [size, age, children, pets, potty]) {
    await page.getByRole("button", { name: answer, exact: true }).click();
  }

  await expect(page.getByText("5/5 answered")).toBeVisible();
}

export async function completeEssentialQuiz(page, sessionId, answers = {}) {
  await page.goto(`/quiz?session=${sessionId}&mode=dealbreakers`, {
    waitUntil: "domcontentloaded",
  });
  await answerEssentialQuiz(page, answers);
  await page.getByRole("button", { name: "See my matches" }).click();

  await expect(page).toHaveURL(new RegExp(`/results\\?session=${sessionId}`));
  await expect(
    page.getByRole("heading", { name: "Your best-fit dogs, ranked." })
  ).toBeVisible();
}

export function getResultCard(page, dogName) {
  return page
    .getByRole("link", { name: new RegExp(dogName, "i") })
    .filter({ hasText: /\d+% match/ })
    .first();
}

export async function getCardPercentage(card) {
  const labels = await card.getByText(/\d+% match/).allTextContents();
  expect(labels.length, "Expected a visible match percentage on the result card").toBeGreaterThan(0);
  return Number.parseInt(labels[0].match(/(\d+)% match/)?.[1] || "", 10);
}

export async function expectValidMatchPercentages(page) {
  const matchLabels = page.getByText(/\d+% match/);
  await expect(matchLabels.first()).toBeVisible();
  const labels = await matchLabels.allTextContents();
  expect(labels.length).toBeGreaterThan(0);

  for (const label of labels) {
    const percentage = Number.parseInt(label.match(/(\d+)% match/)?.[1] || "", 10);
    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);
  }
}

export async function expectNoBareProtocolLinks(page) {
  const malformedHrefs = await page.getByRole("link").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href")?.trim())
      .filter((href) => href === "http://" || href === "https://")
  );
  expect(malformedHrefs).toEqual([]);
}

export async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));

  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
}
