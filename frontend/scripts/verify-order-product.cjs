// Local browser regression checks. APIs are mocked; no production requests or orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const output = path.resolve(__dirname, '../../verification/browser-focused');
fs.mkdirSync(output, { recursive: true });
const photo = fs.readFileSync(path.resolve(__dirname, '../public/og-image.jpg'));
const product = { id: 'p-none', title: 'Personalised Custom Acrylic Phone Case', description: 'Case with a clear print.', price: 499, comparePrice: 999, material: 'Acrylic Case', stockStatus: 'in_stock', images: [base + '/og-image.jpg'], brand: 'Apple', models: ['iPhone 15'], tags: ['flower'], collectionId: 'c1', collectionIds: ['c1'], customization: { sets: [] } };
const optionalSets = Array.from({ length: 3 }, () => ({ image: true, text: true, imageRequired: false, textRequired: false }));
const products = [product, { ...product, id: 'p-out', stockStatus: 'out_of_stock' }, { ...product, id: 'p-photo', customization: { sets: optionalSets } }, { ...product, id: 'p-next', customization: { sets: optionalSets } }, { ...product, id: 'p-gel', material: 'Gold Gel Case', price: 599, comparePrice: 999 }, { ...product, id: 'p-global', brand: undefined, models: [] }];
const settings = { brandModels: { Apple: ['iPhone 15'] }, variantGroups: [], announcementBarEnabled: true, announcementMessages: ['Secure Online Payments'], offers: [{ id: 'o1', badgeText: 'Buy 2 custom cases and get ₹100 OFF for this weekend', minQty: 2, discountAmount: 100, enabled: true, endsAt: new Date(Date.now() + 86400000).toISOString() }], whatsappNumber: '6369418105' };
const order = { id: 'STC0001', customerName: 'Test Customer', items: [{ product, quantity: 1, selectedModel: 'Apple - iPhone 15', customName: 'Hari', customImage: '/uploads/customer.jpg' }], subtotal: 499, shipping: 0, total: 499, paymentMethod: 'online', paymentStatus: 'pending', status: 'processing', hasCustomizedItem: true, previewRequested: false, trackingId: 'AWB-TEST', createdAt: '2026-10-04T07:00:00+05:30' };
const checks = [], requests = [], errors = [];
let uploadCount = 0, failProduct = false, failReviews = false, failPreview = false, failCollections = false, failCatalog = false;

(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    await context.route('https://wa.me/**', route => route.abort());
    await context.route('**/api/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      const method = request.method();
      let body = {}; try { body = request.postDataJSON() || {}; } catch {}
      requests.push({ pathname, method, body, access: request.headers()['x-order-access'] });
      let status = 200, result = {};
      if (method === 'OPTIONS') result = {};
      else if (pathname === '/api/settings') result = settings;
      else if (pathname === '/api/collections') {
        result = [{ id: 'c1', name: 'Cases', slug: 'cases', isVisible: true }];
        if (failCollections) { status = 503; result = { error: 'Collection service unavailable' }; }
      } else if (pathname === '/api/products') {
        result = products;
        if (failCatalog) { status = 503; result = { error: 'Catalog service unavailable' }; }
      }
      else if (pathname.startsWith('/api/products/')) {
        result = products.find(p => p.id === pathname.split('/').pop());
        if (failProduct) { status = 503; result = { error: 'Product service unavailable' }; }
        else if (!result) { status = 404; result = { error: 'Product not found' }; }
      } else if (pathname === '/api/orders/track') {
        if (body.orderId === order.id && body.customerPhone === '9999999999') result = { id: order.id, accessToken: 'receipt-token' };
        else { status = 404; result = { error: 'Order ID and phone number do not match' }; }
      } else if (pathname.endsWith('/request-preview')) {
        if (failPreview) { status = 500; result = { error: 'Preview service unavailable' }; }
        else { assert.equal(request.headers()['x-order-access'], 'receipt-token'); result = { success: true }; }
      } else if (pathname === '/api/orders/STC0001') {
        result = { ...order };
        if (request.headers()['x-order-access'] !== 'receipt-token') {
          delete result.customerName;
          result.items = [{ product, quantity: 1, selectedModel: 'Apple - iPhone 15' }];
        }
      } else if (pathname === '/api/upload/customer') {
        const count = ++uploadCount;
        if (count === 1) await new Promise(resolve => setTimeout(resolve, 700));
        result = { url: count === 1 ? '/uploads/removed.jpg' : '/uploads/current.jpg' };
      } else if (pathname === '/api/reviews/p-none') {
        if (failReviews) { status = 503; result = { error: 'Review service unavailable' }; }
        else result = [];
      } else if (pathname === '/api/reviews/p-photo' || pathname === '/api/reviews/p-next' || pathname === '/api/reviews/p-out') result = [];
      else if (pathname === '/api/analytics/live') result = { viewing: 0, soldToday: 0 };
      else if (pathname.startsWith('/api/reviews') || pathname.startsWith('/api/site-reviews') || pathname.startsWith('/api/review-stories') || pathname.startsWith('/api/banners') || pathname.startsWith('/api/snaps')) result = [];
      await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' }, body: JSON.stringify(result) });
    });
    await context.route('**/uploads/**', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: photo }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const waitProduct = async () => { await page.getByRole('heading', { name: product.title, exact: true, level: 1 }).waitFor(); await page.getByText('Loading product options…').waitFor({ state: 'hidden' }); };
    const record = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };

    for (const [width, height] of [[320, 568], [390, 844], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/product/p-none', { waitUntil: 'networkidle' });
      await waitProduct();
      assert.equal(await page.locator('input[type=file]').count(), 0, 'Explicit None preset must suppress keyword-implied customization');
      const overflow = await page.evaluate(() => [...document.querySelector('main').querySelectorAll('button,input,select,textarea,h1,h2,h3')].filter(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden' || (rect.left >= -1 && rect.right <= innerWidth + 1)) return false;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return false;
        return true;
      }).map(el => ({ label: el.textContent.trim(), rect: el.getBoundingClientRect().toJSON() })));
      assert.deepEqual(overflow, [], `Purchase controls must fit ${width}px viewport`);
      const share = await page.getByRole('button', { name: 'Share', exact: true }).boundingBox();
      assert.ok(share.x >= 0 && share.x + share.width <= width + 1);
      await page.screenshot({ path: path.join(output, `product-${width}.png`), fullPage: true });
      record(`Product ${width}px controls and explicit customization None preset`);
    }

    await page.goto(base + '/product/p-out', { waitUntil: 'networkidle' }); await waitProduct();
    assert.equal(await page.getByRole('button', { name: 'Out of stock', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Buy Now', exact: true }).isDisabled(), true);
    record('Out-of-stock products cannot be added or bought');

    await page.goto(base + '/product/p-gel', { waitUntil: 'networkidle' }); await waitProduct();
    await page.getByTitle('Gold Plate (+₹99)', { exact: true }).click();
    await page.getByText('₹698', { exact: true }).waitFor();
    await page.getByText('₹1098', { exact: true }).waitFor();
    await page.getByText('36% off', { exact: true }).waitFor();
    record('Gel plate add-on updates price, compare price and discount consistently');

    await page.goto(base + '/search?q=flower', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Search results for "flower"', exact: true }).waitFor();
    assert.ok(await page.getByRole('heading', { name: product.title, exact: true }).count() > 0);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Search products', exact: true });
    await dialog.getByLabel('Search by product, brand or phone model', { exact: true }).fill('flower');
    assert.ok(await dialog.getByRole('button', { name: new RegExp(product.title) }).count() > 0);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Search', exact: true }).evaluate(element => document.activeElement === element), true);
    record('Tag search matches preview/full results; Escape closes and restores focus');

    settings.brandModels = {};
    await page.goto(base + '/product/p-global', { waitUntil: 'networkidle' }); await waitProduct();
    await page.getByRole('button', { name: '-- Choose your phone brand --', exact: true }).click();
    await page.getByText('No matches found', { exact: true }).waitFor();
    settings.brandModels = { Apple: ['iPhone 15'] };
    record('Intentionally empty admin brand/model catalog does not restore default models');

    failCollections = true;
    await page.goto(base + '/collections/cases', { waitUntil: 'networkidle' });
    await page.getByText('Collection service unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByText('Collection not found', { exact: true }).count(), 0);
    failCollections = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { level: 1, name: 'CASES', exact: true }).waitFor();
    record('Collection API failure does not claim missing collection; retry succeeds');

    failCatalog = true;
    await page.goto(base + '/collections/cases', { waitUntil: 'networkidle' });
    await page.getByText('Catalog service unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByText('No products found.', { exact: true }).count(), 0);
    failCatalog = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: product.title, exact: true }).first().waitFor();
    record('Collection product API failure reports unavailable catalog and recovers');

    failProduct = true;
    await page.goto(base + '/product/p-none', { waitUntil: 'networkidle' });
    await page.getByText('Product service unavailable', { exact: true }).waitFor();
    failProduct = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await waitProduct();
    record('Product load failure is visible and retry succeeds');

    failReviews = true;
    await page.goto(base + '/product/p-none', { waitUntil: 'networkidle' }); await waitProduct();
    await page.getByText('Review service unavailable', { exact: true }).waitFor();
    failReviews = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByText('No reviews yet — be the first to review this product.', { exact: true }).waitFor();
    record('Review load failure is visible and retry succeeds');

    await page.goto(base + '/product/p-photo', { waitUntil: 'networkidle' }); await waitProduct();
    await page.getByRole('button', { name: '-- Choose your phone model --', exact: true }).click();
    await page.getByRole('button', { name: 'iPhone 15', exact: true }).click();
    await page.locator('input[type=file]').nth(2).setInputFiles({ name: 'first.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.getByText('Uploading…', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Buy Now', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Remove & choose another', exact: true }).click();
    await page.locator('input[type=file]').nth(2).setInputFiles({ name: 'second.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.getByText('Photo ready to print', { exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.waitForURL('**/cart');
    const savedCart = await page.evaluate(() => JSON.parse(localStorage.getItem('3dcasemakers_cart')));
    assert.equal(savedCart[0].customImage3, '/uploads/current.jpg');
    record('Pending upload blocks purchase; removed upload cannot overwrite replacement');

    await page.goto(base + '/product/p-photo', { waitUntil: 'networkidle' }); await waitProduct();
    await page.getByPlaceholder('e.g. Priya', { exact: true }).nth(2).fill('Old product text');
    await page.evaluate(() => { history.pushState({}, '', '/product/p-next'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(150); await waitProduct();
    assert.equal(await page.getByPlaceholder('e.g. Priya', { exact: true }).nth(2).inputValue(), '');
    record('Third customization text resets when switching products');

    await page.evaluate(() => sessionStorage.setItem('3dcasemakers_order_access:STC0001', 'receipt-token'));
    await page.goto(base + '/order-confirmed/STC0001', { waitUntil: 'networkidle' });
    await page.getByText('Payment is due on delivery.', { exact: false }).waitFor();
    assert.equal(await page.getByText('payment has been received', { exact: false }).count(), 0);
    assert.ok(requests.some(r => r.pathname === '/api/orders/STC0001' && r.access === 'receipt-token'));
    await page.getByRole('link', { name: 'Request Preview Image', exact: true }).click();
    await page.getByText('Preview request recorded.', { exact: false }).waitFor();
    assert.ok(requests.some(r => r.pathname.endsWith('/request-preview') && r.access === 'receipt-token'));
    for (const popup of context.pages()) if (popup !== page) await popup.close();
    record('Receipt uses access header; payment message is accurate; preview flag saves');

    failPreview = true;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Request Preview Image', exact: true }).click();
    await page.getByText('Preview service unavailable', { exact: false }).waitFor();
    assert.equal(await page.getByText('Preview request recorded.', { exact: false }).count(), 0);
    for (const popup of context.pages()) if (popup !== page) await popup.close();
    failPreview = false;
    record('Rejected preview request reports failure without false success');

    await page.evaluate(() => sessionStorage.removeItem('3dcasemakers_order_access:STC0001'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('For your full order details', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Request Preview Image', exact: true }).count(), 0);
    record('Unauthenticated receipt does not enable protected preview controls');

    await page.goto(base + '/track-order', { waitUntil: 'networkidle' });
    await page.getByLabel('Order ID', { exact: true }).fill('STC0001');
    await page.getByLabel('Phone number', { exact: true }).fill('8888888888');
    await page.getByRole('button', { name: 'Track order', exact: true }).click();
    await page.getByText('Order ID and phone number do not match', { exact: true }).waitFor();
    assert.equal(await page.getByText('Status: Processing', { exact: true }).count(), 0);
    await page.getByLabel('Phone number', { exact: true }).fill('9999999999');
    await page.getByRole('button', { name: 'Track order', exact: true }).click();
    await page.getByText('Status: Processing', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('3dcasemakers_order_access:STC0001')), 'receipt-token');
    await page.getByRole('link', { name: 'View order details', exact: true }).click();
    await page.getByRole('link', { name: 'Request Preview Image', exact: true }).waitFor();
    record('Wrong phone is rejected; verified tracking stores receipt access and opens details');
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ fixtureMode: true, checks, errors, requestCount: requests.length, accessRequests: requests.filter(r => r.access) }, null, 2));
    await browser.close();
  }
  console.log(`${checks.length} focused browser regression checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
