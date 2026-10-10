// Run against the local Vite server. All API calls are intercepted with fixtures.
// PLAYWRIGHT_MODULE can point at the bundled desktop runtime's Playwright package.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { withSoftCornerDefaults } = require("../../backend/src/utils/cornerSettings");

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const token = `fixture.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.fixture`;
    await context.addInitScript((value) => sessionStorage.setItem("3dcasemakers_admin_token", value), token);
    const collections = [
      { id: "gold", name: "Gold Cases", slug: "gold-cases", isVisible: true, bannerDesktop: "/uploads/fixture.png" },
      { id: "gel", name: "Gold Gel Cases", slug: "gold-gel-cases", isVisible: true },
      { id: "custom", name: "Custom Designs", slug: "custom-designs", isVisible: true },
    ];
    const products = [{ id: "fixture", title: "Test Gold Design", collectionId: "gold", collectionIds: ["gold"], material: "Gold Case", price: 499, comparePrice: 999, images: [], models: [], tags: [], createdAt: "2026-01-01", stockStatus: "in_stock" }];
    const saved = [];
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data = [];
      if (path === "/api/settings") data = withSoftCornerDefaults({ themeButtonShape: "pill", uiSoftCards: false, uiBannerCorners: "hard", uiSoftRadius: 0 });
      if (path === "/api/collections") data = collections;
      if (path === "/api/banners") data = [{ id: "banner", active: true, imageUrl: "/uploads/fixture.png", title: "Test Banner", order: 0 }];
      if (path === "/api/products") {
        if (request.method() === "POST") {
          const payload = request.postDataJSON();
          saved.push(payload);
          products.push({ ...payload, id: `created-${saved.length}`, createdAt: new Date().toISOString() });
          data = { success: true };
        } else data = products;
      }
      if (path === "/api/upload") data = { url: "/uploads/fixture.png" };
      if (path.includes("unseen-count")) data = { count: 0 };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });
    await context.route("**/uploads/fixture.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=", "base64") }));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const origin = process.env.TEST_ORIGIN || "http://localhost:3010";
    const checkSquare = async (selector) => {
      const corners = await page.locator(selector).evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
      });
      assert.deepEqual(corners, ["0px", "0px", "0px", "0px"], selector);
    };
    const checkButtons = async (location) => {
      const controls = await page.locator('button, [role="button"], .glass-btn-primary, .glass-btn-grey, .glass-btn-gold, .btn-liquid-dark, .btn-liquid-light, .admin-pill-btn, a.button-link, a.rounded-full').evaluateAll((elements) =>
        elements.filter((el) => el.getClientRects().length).map((el) => {
          const style = getComputedStyle(el);
          return { label: el.textContent.trim() || el.getAttribute("aria-label") || el.tagName, corners: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius] };
        })
      );
      assert.ok(controls.length > 0, `No controls found at ${location}`);
      for (const control of controls) assert.deepEqual(control.corners, ["12px", "12px", "12px", "12px"], `${location}: ${control.label}`);
      console.log(`${location}: ${controls.length} visible controls have identical 12px corners.`);
    };
    await page.goto(`${origin}/admin/dashboard#Products`);
    const open = async () => {
      await page.getByRole("button", { name: "Add product", exact: true }).first().click();
      await page.getByRole("button", { name: /Gold Case Set/ }).click();
      const modal = page.locator(".admin-modal-solid");
      await modal.locator('input[placeholder="e.g. Premium TVK Gold Cases"]').waitFor();
      return modal;
    };
    let modal = await open();
    await checkButtons("Admin product form");
    const title = modal.locator('input[placeholder="e.g. Premium TVK Gold Cases"]');
    const gelTitle = modal.locator('input[placeholder="e.g. Premium TVK Gold Gel Cases"]');
    assert.equal(await title.inputValue(), "Gold Cases");
    assert.equal(await gelTitle.inputValue(), "Gold Gel Cases");
    const selects = modal.locator("select");
    const goldSelect = selects.filter({ has: page.locator('option[value="gold"]') }).nth(0);
    await goldSelect.selectOption("custom");
    assert.equal(await title.inputValue(), "Custom Designs");
    await title.fill("My Custom Design");
    await goldSelect.selectOption("gold");
    assert.equal(await title.inputValue(), "My Custom Design");
    await goldSelect.selectOption("custom");
    assert.equal(await title.inputValue(), "My Custom Design");
    const image = { name: "fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=", "base64") };
    for (const input of await modal.locator('input[type="file"][accept="image/*"]').all()) {
      await input.setInputFiles(image);
    }
    await modal.getByRole("button", { name: "Create 2 Products", exact: true }).click();
    await modal.waitFor({ state: "detached" });
    assert.equal(saved.length, 2);
    assert.equal(saved[0].title, "My Custom Design");
    assert.equal(saved[0].collectionId, "custom");
    assert.equal(saved[1].collectionId, "gel");
    await page.reload();
    modal = await open();
    assert.equal(await modal.locator('input[placeholder="e.g. Premium TVK Gold Cases"]').inputValue(), "Custom Designs");
    assert.equal(await modal.locator('input[placeholder="e.g. Premium TVK Gold Gel Cases"]').inputValue(), "Gold Gel Cases");
    await page.goto(origin);
    await page.locator(".product-card").first().waitFor();
    await page.waitForFunction(() => document.documentElement.classList.contains("sf-soft-cards"));
    const radius = await page.locator(".product-card").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    assert.equal(radius, "16px");
    const media = await page.locator(".product-card-media").first().evaluate((el) => ({ top: getComputedStyle(el).borderTopLeftRadius, bottom: getComputedStyle(el).borderBottomLeftRadius }));
    assert.deepEqual(media, { top: "16px", bottom: "0px" });
    await checkSquare(".banner-frame");
    await checkSquare(".site-footer");
    await checkSquare(".footer-links");
    assert.equal(await page.locator(".sf-search").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "12px");
    assert.equal(await page.locator(".product-card span.rounded-full").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "9999px");
    await checkButtons("Desktop storefront with legacy pill theme");
    await page.evaluate(async () => {
      const theme = await import("/src/utils/theme.ts");
      theme.applyTheme({ themeButtonShape: "square" });
      theme.applyStorefrontCustomization({ uiSoftRadius: 24, uiSoftButtons: false, uiBannerCorners: "rounded", uiCollectionBannerCorners: "rounded" });
    });
    await checkSquare(".banner-frame");
    await checkSquare(".footer-links");
    await checkButtons("Legacy square theme and changed card roundness");
    await page.evaluate(async () => {
      const theme = await import("/src/utils/theme.ts");
      theme.applyStorefrontCustomization({});
    });
    await page.screenshot({ path: process.env.TEST_SCREENSHOT || "corner-check.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await checkButtons("Mobile storefront");
    await checkSquare(".banner-frame");
    await checkSquare(".site-footer");
    await checkSquare(".footer-links");
    assert.equal(await page.locator(".product-card").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "16px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.goto(`${origin}/contact`);
    await page.locator('button[type="submit"]').waitFor();
    await checkButtons("Contact form");
    await page.goto(`${origin}/cart`);
    await page.locator("main a.glass-btn-primary").first().waitFor();
    await checkButtons("Cart");
    await page.goto(`${origin}/collections/gold-cases`);
    await page.locator(".collection-banner-frame").waitFor();
    await checkSquare(".collection-banner-frame");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await checkSquare(".collection-banner-frame");
    console.log("Browser checks passed: product defaults, uniform 12px buttons, desktop/mobile square banners and footer panels.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
