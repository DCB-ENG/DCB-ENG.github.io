import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {mkdir} from "node:fs/promises";
import * as brep from "brepjs/quick";
import {checkInputs,generatePreview} from "../roll-cage/browser-step/cad-engine.mjs";

const fixture=JSON.parse(await fs.readFile(new URL("./fixtures/roll-cage-step-smoke.json",import.meta.url),"utf8"));
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const scale=(a,k)=>a.map(n=>n*k);
const norm=a=>{const l=Math.hypot(...a);return scale(a,1/l)};
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const toObj=p=>({x:p[0],y:p[1],z:p[2]});
function fillet(points,R){
 const corners=[];
 for(let i=1;i<points.length-1;i++){
  const start=points[i-1],vertex=points[i],end=points[i+1];
  const vin=norm(subtract(vertex,start)),vout=norm(subtract(end,vertex));
  const c=Math.max(-1,Math.min(1,dot(vin,vout))),angle=Math.acos(c);
  const trim=R*Math.tan(angle/2);
  const n=norm(subtract(vout,scale(vin,c)));
  const entry=add(vertex,scale(vin,-trim)),exit=add(vertex,scale(vout,trim));
  const mid=add(entry,add(scale(vin,R*Math.sin(angle/2)),scale(n,R*(1-Math.cos(angle/2)))));
  corners.push({entry:toObj(entry),midPoint:toObj(mid),exit:toObj(exit)});
 }
 return corners;
}
const frontVertices=[
 [0,700,0],[0,700,-600],[0,500,-850],[0,0,-850]
];
fixture.frontStructure={
 errors:[],OD:44.45,wall:2.6,
 left:{errors:[],points:frontVertices.map(toObj),bends:fillet(frontVertices,90)}
};
fixture.cutList={
 job:"TEST",
 parts:[
  {id:"main-hoop",partNumber:"TEST-RC-001",od:44.45,wall:2.6},
  {id:"front-leg-left",partNumber:"TEST-RC-002",od:44.45,wall:2.6},
  {id:"diagonal-brace",partNumber:"TEST-RC-005",od:38.1,wall:2.6}
 ]};
const parts=checkInputs(fixture);
assert.equal(parts.length,3);
assert.deepEqual(parts.map(x=>x.id),["main-hoop","front-leg-left","diagonal-brace"]);
if(typeof brep.init==="function")await brep.init();
const records=await generatePreview(brep,fixture,"left",(msg)=>console.log("[STEP]",msg));
assert.equal(records.length,3);
const outDir=process.argv[2]||"/tmp/dcb-browser-step";
await mkdir(outDir,{recursive:true});
for(const record of records){
 assert(record.blob.size>2000);
 assert(record.volume>10);
 const content=Buffer.from(await record.blob.arrayBuffer());
 const text=content.toString("latin1");
 assert.match(text.slice(0,300),/ISO-10303-21/);
 assert(!record.filename.includes("_"),"ProCAM quantity filename safety");
 await fs.writeFile(outDir+"/"+record.filename,content);
 console.log(record.filename,content.length,"bytes",Math.round(record.volume),"mm^3",record.removedVolume||0,"mm^3 cope removed");
}
const diagonal=records.find(x=>x.id==="diagonal-brace");
assert(diagonal.removedVolume>1,"Both copes must remove finite solid material");
const leg=records.find(x=>x.id==="front-leg-left");
assert(leg.removedVolume>1,"Front-leg rear cope must remove finite solid material");
console.log("Browser/Node B-rep STEP prototype created three true solids and passed volume/header checks.");
