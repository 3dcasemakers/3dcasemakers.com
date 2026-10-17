const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(__dirname, '../../verification/browser');
fs.mkdirSync(output, { recursive: true });
const products = [{id:'p1',title:'Personalised Acrylic Phone Case',description:'A premium custom case.',price:499,comparePrice:999,material:'Acrylic Case',stockStatus:'in_stock',isFeatured:true,isTrending:true,isNewArrival:true,isBestSeller:true,images:['http://localhost:3000/og-image.jpg'],models:['iPhone 15','Samsung S24'],collectionId:'c1',collectionIds:['c1'],tags:[],createdAt:'2026-10-01',displayOrder:0,customizable:false}];
const collections = [{id:'c1',name:'Custom Cases',slug:'custom-cases',image:'http://localhost:3000/og-image.jpg',bannerImage:'http://localhost:3000/og-image.jpg',isVisible:true,displayOrder:0}];
let settings = {announcementBarEnabled:true,announcementMessages:['Secure Online Payments','Free Shipping Across Tamil Nadu'],announcementSpeed:'normal',offers:[{id:'o1',label:'Weekend',badgeText:'Buy 2 custom cases and get ₹100 OFF for this weekend',minQty:2,discountAmount:100,enabled:true,endsAt:new Date(Date.now()+86400000).toISOString()}],siteTestimonials:[],uiHomeHiddenSections:[],contactEmail:'3dcasemakers@gmail.com',brandModels:{Apple:['iPhone 15']},shippingZones:[],homeSections:[]};
const cart = products.map(product => ({product,selectedModel:'iPhone 15',quantity:1,customName:'Hari'}));
const order = {id:'STC1',customerName:'Test Customer',customerPhone:'9999999999',customerEmail:'test@example.invalid',shippingAddress:'Test address',city:'Avinashi',state:'Tamil Nadu',pincode:'641654',items:cart,subtotal:499,shipping:0,discount:0,total:499,paymentMethod:'online',paymentStatus:'pending',status:'pending',createdAt:'2026-10-04 07:00:00',isSeen:true,source:'website'};
const dashboard = {totals:{totalOrders:1,totalRevenue:499},today:{ordersToday:1,revenueToday:499},period:{key:'today',ordersInPeriod:1,revenueInPeriod:499,pendingInPeriod:1},dailyRevenue:[{day:'2026-10-04',revenue:499,orders:1}],last7Days:[{day:'2026-10-04',revenue:499,orders:1}],statusBreakdown:[{status:'pending',count:1}],topProducts:[{id:'p1',title:products[0].title,qty:1}]};
const insights = {summary:{revenue:499,orders:1,units:1,shipping:0,avgOrderValue:499,unitsPerOrder:1,cancelled:0,returned:0,delivered:0,deliveryRate:0,cancelledValue:0,cancellationRate:0,returnedValue:0,newCustomers:1,returningCustomers:0},byWeekday:[],byHour:[],byState:[],bySource:[],byBrand:[]};
const report = {generatedAt:new Date().toISOString(),windowLabel:'Last 12 Months',periodMonths:12,yearTotals:{totalOrders:1,totalRevenue:499,grossSales:499,totalShipping:0},allTimeTotals:{totalOrders:1,totalRevenue:499},monthlyRevenue:[{month:'2026-10',orders:1,revenue:499,grossSales:499,totalShipping:0}],statusBreakdownYear:[{status:'pending',count:1}],topProductsByQty:[],topProductsByRevenue:[],brandBreakdown:[],collectionBreakdown:[],customerInsights:{newCustomers:1,returningCustomers:0,topCustomers:[]}};
const mutations=[];
function response(url, method, body) {
  const p=url.pathname;
  if(method==='OPTIONS') return {};
  if(p==='/api/settings' || p==='/api/settings/admin') return settings;
  if(p==='/api/settings/merge') {settings={...settings,...body};mutations.push({path:p,body});return {success:true,settings};}
  if(p.startsWith('/api/products')) return /\/p1$/.test(p) ? products[0] : products;
  if(p==='/api/collections') return collections;
  if(p==='/api/banners') return [{id:'b1',image:'http://localhost:3000/og-image.jpg',title:'Custom cases',link:'/collections/custom-cases',active:true,order:0}];
  if(p==='/api/orders/notifications/unseen-count') return {count:0};
  if(p==='/api/orders') return method==='POST' ? {id:'STC1',subtotal:499,shipping:0,discount:0,total:499,accessToken:'test-token'} : [order];
  if(p.startsWith('/api/orders/')) return order;
  if(p==='/api/customers') return [{phone:'9999999999',name:'Test Customer',email:'test@example.invalid',city:'Avinashi',state:'Tamil Nadu',orderCount:1,totalSpent:499,lastOrderAt:'2026-10-04'}];
  if(p==='/api/analytics/export-data') return {summary:{periodKey:'this_month',periodLabel:'This Month',totalOrders:1,cancelledOrders:0,totalRevenue:499,avgOrderValue:499,uniqueCustomers:1,generatedAt:new Date().toISOString()},salesRows:[{id:'STC1',date:'2026-10-04',customerName:'Test Customer',customerPhone:'9999999999',city:'Avinashi',state:'Tamil Nadu',itemsCount:1,subtotal:499,shipping:0,discount:0,total:499,paymentMethod:'online',status:'pending'}],customerRows:[{name:'Test Customer',phone:'9999999999',email:'test@example.invalid',city:'Avinashi',state:'Tamil Nadu',orderCount:1,totalSpent:499,lastOrderAt:'2026-10-04'}]};
  if(p==='/api/analytics/dashboard') return dashboard;
  if(p==='/api/analytics/insights') return insights;
  if(p==='/api/analytics/visitor-stats') return {today:1,yesterday:0,last7Days:1};
  if(p==='/api/analytics/visitor-analytics') return {period:'28d',total:1,byDay:[],landingPages:[],exitPages:[],sources:[]};
  if(p==='/api/analytics/growth') return {days:28,totalSessions:1,totalOrders:1,totalRevenue:499,channelSessions:[],dailySessions:[],dailyRevenue:[],channels:[],daily:[]};
  if(p==='/api/analytics/report') return {...report,periodMonths:Number(url.searchParams.get('months')||12)};
  if(p==='/api/analytics/top-phone-models') return {period:'this_month',totalUnits:1,models:[],brands:[],topModels:[],byBrand:[]};
  if(p==='/api/analytics/live') return {viewing:0,soldToday:1};
  if(p==='/api/analytics/heartbeat' || p==='/api/analytics/abandoned-cart') return {ok:true};
  if(p==='/api/analytics/live-visitors' || p==='/api/analytics/abandoned-carts' || p==='/api/analytics/top-selling') return [];
  if(p==='/api/email-usage') return {limit:500,windowHours:24,mailboxes:[]};
  if(p==='/api/email-usage/status') return {customer:{configured:false},orders:{configured:false}};
  if(p.startsWith('/api/pincode/')) return {city:'Avinashi',state:'Tamil Nadu'};
  if(p.startsWith('/api/upload')) return {files:[],url:'/uploads/test.png'};
  if(p.startsWith('/api/faqs')) return [{id:'f1',question:'When will my order arrive?',answer:'Delivery within 3–7 working days.',category:'General',isVisible:true,displayOrder:0}];
  if(['/api/reviews','/api/site-reviews','/api/review-stories','/api/snaps','/api/contact','/api/newsletter'].some(x=>p.startsWith(x))) return [];
  return {};
}
module.exports={response,cart,mutations,getSettings:()=>settings};
if(require.main===module)(async()=>{
 const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext();
 await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return ['localhost','127.0.0.1','fonts.googleapis.com','fonts.gstatic.com'].includes(host)?route.continue():route.abort();});
 await context.addInitScript(({cart})=>{
   localStorage.setItem('3dcasemakers_cart',JSON.stringify(cart));
   sessionStorage.setItem('3dcasemakers_admin_token','x.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})) +'.x');
   window.__pixelCalls=[];window.fbq=(...args)=>window.__pixelCalls.push(args);
 },{cart});
 await context.route('**/api/**',async route=>{
  const req=route.request();let body={};try{body=req.postDataJSON()||{}}catch{}
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,PATCH,OPTIONS'},body:JSON.stringify(response(new URL(req.url()),req.method(),body))});
 });
 await context.route('**/uploads/**',r=>r.fulfill({status:200,contentType:'image/png',body:fs.readFileSync(path.resolve(__dirname,'../public/og-image.jpg'))}));
 const page=await context.newPage();const issues=[];const results=[];let current='';
 page.on('pageerror',e=>issues.push({page:current,error:e.message}));
 const base=process.env.TEST_BASE_URL||'http://localhost:3000';
 async function check(route,w,h,capture=false){
  current=`${w}x${h} ${route}`;
  await page.setViewportSize({width:w,height:h});await page.goto(base+route,{waitUntil:'networkidle'});await page.waitForTimeout(160);
  if(route.startsWith('/admin/dashboard')){await page.waitForSelector('.admin-glass main');await page.waitForFunction(()=>!document.querySelector('.admin-glass main').innerText.trim().startsWith('Loading '));}
  const layout=await page.evaluate(()=>{
   const scope=document.querySelector('.admin-glass main')||document.querySelector('main')||document.body;
   const off=[];
   for(const el of scope.querySelectorAll('button,input,select,textarea,h1,h2,h3')){
    const r=el.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(el).visibility==='hidden')continue;
    if(r.left<-1||r.right>innerWidth+1){
     let p=el.parentElement,scroll=false;while(p&&p!==scope){if(['auto','scroll'].includes(getComputedStyle(p).overflowX)){scroll=true;break}p=p.parentElement}
     if(!scroll)off.push({text:(el.textContent||el.getAttribute('aria-label')||el.tagName).trim().slice(0,55),left:Math.round(r.left),right:Math.round(r.right)});
    }
   }
   const timer=document.querySelector('[class*="top-[68px]"]');const main=document.querySelector('main');
   return {off,bodyWidth:document.documentElement.scrollWidth,timerBottom:timer?.getBoundingClientRect().bottom,mainTop:main?.getBoundingClientRect().top,content:scope.innerText.length,pixelViews:window.__pixelCalls?.filter(a=>a[0]==='track'&&a[1]==='PageView').length};
  });
  if(capture)await page.screenshot({path:path.join(output,`${w}-${route.replace(/[^a-z0-9]/gi,'_')}.png`),fullPage:!route.startsWith('/admin')});
  results.push({page:current,...layout});console.log(current+' overflow='+layout.off.length+' content='+layout.content);
 }
 const tabs=['Overview','Growth','Visitors','Live','Reports','Analytics','Gmail Manager','Orders','Customers','Abandoned Checkouts','Products','Pricing','Material Details','Collections','Phone Models','Variant Options','Content','Customize','Home Page','Website Content','Discounts','Reviews','Themes','FAQs','Queries','File Manager','Settings'];
 const routes=['/','/collections','/collections/custom-cases','/product/p1','/cart','/checkout','/reviews','/contact','/faqs','/track-order','/about-us','/policy/shipping','/search?q=case','/admin/login'];
 const viewports=process.env.VERIFY_QUICK?[[320,568],[390,844],[768,1024],[1440,900]]:[[320,568],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080]];
 for(const [w,h] of viewports){
   for(const route of (process.env.VERIFY_QUICK?['/','/checkout','/reviews','/product/p1']:routes))await check(route,w,h,['/','/checkout','/reviews','/cart'].includes(route)&&[390,1440].includes(w));
   for(const tab of (process.env.VERIFY_QUICK?['Overview','Settings','Products','Orders','Analytics','Phone Models','Variant Options','Discounts']:([390,1440].includes(w)?tabs:['Overview','Settings','Products','Orders','Analytics'])))await check('/admin/dashboard#'+encodeURIComponent(tab),w,h,['Settings','Products','Analytics','Overview'].includes(tab)&&[390,1440].includes(w));
 }
 fs.writeFileSync(path.join(output,process.env.VERIFY_QUICK?'targeted-results.json':'results.json'),JSON.stringify({fixtureMode:true,results,issues,mutations},null,2));
 await browser.close();
 console.log(JSON.stringify({checks:results.length,errors:issues,overflow:results.filter(r=>r.off.length)}));
 if(issues.length||results.some(r=>r.off.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
