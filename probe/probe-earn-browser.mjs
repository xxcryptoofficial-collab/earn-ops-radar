// Anonymous public-read probe only. No clicks, account, proxy, storage state or subscription.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const targets = [
 {sourceId:'binance-simple-earn',url:'https://www.binance.com/en/earn/simple-earn'},
 {sourceId:'okx-simple-earn',url:'https://www.okx.com/earn/simple-earn'},
];
await mkdir('probe-output',{recursive:true});
const browser = await chromium.launch({headless:true});
try {
 for (const target of targets) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const startedAt=new Date().toISOString();
  try {
   const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(30000);
   const text=(await page.locator('body').innerText({timeout:10000})).slice(0,200000);
   const observedAt=new Date().toISOString();
   const blocked=/site unavailable|access denied|verify you are human|captcha|not available in your region/i.test(text);
   const hasRate=/\d+(?:\.\d+)?\s*%/.test(text);
   const expectedProduct=target.sourceId.startsWith('binance')?/flexible|fixed|simple earn/i.test(text):/simple earn|flexible|fixed/i.test(text);
   if(blocked||!hasRate||!expectedProduct)process.exitCode=1;
   await writeFile(`probe-output/${target.sourceId}.txt`,text);
   await writeFile(`probe-output/${target.sourceId}.json`,JSON.stringify({sourceId:target.sourceId,sourceUrl:target.url,finalUrl:page.url(),acquisitionMethod:'anonymous-browser-rendered-dom',startedAt,observedAt,httpStatus:response?.status()??null,bodySha256:createHash('sha256').update(text).digest('hex'),status:blocked?'blocked_unknown':hasRate&&expectedProduct?'partial_catalog_read':'no_catalog_verified',currentQuoteVerified:false,limitations:['Single anonymous probe; no stable daily operation claim','No click into Subscribe or account access','Displayed rate/tiers/eligibility/source update time require further review']},null,2));
  } catch {
   process.exitCode=1;
   // No raw network diagnostics: avoid incidental environment details.
   await writeFile(`probe-output/${target.sourceId}.json`,JSON.stringify({sourceId:target.sourceId,sourceUrl:target.url,acquisitionMethod:'anonymous-browser-rendered-dom',startedAt,observedAt:new Date().toISOString(),status:'read_failed',currentQuoteVerified:false},null,2));
  } finally {await context.close();}
 }
} finally {await browser.close();}
