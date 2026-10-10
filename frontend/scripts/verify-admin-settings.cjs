const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=require('./verify-browser.cjs');
const ExcelJS=require('exceljs');
let activeBrowser;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});activeBrowser=browser;
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 await context.route('**/*',r=>['localhost','127.0.0.1','fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await context.addInitScript(({cart})=>{
  if(!localStorage.getItem('3dcasemakers_cart'))localStorage.setItem('3dcasemakers_cart',JSON.stringify([...cart,{...cart[0],customName:'Priya'}]));
  sessionStorage.setItem('3dcasemakers_admin_token','x.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.x');
  window.__pixelCalls=[];window.fbq=(...args)=>window.__pixelCalls.push(args);
 },{cart:fixture.cart});
 const requests=[];let failSave=false;
 await context.route('**/api/**',async r=>{
  let body={};try{body=r.request().postDataJSON()||{}}catch{}
  const url=new URL(r.request().url());requests.push({path:url.pathname,method:r.request().method(),body,headers:r.request().headers()});
  if(url.pathname==='/api/settings/merge'&&failSave){failSave=false;return r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Simulated save failure'})});}
  await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:JSON.stringify(fixture.response(url,r.request().method(),body))});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const checks=[];
 function pass(label){checks.push(label);console.log('PASS '+label)}
 const base=process.env.TEST_BASE_URL||'http://localhost:3000';
 await page.goto(base+'/admin/dashboard#Settings',{waitUntil:'networkidle'});
 await page.getByRole('switch').first().click();await page.waitForTimeout(250);
 assert.equal(fixture.getSettings().maintenanceMode,true);assert.deepEqual(Object.keys(fixture.mutations.at(-1).body),['maintenanceMode']);pass('Maintenance switch saves only changed key');
 await page.getByRole('switch').first().click();await page.waitForTimeout(250);assert.equal(fixture.getSettings().maintenanceMode,false);
 failSave=true;await page.getByRole('switch').first().click();await page.getByRole('alert').filter({hasText:'Simulated save failure'}).first().waitFor();assert.equal(fixture.getSettings().maintenanceMode,false);
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForTimeout(250);assert.equal(fixture.getSettings().maintenanceMode,true);pass('Failed save remains editable and retries successfully');
 await page.getByRole('switch').first().click();await page.waitForTimeout(200);
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  for(const name of ['General','Payments','Checkout','Shipping and delivery','Sales channels','Domains','Notifications','Policies']){
   await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(80);
   assert.ok(await page.getByRole('heading',{name,exact:true}).count(),name);
   const off=await page.evaluate(()=>Array.from(document.querySelectorAll('.admin-glass main input,.admin-glass main button,.admin-glass main select')).filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.left<-1||r.right>innerWidth+1)}).map(e=>e.textContent||e.getAttribute('placeholder')));
   assert.deepEqual(off,[],`${width} settings ${name} overflow`);
  }
 }pass('All eight Settings categories render at mobile and desktop widths');
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Checkout',exact:true}).click();
 await page.getByPlaceholder('Announcement 1', {exact:true}).first().fill('Verified announcement');await page.getByRole('heading',{name:'Checkout',exact:true}).click();await page.waitForTimeout(250);
 assert.equal(fixture.getSettings().announcementMessages[0],'Verified announcement');
 const announcementEditor=page.getByPlaceholder('Announcement 1',{exact:true}).first().locator('..').locator('..').locator('..');
 while(fixture.getSettings().announcementMessages.length){await announcementEditor.getByRole('button',{name:'Remove',exact:true}).first().click();await page.waitForTimeout(150)}
 assert.deepEqual(fixture.getSettings().announcementMessages,[]);pass('Announcement edits and empty list persist without restoring defaults');
 await page.goto(base+'/',{waitUntil:'networkidle'});assert.equal(await page.locator('.site-announcement').count(),0);assert.equal(await page.evaluate(()=>window.__pixelCalls.filter(a=>a[0]==='track'&&a[1]==='PageView').length),1);pass('Empty announcement hidden and one Meta PageView per route');
 await page.goto(base+'/cart',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Increase quantity of Personalised Acrylic Phone Case',exact:true}).first().click();
 let items=await page.evaluate(()=>JSON.parse(localStorage.getItem('3dcasemakers_cart')));assert.deepEqual(items.map(i=>i.quantity),[2,1]);
 await page.getByRole('button',{name:'Remove item',exact:true}).first().click();items=await page.evaluate(()=>JSON.parse(localStorage.getItem('3dcasemakers_cart')));assert.deepEqual(items.map(i=>i.customName),['Priya']);pass('Cart buttons target only selected custom design');
 await page.goto(base+'/checkout',{waitUntil:'networkidle'});
 await page.locator('input[name="lastName"]').fill('Test Customer');await page.locator('input[name="shippingAddress"]').fill('Local test address');await page.locator('input[name="pincode"]').fill('641654');await page.locator('input[name="customerPhone"]').fill('9999999999');await page.locator('input[name="city"]').fill('Avinashi');await page.getByLabel('Save this information for next time').check();
 await page.getByRole('button',{name:'Place Order',exact:true}).click();await page.waitForURL('**/order-confirmed/STC1');await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('3dcasemakers_order_access:STC1')),'test-token');assert.ok(await page.evaluate(()=>localStorage.getItem('3dcasemakers_checkout_info')));
 const purchase=requests.find(r=>r.path==='/api/meta-ads/capi');assert.equal(purchase.headers['x-order-access'],'test-token');assert.equal(purchase.body.eventId,'purchase_STC1');assert.equal(purchase.body.total,499);pass('Checkout stores receipt token, optional delivery details and trusted purchase event');
 await context.addInitScript(()=>{const original=window.fbq;window.fbq=(...args)=>{if(args[0]==='track'&&args[1]==='Purchase')throw new Error('Simulated optional tracker failure');return original?.(...args)}});
 await page.evaluate(cart=>localStorage.setItem('3dcasemakers_cart',JSON.stringify(cart)),fixture.cart);
 await page.goto(base+'/checkout',{waitUntil:'networkidle'});await page.evaluate(()=>{const original=window.fbq;window.fbq=(...args)=>{if(args[0]==='track'&&args[1]==='Purchase')throw new Error('Simulated optional tracker failure');return original?.(...args)}});await page.getByRole('button',{name:'Place Order',exact:true}).click();await page.waitForURL('**/order-confirmed/STC1');await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('3dcasemakers_cart')).length),0);pass('Optional analytics failure cannot undo a saved checkout or retain the cart');
 await page.goto(base+'/admin/dashboard#Reports',{waitUntil:'networkidle'});
 for(const index of [0,1]){
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Excel (.xlsx)',exact:true}).nth(index).click();const download=await downloadPromise;
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(await download.path());assert.ok(wb.getWorksheet('Summary'));assert.ok(wb.getWorksheet(index?'Customers':'Orders'));assert.equal(wb.worksheets.length,2);
 }pass('Sales and customer Excel downloads round-trip with both worksheets');
 assert.equal(requests.filter(r=>r.path==='/api/settings'&&r.method==='PUT').length,0);assert.deepEqual(errors,[]);
 const guest=await browser.newContext();const guestPage=await guest.newPage();await guestPage.goto(base+'/admin/dashboard');await guestPage.waitForURL('**/admin/login');pass('Unauthenticated dashboard redirects to login');
 const dir=path.resolve(__dirname,'../../verification');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'admin-functional.json'),JSON.stringify({fixtureMode:true,checks,errors,mutations:fixture.mutations},null,2));
 await browser.close();console.log(checks.length+' admin/storefront interaction groups passed.');
})().catch(async e=>{console.error(e);if(activeBrowser)await activeBrowser.close();process.exitCode=1});
