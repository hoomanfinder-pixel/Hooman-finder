import {
  expect,
  expectNoHorizontalOverflow,
  test,
} from "./support.js";
import { dogFixtures } from "./fixtures/dogs.js";

const SAVED_KEY = "hooman_saved_dog_ids_v1";
const unavailableDog = {
  ...dogFixtures[1],
  id: "e2e-dog-unavailable",
  name: "Former Listing",
  external_id: "e2e-dog-unavailable",
  rescuegroups_id: "e2e-dog-unavailable",
  availability_status: "unavailable",
};

async function openSavedDogs(page, ids) {
  await page.addInitScript(({ key, values }) => {
    window.localStorage.setItem(key, JSON.stringify(values));
  }, { key: SAVED_KEY, values: ids });
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
}

test("saved dogs provides a clear empty shortlist state", async ({ page }) => {
  await openSavedDogs(page, []);

  await expect(page.getByRole("heading", { name: "Saved dogs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your shortlist starts here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse dogs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Take quiz" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("saved dogs renders public saves and removes a dog without leaving the page", async ({ page }) => {
  await openSavedDogs(page, [dogFixtures[0].id]);

  await expect(page.getByRole("heading", { name: "Maple" })).toBeVisible();
  await expect(page.getByText("1 saved dog", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Remove Maple from saved dogs" }).click();

  await expect(page.getByRole("heading", { name: "Your shortlist starts here." })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SAVED_KEY)).toBe("[]");
});

test.describe("saved dogs with unavailable listings", () => {
  test.use({ scenario: { dogs: [dogFixtures[0], unavailableDog] } });

  test("keeps available dogs visible and explains missing and non-public saves", async ({ page }) => {
    await openSavedDogs(page, [dogFixtures[0].id, unavailableDog.id, "e2e-dog-missing"]);

    await expect(page.getByRole("heading", { name: "Maple" })).toBeVisible();
    const notice = page.getByLabel("Some saved dogs aren’t available to show.");
    await expect(notice).toContainText("1 saved listing is no longer in the public catalog.");
    await expect(notice).toContainText("1 saved listing could not be found.");
    await expect(notice).toContainText("does not confirm that a dog was adopted");

    await notice.getByRole("button", { name: "Clear unavailable saves" }).click();

    await expect(notice).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Maple" })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SAVED_KEY))
      .toBe(JSON.stringify([dogFixtures[0].id]));
  });

  test("clears an entirely unavailable shortlist into the normal empty state", async ({ page }) => {
    await openSavedDogs(page, [unavailableDog.id, "e2e-dog-missing"]);

    const message = page.getByLabel("Your saved dogs aren’t available to show.");
    await expect(message).toContainText("1 saved listing is no longer in the public catalog.");
    await expect(message).toContainText("1 saved listing could not be found.");

    await message.getByRole("button", { name: "Clear unavailable saves" }).click();

    await expect(page.getByRole("heading", { name: "Your shortlist starts here." })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), SAVED_KEY)).toBe("[]");
  });
});
