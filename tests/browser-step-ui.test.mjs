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
  assert.equal(links.length,3,"Browser must show three downloadable STEP parts");
  assert((await page.locator("#zipButton").isDisabled())===false,"ZIP packaging control enabled after valid files");
  const [download]=await Promise.all([page.waitForEvent("download",{timeout:45000}),page.locator("#zipButton").click()]);
  assert.match(download.suggestedFilename(),/3-step-prototype\.zip$/);
  const zipPath=download.path();
  const buf=await fs.readFile(zipPath);
  assert(buf.length>8000,"ZIP must not contain empty parts");
  assert.equal(buf[0],0x50,"ZIP local file PK header");
  assert.equal(buf[1],0x4b);
  console.log("Chromium browser imported pinned WASM kernel, created 3 STEP solids and downloaded ZIP:",buf.length,"bytes");
}catch(error){
  console.error("Browser STEP test error",error);
  throw error;
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
