import {checkInputs, generatePreview, bendMarkCSV, bendMarkSVG} from "./cad-engine.mjs";

// Pinned for reproducibility. Browser import is deliberately lazy: the main
// calculator does not download an OpenCascade WASM kernel just to show geometry.
const BREP_URL = "https://esm.sh/brepjs@20.28.3?bundle&target=es2022";
const OCCT_URL = "https://esm.sh/occt-wasm@5.18.2?bundle&target=es2022";
const ZIP_URL = "https://esm.sh/fflate@0.8.2?bundle&target=es2022";
const STORAGE_KEY = "dcb-roll-cage-browser-step-v1";
const $ = id => document.getElementById(id);
let current=null,results=[],urls=[],busy=false;
const text=(id,value)=>{$(id).textContent=value;};
const safeMsg=(message,kind="")=>{$("exportStatus").textContent=message;$("exportStatus").className="status"+(kind?" "+kind:"");};
function releaseUrls(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
function resetOutput(){
  releaseUrls();results=[];for(const id of ["zipButton","marksCSVButton","marksSVGButton"])$(id).disabled=true;
  $("partList").innerHTML=[
    '<div class="part"><strong>RC-001 · Main hoop</strong><span class="muted">Not generated</span></div>',
    '<div class="part"><strong>RC-002/003 · Front leg</strong><span class="muted">Not generated</span></div>',
    '<div class="part"><strong>RC-005 · Diagonal</strong><span class="muted">Not generated</span></div>'
  ].join("");
}
function showSource(){
  resetOutput();
  try {
    const list=checkInputs(current,$("frontSide").value);
    const job=current?.cutList?.job?" · job "+current.cutList.job:"";
    text("sourceLabel","Loaded "+list.length+" supported geometry types"+job+". The selected front-leg side may be changed before export.");
    $("exportButton").disabled=false;
    safeMsg("Ready: "+$("stepMode").selectedOptions[0].text+" — main hoop, "+$("frontSide").value+" front leg and diagonal brace.");
  }catch(e){
    $("exportButton").disabled=true;
    safeMsg(e.message||String(e),"error");
  }
}
async function loadKernel(){
  safeMsg("Downloading and initializing the browser OpenCascade CAD kernel…");
  // Explicit manual kernel registration avoids brepjs/quick's optional
  // Node-only dynamic imports (e.g. brepjs-opencascade) in a static browser.
  const [brep,wasm]=await Promise.all([import(BREP_URL),import(OCCT_URL)]);
  if(typeof wasm.OcctKernel?.init!=="function" || typeof brep.registerKernel!=="function" || !brep.OcctWasmAdapter)
    throw new Error("The pinned browser CAD engine did not expose its WASM initialization API.");
  const kernel=await wasm.OcctKernel.init();
  brep.registerKernel("occt-wasm",brep.OcctWasmAdapter.fromKernel(kernel));
  if(typeof brep.shape!=="function" || typeof brep.exportSTEP!=="function" || typeof brep.threePointArc!=="function")
    throw new Error("Browser CAD engine does not provide STEP and circular arc operations.");
  return brep;
}
function makeDownloadLink(output){
  const blobURL=URL.createObjectURL(output.blob);urls.push(blobURL);
  const a=document.createElement("a");
  a.href=blobURL;a.download=output.filename;a.textContent="Download STEP";
  a.title="Save "+output.filename+" ("+Math.round(output.blob.size/1024)+" KB)";
  return a;
}
function showResults(){
  $("partList").replaceChildren();
  for(const output of results){
    const row=document.createElement("div");row.className="part";
    const info=document.createElement("div");
    const title=document.createElement("strong");title.textContent=output.partNumber+" · "+output.id.replaceAll("-"," ")+" · "+output.variant.toUpperCase();
    const detail=document.createElement("div");detail.className="muted";
    detail.textContent=output.blob.size.toLocaleString()+" bytes · developed "+output.schedule.developedLength.toFixed(1)+" mm · volume "+Math.round(output.volume).toLocaleString()+" mm³"+(output.removedVolume>0?" · coped "+Math.round(output.removedVolume).toLocaleString()+" mm³":"");
    info.append(title,detail);
    row.append(info,makeDownloadLink(output));
    $("partList").append(row);
  }
  for(const id of ["zipButton","marksCSVButton","marksSVGButton"])$(id).disabled=false;
}
async function generate(){
  if(busy||!current)return;
  busy=true;$("exportButton").disabled=true;$("zipButton").disabled=true;
  resetOutput();
  try{
    const side=$("frontSide").value;
    checkInputs(current,side);
    const brep=await loadKernel();
    const mode=$("stepMode").value;
    results=await generatePreview(brep,current,side,msg=>safeMsg(msg),mode);
    if(results.length!==(mode==="both"?6:3))throw new Error("Selected STEP mode returned an unexpected number of solids.");
    showResults();
    safeMsg(results.length+" analytical STEP solids generated with original cope orientation. Download STEP + markout ZIP and verify every file in ProCAM before cutting.","success");
  }catch(e){
    resetOutput();
    safeMsg("STEP generation failed: "+(e?.message||String(e))+
      "\nNo experimental STEP files were offered. Use the Windows converter if necessary.","error");
    console.error("Browser STEP CAD error",e);
  }finally{busy=false;$("exportButton").disabled=!current;}
}

function uniqueSchedules(){
  const seen=new Set();
  return results.filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).map(r=>r.schedule);
}
function saveBlob(filename,blob){
  const url=URL.createObjectURL(blob);urls.push(url);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
}
function markName(extension){
  const job=(current?.cutList?.job||"roll-cage").replace(/[^a-z0-9-]/gi,"-");
  return job+"-step-bend-markouts."+extension;
}
function markCSVBlob(){return new Blob([bendMarkCSV(uniqueSchedules())],{type:"text/csv;charset=utf-8"});}
function markSVGBlob(){return new Blob([bendMarkSVG(uniqueSchedules())],{type:"image/svg+xml"});}
function zipReadme(){
  const variant=$("stepMode").value;
  return [
    "DCB ENG · ROLL CAGE STEP EXPORT · "+variant.toUpperCase(),
    "EXPERIMENTAL — CAD VERIFICATION REQUIRED BEFORE PRODUCTION",
    "",
    "Part numbers: main hoop RC-001, selected front leg RC-002/003 and diagonal RC-005.",
    "BENT = final calculated shape. STRAIGHT = analytic hollow CHS on +X using exact developed CENTRELINE length.",
    "STRAIGHT X=0 is the named datum end. Additional trim stock from cut list is NOT in the STEP solid.",
    "0° circumferential mark = global +Y radial in the straight STEP, transformed from the initial tube's world-UP projected reference (FRONT fallback).",
    "Bend mark positions are measured from X=0: START, ARC CENTRE, END.",
    "Signed clock from previous bend plane uses the right-hand rule along the intermediate straight toward +X.",
    "The near-end front-leg fishmouth and both diagonal copes are preserved by rigidly transforming the mating main hoop before Boolean cutting.",
    "No bend marks or seam marks are etched/cut into the STEP tube. Use the numerical CSV and SVG for setup or separate CAM marking.",
    "Clocking signs, original orientation, bend growth, clamp feeds and tube laser zero must be VERIFIED in ProCAM/RoboRail and on a test tube.",
    "Crossings, feet, plates, gussets, weld gaps, ovalisation, tolerances and other cage members are outside this 3-tube proof of concept.",
    "Not a certified cage design or an automatic CNC cutting program."
  ].join("\r\n");
}
async function makeZIP(){
  if(!results.length||busy)return;
  try{
    busy=true;$("zipButton").disabled=true;
    const {zipSync,strToU8}=await import(ZIP_URL);
    const archive={};
    for(const item of results)archive[item.filename]=new Uint8Array(await item.blob.arrayBuffer());
    archive[markName("csv")]=new Uint8Array(await markCSVBlob().arrayBuffer());
    archive[markName("svg")]=new Uint8Array(await markSVGBlob().arrayBuffer());
    archive["READ-ME-FIRST.txt"]=strToU8(zipReadme());
    archive["step-part-manifest.json"]=strToU8(JSON.stringify({
      schema:"dcb-roll-cage-step-variants-v1",
      units:"mm",mode:$("stepMode").value,
      job:current?.cutList?.job||null,
      parts:results.map(r=>({
        id:r.id,partNumber:r.partNumber,mode:r.variant,file:r.filename,
        developedCentrelineMm:r.schedule.developedLength,
        preparationBlankMm:r.schedule.prepBlankLength,
        allowancePerEndMm:r.schedule.allowancePerEnd,
        copeRemovedVolumeMm3:r.removedVolume,
        radialZero:r.schedule.radialZero,
        bends:r.schedule.bends
      }))
    },null,2));
    const bytes=zipSync(archive,{level:0});
    const zipBlob=new Blob([bytes],{type:"application/zip"});
    const job=(current?.cutList?.job||"roll-cage").replace(/[^a-z0-9-]/gi,"-");
    saveBlob(job+"-STEP-"+$("stepMode").value+"-3-tube-prototype.zip",zipBlob);
    safeMsg("ZIP created with "+results.length+" STEP solids, bend station CSV/SVG and a part manifest. Check all copes and clocking in CAD.","success");
  }catch(e){safeMsg("ZIP packaging error: "+(e.message||String(e))+". Use the individual STEP links above.","error");}
  finally{busy=false;$("zipButton").disabled=!results.length;}
}
$("jsonFile").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  resetOutput();
  if(file.size>10_000_000){safeMsg("JSON file is larger than the 10 MB safety limit.","error");return;}
  try{current=JSON.parse(await file.text());showSource();}
  catch(err){current=null;$("exportButton").disabled=true;safeMsg("Could not read geometry JSON: "+err.message,"error");}
});
$("frontSide").addEventListener("change",()=>current&&showSource());
$("stepMode").addEventListener("change",()=>current&&showSource());
$("exportButton").addEventListener("click",generate);
$("zipButton").addEventListener("click",makeZIP);
$("marksCSVButton").addEventListener("click",()=>results.length&&saveBlob(markName("csv"),markCSVBlob()));
$("marksSVGButton").addEventListener("click",()=>results.length&&saveBlob(markName("svg"),markSVGBlob()));
$("resetButton").addEventListener("click",()=>{
  resetOutput();$("exportButton").disabled=!current;
  safeMsg(current?"Results cleared. Your geometry remains loaded.":"Select geometry to enable export.");
});
try{
  const stored=sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if(stored){current=JSON.parse(stored);showSource();}
}catch(err){safeMsg("Browser session storage unavailable. Choose a geometry JSON file instead.");}
