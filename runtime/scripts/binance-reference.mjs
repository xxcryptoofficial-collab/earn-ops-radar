import {createHash} from 'node:crypto';
export function parseCatalog(text,observedAt,previous=[]){
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 const start=lines.findIndex(s=>s==='Duration(Days)');const end=lines.indexOf('View More',start);
 if(start<0||end<0||end<=start)throw Error('BINANCE_CATALOG_STRUCTURE_MISSING');
 const old=new Map(previous.map(r=>[r.id,r]));const rows=[];
 for(let i=start+1;i+2<end;i+=3){
  const [coin,display,term]=lines.slice(i,i+3);
  if(!/^[A-Z0-9]{1,15}$/.test(coin)||!/^\d+(?:\.\d+)?%(?:\s*~\s*\d+(?:\.\d+)?%)?$/.test(display)||!['Flexible','Locked','Flexible/Locked'].includes(term))throw Error('BINANCE_CATALOG_ROW_INVALID');
  const id=`reference-binance-catalog-${coin.toLowerCase()}`;
  rows.push({id,platform:'Binance',title:`${coin} 公开目录范围`,fact:`官方匿名目录显示 ${coin} ${display}，目录期限标记 ${term}；这是产品总览范围，不是普通活期基础报价。`,conditions:'具体产品身份、基础/额外奖励、额度阶梯、资格及源端利率更新时间未核；不能把区间上限填入实时挂牌。',source:'Binance official anonymous catalog',sourceUrl:'https://www.binance.com/en/earn/simple-earn',contentKind:'catalog-reference',coin,term,sector:'CEX',publishedAt:null,observedAt,retrievedAt:observedAt,verifiedAt:observedAt,fetchedAt:observedAt,firstObservedAt:old.get(id)?.firstObservedAt??observedAt,rateAsOf:null,fieldsUnknown:['productId','baseBonusSplit','rateAsOf','eligibility','remainingQuota','tier'],currentQuoteVerified:false,coverage:'partial',evidenceRefs:['binance-catalog-dom'],rawDisplay:display,classification:'research-reference-only',acquisition:[{evidenceId:'binance-catalog-dom',sourceUrl:'https://www.binance.com/en/earn/simple-earn',method:'anonymous-browser-rendered-dom',observedAt,retrievedAt:observedAt,bodySha256:createHash('sha256').update(text).digest('hex'),completeness:'partial',limitations:'Only rendered parent catalog rows; no account or subscription operations'}]});
 }
 if(!rows.length)throw Error('BINANCE_CATALOG_EMPTY');return rows;
}
export async function collectBinanceReference(previous=[]){
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto('https://www.binance.com/en/earn/simple-earn',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(30000);
  const text=(await page.locator('body').innerText({timeout:10000})).slice(0,200000);
  if(/site unavailable|access denied|verify you are human|captcha|not available.*(?:region|country)/i.test(text))throw Error('BINANCE_ACCESS_BLOCKED');
  const observedAt=new Date().toISOString();const records=parseCatalog(text,observedAt,previous);
  return{records,evidence:{schemaVersion:'earn-public-browser-evidence/1.0',sourceUrl:'https://www.binance.com/en/earn/simple-earn',acquisitionMethod:'anonymous-browser-rendered-dom',observedAt,bodySha256:createHash('sha256').update(text).digest('hex'),body:text,currentQuoteVerified:false}};
 }finally{await browser.close();}
}
