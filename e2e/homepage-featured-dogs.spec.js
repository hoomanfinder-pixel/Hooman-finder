import { expect, test } from "./support.js";
import { dogFixtures } from "./fixtures/dogs.js";

test("homepage distinguishes featured-dog loading, results, empty inventory, and errors", async ({
  page,
}) => {
  let responseMode = "pending";
  let releasePendingResponse;
  let notifyRequestStarted;
  const requestStarted = new Promise((resolve) => {
    notifyRequestStarted = resolve;
  });

  await page.route("**/rest/v1/dogs*", async (route) => {
    if (responseMode === "pending") {
      notifyRequestStarted();
      await new Promise((resolve) => {
        releasePendingResponse = resolve;
      });
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dogFixtures),
      });
      return;
    }

    if (responseMode === "error") {
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Temporary catalog failure" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(responseMode === "empty" ? [] : dogFixtures),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toContainText("Loading featured dogs");
  await requestStarted;

  responseMode = "results";
  releasePendingResponse();
  await expect(page.getByRole("link", { name: /Maple, an adoptable dog/ }).first()).toBeVisible();
  await expect(page.getByText("New adoptable dogs are added regularly.")).toHaveCount(0);

  responseMode = "error";
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("We could not load dogs right now.")).toBeVisible();
  await expect(page.getByText("New adoptable dogs are added regularly.")).toHaveCount(0);

  responseMode = "empty";
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("New adoptable dogs are added regularly.")).toBeVisible();
  await expect(page.getByText("We could not load dogs right now.")).toHaveCount(0);
});
