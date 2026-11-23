import {checkInputs, generatePreview} from "./cad-engine.mjs";

// Pinned for reproducibility. Browser import is deliberately lazy: the main
// calculator does not download an OpenCascade WASM kernel just to show geometry.
const BREP_URL = "https://esm.sh/brepjs@20.28.3/quick?bundle&target=es2022";
const ZIP_URL = "https://esm.sh/fflate@0.8.2?bundle&target=es2022";
const STORAGE_KEY = "dcb-roll-cage-browser-step-v1";
const $ = id => document.getElementById(id);
let current=null,results=[],urls=[],busy=false;
const text=(id,value)=>{$(id).textContent=value;};
const safeMsg=(message,kind="")=>{$("exportStatus").textContent=message;$("exportStatus").className="status"+(kind?" "+kind:"");};
function releaseUrls(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
function resetOutput(){
  releaseUrls();results=[];$("zipButton").disabled=true;
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
    safeMsg("Ready: bent main hoop, "+$("frontSide").value+" front leg, and diagonal brace. Click Generate to start the browser CAD kernel.");
  }catch(e){
    $("exportButton").disabled=true;
    safeMsg(e.message||String(e),"error");
  }
}
async function loadKernel(){
  safeMsg("Downloading and initializing the browser OpenCascade CAD kernel…");
  const brep=await import(BREP_URL);
  if(typeof brep.init==="function")await brep.init();
  if(typeof brep.shape!=="function" || typeof brep.exportSTEP!=="function" || typeof brep.threePointArc!=="function")
    throw new Error("Browser CAD module was loaded without the required B-rep/STEP functions.");
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
    const title=document.createElement("strong");title.textContent=output.partNumber+" · "+output.id.replaceAll("-"," ");
    const detail=document.createElement("div");detail.className="muted";
    detail.textContent=output.blob.size.toLocaleString()+" bytes · volume "+Math.round(output.volume).toLocaleString()+" mm³"+(output.removedVolume>0?" · coped "+Math.round(output.removedVolume).toLocaleString()+" mm³":"");
    info.append(title,detail);
    row.append(info,makeDownloadLink(output));
    $("partList").append(row);
  }
  $("zipButton").disabled=false;
}
async function generate(){
  if(busy||!current)return;
  busy=true;$("exportButton").disabled=true;$("zipButton").disabled=true;
  resetOutput();
  try{
    const side=$("frontSide").value;
    checkInputs(current,side);
    const brep=await loadKernel();
    results=await generatePreview(brep,current,side,msg=>safeMsg(msg));
    if(results.length!==3)throw new Error("Three-part export did not produce three solids.");
    showResults();
    safeMsg("Three analytical STEP files generated. Download individually or as one ZIP, then verify in a CAD viewer before cutting.","success");
  }catch(e){
    resetOutput();
    safeMsg("STEP generation failed: "+(e?.message||String(e))+
      "\nNo experimental STEP files were offered. Use the Windows converter if necessary.","error");
    console.error("Browser STEP CAD error",e);
  }finally{busy=false;$("exportButton").disabled=!current;}
}
async function makeZIP(){
  if(!results.length||busy)return;
  try{
    busy=true;$("zipButton").disabled=true;
    const {zipSync,strToU8}=await import(ZIP_URL);
    const archive={};
    for(const item of results)archive[item.filename]=new Uint8Array(await item.blob.arrayBuffer());
    archive["READ-ME-FIRST.txt"]=strToU8(
      "DCB ENG Roll Cage browser STEP POC — NOT a production laser program\n"+
      "Parts: main hoop, one front leg, diagonal. True B-rep STEP solids; test fit and inspect all copes.\n"+
      "Missing: mounting feet, crossing reinforcements, tolerances, weld gaps, machine programming.\n");
    const bytes=zipSync(archive,{level:0});
    const zipBlob=new Blob([bytes],{type:"application/zip"});
    const url=URL.createObjectURL(zipBlob);urls.push(url);
    const link=document.createElement("a");link.href=url;
    link.download=(current?.cutList?.job||"roll-cage")+"-3-step-prototype.zip";
    document.body.append(link);link.click();link.remove();
    safeMsg("ZIP created with three STEP solids and manufacturing cautions. Verify all parts in CAD.","success");
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
$("exportButton").addEventListener("click",generate);
$("zipButton").addEventListener("click",makeZIP);
$("resetButton").addEventListener("click",()=>{
  resetOutput();$("exportButton").disabled=!current;
  safeMsg(current?"Results cleared. Your geometry remains loaded.":"Select geometry to enable export.");
});
try{
  const stored=sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if(stored){current=JSON.parse(stored);showSource();}
}catch(err){safeMsg("Browser session storage unavailable. Choose a geometry JSON file instead.");}
