import { expect, expectDecodedImage, expectNoHorizontalOverflow, test } from "./support.js";
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

test("homepage uses only a dog's own valid photos and excludes cards with no working image", async ({
  page,
}) => {
  const dogsWithPhotoFailures = [
    {
      ...dogFixtures[0],
      id: "e2e-dog-no-working-photo",
      name: "No Working Photo",
      photo_url: "https://broken.example/primary.jpg",
      photo_urls: ["https://broken.example/secondary.jpg"],
    },
    {
      ...dogFixtures[1],
      id: "e2e-dog-own-alternate-photo",
      name: "Own Alternate Photo",
      photo_url: "https://broken.example/alternate-primary.jpg",
      photo_urls: ["https://images.example.org/e2e/own-alternate.svg"],
    },
  ];

  await page.route("https://broken.example/**", (route) => route.abort("failed"));
  await page.route("**/rest/v1/dogs*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dogsWithPhotoFailures),
    })
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("link", { name: "No Working Photo, an adoptable dog profile" })
  ).toHaveCount(0);
  const alternateCard = page.getByRole("link", {
    name: "Own Alternate Photo, an adoptable dog profile",
  });
  await expect(alternateCard).toBeVisible();
  await expectDecodedImage(
    alternateCard.getByRole("img", { name: "Own Alternate Photo, an adoptable dog" })
  );
});

test("mobile-first homepage stays readable, accessible, and overflow-free across target widths", async ({
  page,
}) => {
  const viewports = [
    { width: 320, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "Find a rescue dog who fits your life." })
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Hooman Finder" }).first()).toBeVisible();

    const primaryCta = page.getByRole("link", {
      name: "Take the Matching Quiz",
      exact: true,
    });
    await expect(primaryCta).toBeVisible();
    await expect(primaryCta).toHaveAttribute("href", "/quiz");
    await expect(
      page.getByRole("link", { name: "Browse adoptable dogs", exact: true })
    ).toHaveAttribute("href", "/dogs");
    const ctaBox = await primaryCta.boundingBox();
    expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(viewport.height);

    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("heading", { name: "Meet adoptable dogs." })).toBeVisible();

    if (viewport.width === 390) {
      const sectionOrder = await page.locator("main > section[aria-labelledby]").evaluateAll(
        (sections) => sections.map((section) => section.getAttribute("aria-labelledby"))
      );
      expect(sectionOrder).toEqual([
        "adoptable-dogs-title",
        "how-it-works-title",
        "why-lifestyle-title",
        "trust-title",
        "final-cta-title",
      ]);
    }

    const carousel = page.getByRole("region", { name: "Featured adoptable dogs" });
    await expect(carousel).toBeVisible();
    const firstDog = page.getByRole("link", { name: /Maple, an adoptable dog profile/ }).first();
    await expect(firstDog).toBeVisible();
    await firstDog.focus();
    await expect(firstDog).toBeFocused();
    await expect(firstDog).toHaveAttribute("href", /^\/dog\//);
    await expect(firstDog).not.toContainText(/fit score/i);
    const firstDogCard = firstDog.locator("..");
    const officialListing = firstDogCard.getByRole("link", { name: "View official listing" });
    await expect(officialListing).toHaveAttribute("target", "_blank");
    await expect(officialListing).toHaveAttribute("href", /^https:\/\//);
    await firstDog.press("Tab");
    await expect(officialListing).toBeFocused();

    if (viewport.width <= 430) {
      const dimensions = await carousel.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);

      if (viewport.width === 390) {
        const secondCard = page.locator("#homepage-dog-carousel > article").nth(1);
        const secondCardBox = await secondCard.boundingBox();
        expect(secondCardBox.x).toBeLessThan(viewport.width);
      }
    }

    await expect(
      page.getByRole("heading", { name: "Compatibility lives in the everyday details." })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your next chapter could have four paws." })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Clear about what we know." })).toBeVisible();
    await expect(page.getByRole("link", { name: "View all dogs", exact: true })).toHaveAttribute(
      "href",
      "/dogs"
    );
    await expect(page.getByRole("link", { name: "Find My Match", exact: true })).toHaveAttribute(
      "href",
      "/quiz"
    );
    await expectNoHorizontalOverflow(page);
  }
});

test("homepage content remains visible when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Find a rescue dog who fits your life." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meet adoptable dogs." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your next chapter could have four paws." })).toBeVisible();
});
