import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {mkdir} from "node:fs/promises";
import * as brep from "brepjs/quick";
import {checkInputs,generatePreview,developedBendSchedule,bendMarkCSV,bendMarkSVG} from "../roll-cage/browser-step/cad-engine.mjs";

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
 errors:[],OD:44.45,wall:2.6,CLR:90,
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
await fs.writeFile(outDir+'/browser-fixture.json',JSON.stringify(fixture,null,2));
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

const both=await generatePreview(brep,fixture,"left",console.log,"both");
assert.equal(both.length,6,"Both mode contains three bent and three developed straight parts");
const bentParts=both.filter(x=>x.variant==="bent");
const straights=both.filter(x=>x.variant==="straight");
assert.equal(bentParts.length,3);
assert.equal(straights.length,3);
const bothDir=outDir+"/both";
await mkdir(bothDir,{recursive:true});
for(const r of both){
  assert.equal(r.filename.includes("_"),false,"ProCAM filename quantity parser safety");
  assert(r.volume>1);
  await fs.writeFile(bothDir+"/"+r.filename,Buffer.from(await r.blob.arrayBuffer()));
}
assert.equal(new Set(both.map(r=>r.filename)).size,6);
const straightHoop=straights.find(r=>r.id==="main-hoop");
const straightFront=straights.find(r=>r.id==="front-leg-left");
const straightDiagonal=straights.find(r=>r.id==="diagonal-brace");
assert(straightFront.removedVolume>1,"Front leg straightened cope is preserved");
assert(straightDiagonal.removedVolume>1,"Diagonal ends are also preserved when aligned to X");
assert(Math.abs(straightFront.removedVolume-leg.removedVolume)<1.0,"Rigidbody transformation preserves exact front cope volume");
assert(Math.abs(straightDiagonal.removedVolume-diagonal.removedVolume)<1.0,"Rigidbody transformation preserves diagonal cope volume");
const schedule=straightHoop.schedule;
const fl=straightFront.schedule;
assert.equal(schedule.bends.length,2);
assert.equal(fl.bends.length,2);
assert.equal(fl.bends[0].clockFromPreviousDeg,null);
assert(Math.abs(fl.bends[1].clockFromPreviousDeg)!==0,"Nonplanar front leg must have plane rotation");
assert(Math.abs(schedule.developedLength- (2971.238898 || 0))<2,"Developed hoop length is calculated from geometry");
for(const rec of [straightHoop,straightFront,straightDiagonal])
 assert(rec.filename.endsWith("-STRAIGHT.step"));
for(const item of [schedule,fl]){
  for(const b of item.bends){
    assert(b.start>=0 && b.center>b.start && b.end>b.center && b.end<=item.developedLength);
    assert(Math.abs((b.end-b.start)-b.clr*b.angleDeg*Math.PI/180)<.001);
  }
}
const marksCSV=bendMarkCSV(straights.map(x=>x.schedule));
assert.match(marksCSV,/Clock from previous \(deg\)/);
assert.match(marksCSV,/NO BENDS/);
assert.match(marksCSV,/B1/);
assert.match(marksCSV,/FL5/);
const marksSvg=bendMarkSVG(straights.map(x=>x.schedule));
assert.match(marksSvg,/STRAIGHTENED STEP/);
assert.match(marksSvg,/0°/);
await fs.writeFile(bothDir+"/roll-cage-bend-markouts.csv",marksCSV,"utf8");
await fs.writeFile(bothDir+"/roll-cage-bend-markouts.svg",marksSvg,"utf8");
assert.equal((await generatePreview(brep,fixture,"left",()=>{},"straight")).length,3);
await assert.rejects(generatePreview(brep,fixture,"left",()=>{},"unknown"),/Unknown STEP output mode/);
console.log("Both modes: six analytic STEP solids, exact cope preservation, CSV/SVG station marks and clock references validated");

