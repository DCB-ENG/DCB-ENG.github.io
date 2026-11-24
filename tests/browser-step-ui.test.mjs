import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import {chromium} from "playwright";

const PORT=8123;
const fixture=process.argv[2]||"/tmp/browser-roll-cage-step/browser-fixture.json";
const server=spawn("python",["-m","http.server",String(PORT),"--bind","127.0.0.1"],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
try{
  let online=false;
  for(let i=0;i<60;i++){
    try{const r=await fetch("http://127.0.0.1:"+PORT+"/roll-cage/browser-step/");if(r.ok){online=true;break;}}catch{}
    await sleep(500);
  }
  assert(online,"Local browser export test server did not start");
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage();
  const messages=[];
  page.on("console",msg=>{const x=msg.text();if(msg.type()==="error")messages.push("console: "+x)});
  page.on("pageerror",e=>messages.push("pageerror: "+e.message));
  await page.goto("http://127.0.0.1:"+PORT+"/roll-cage/browser-step/",{waitUntil:"load"});
  await page.locator("#jsonFile").setInputFiles(fixture);
  await page.waitForFunction(()=>document.getElementById("exportButton").disabled===false);
  await page.locator("#exportButton").click();
  await page.waitForFunction(()=>{
    const t=document.getElementById("exportStatus");
    return t.classList.contains("success")||t.classList.contains("error");
  },{timeout:240000});
  const message=await page.locator("#exportStatus").innerText();
  assert((await page.locator("#exportStatus").getAttribute("class")).includes("success"),
    "Browser export failed: "+message+" | "+messages.join(" | "));
  const links=await page.locator("#partList a").all();
  assert.equal(links.length,6,"Both mode shows three bent and three straightened STEP parts");
  assert((await page.locator("#zipButton").isDisabled())===false,"ZIP packaging control enabled after valid files");
  const [download]=await Promise.all([page.waitForEvent("download",{timeout:45000}),page.locator("#zipButton").click()]);
  assert.match(download.suggestedFilename(),/STEP-both-3-tube-prototype\.zip$/);
  const zipPath=await download.path();
  const buf=await fs.readFile(zipPath);
  assert(buf.length>12000,"ZIP must contain six STEP solids and station markouts");
  assert.equal(buf[0],0x50,"ZIP local file PK header");
  assert.equal(buf[1],0x4b);
  await fs.writeFile("/tmp/browser-roll-cage-step/browser-pack.zip",buf);
  console.log("Chromium browser created 6 STEP solids with the bend-mark CSV and SVG:",buf.length,"ZIP bytes");
  await page.locator("#stepMode").selectOption("straight");
  assert.equal(await page.locator("#exportButton").isDisabled(),false);
  await page.locator("#exportButton").click();
  await page.waitForFunction(()=>{
    const t=document.getElementById("exportStatus");
    return t.classList.contains("success")||t.classList.contains("error");
  },{timeout:240000});
  assert((await page.locator("#exportStatus").getAttribute("class")).includes("success"),
    "Straight-only mode failed: "+await page.locator("#exportStatus").innerText());
  assert.equal(await page.locator("#partList a").count(),3,"Straight mode exports three solids");
  assert.equal(await page.locator("#marksCSVButton").isDisabled(),false);
  assert.equal(await page.locator("#marksSVGButton").isDisabled(),false);
  await page.locator("#stepMode").selectOption("bent");
  await page.locator("#exportButton").click();
  await page.waitForFunction(()=>{
    const t=document.getElementById("exportStatus");
    return t.classList.contains("success")||t.classList.contains("error");
  },{timeout:240000});
  assert((await page.locator("#exportStatus").getAttribute("class")).includes("success"),
    "Bent-only mode failed: "+await page.locator("#exportStatus").innerText());
  assert.equal(await page.locator("#partList a").count(),3,"Bent-only mode exports three solids");


  // Real generator -> lab hand-off: the user should not need to download/reload JSON.
  const editor=await context.newPage();
  await editor.goto("http://127.0.0.1:"+PORT+"/roll-cage/",{waitUntil:"load",timeout:60000});
  await editor.locator("#useFrontLegs").check();
  await editor.waitForFunction(()=>{
    const b=document.getElementById("browserStepOpen");
    return b && b.disabled===false;
  },{timeout:120000});
  const popupPromise=context.waitForEvent("page",{timeout:30000});
  await editor.locator("#browserStepOpen").click();
  const popup=await popupPromise;
  await popup.waitForLoadState("load");
  await popup.waitForFunction(()=>{
    const status=document.getElementById("exportStatus");
    return document.getElementById("exportButton")?.disabled===false &&
      status?.textContent?.includes("Ready:");
  },{timeout:60000});
  console.log("Generator-to-lab hand-off passed; current measurements available without JSON upload.");
  await popup.locator("#exportButton").click();
  await popup.waitForFunction(()=>{
    const box=document.getElementById("exportStatus");
    return box?.classList.contains("success")||box?.classList.contains("error");
  },{timeout:240000});
  const handoffStatus=await popup.locator("#exportStatus").innerText();
  assert((await popup.locator("#exportStatus").getAttribute("class")).includes("success"),
    "Real generator front-leg STEP straightening failed: "+handoffStatus);
  assert.equal(await popup.locator("#partList a").count(),6,
    "Measured generator geometry must create six bent/straight STEP solids");

}catch(error){
  console.error("Browser STEP test error",error);
  throw error;
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
