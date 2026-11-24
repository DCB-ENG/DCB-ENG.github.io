/**
 * DCB ENG browser STEP proof-of-concept.
 * Uses the exact B-rep CAD kernel injected by the host (brepjs + occt-wasm).
 * No meshes are used to construct STEP; all straight tubes are analytic
 * cylinders and bends are circular three-point arcs swept by circular wires.
 *
 * Scope: RC-001 main hoop, RC-002 or RC-003 bent front leg, and RC-005 coped
 * diagonal. Crossing/gusset/mounting constraints are not resolved.
 */
export const SUPPORTED_SCHEMA = ["roll-cage-geometry-v3", "roll-cage-geometry-v4"];
const finite = n => Number.isFinite(Number(n));
const pos = p => {
  if (!p || !finite(p.x) || !finite(p.y) || (p.z !== undefined && !finite(p.z))) throw new Error("Non-finite tube centreline point.");
  return [Number(p.x), Number(p.y), Number(p.z || 0)];
};
const plus = (p, q) => p.map((n,i) => n+q[i]);
const minus = (p,q) => p.map((n,i) => n-q[i]);
const mul = (p,k) => p.map(n => n*k);
const dot = (p,q) => p.reduce((v,n,i) => v+n*q[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = v => Math.hypot(...v);
const unit = v => { const n=length(v); if(n<1e-9)throw new Error("Coincident points cannot form a tube.");return mul(v,1/n); };
const close = (a,b) => length(minus(a,b)) < 1e-5;
const tubeSize = (od,wall) => {
  const D=Number(od),w=Number(wall);
  if(!(D>0 && D<=200 && w>0 && w<D/2)) throw new Error("Tube OD / wall values are invalid.");
  return {D,w};
};
const mainHoop = data => {
  const h=data?.hoop;
  if(!h?.centerlineVertices?.length || !h.bends?.length) throw new Error("A calculated bent main hoop is required.");
  return {id:"main-hoop",points:h.centerlineVertices,bends:h.bends,od:h.OD,wall:h.wall};
};
const frontLeg = (data,side) => {
  const f=data?.frontStructure;
  if (!f || f.errors?.length || !f[side] || f[side].errors?.length) throw new Error("Enable and calculate continuous front legs in the generator before STEP export.");
  return {id:"front-leg-"+side,side,points:f[side].points,bends:f[side].bends,od:f.OD,wall:f.wall};
};
const diagonal = data => {
  const b=data?.brace;
  if(!b?.upper || !b?.lower) throw new Error("Enable a diagonal brace in the generator before STEP export.");
  return {id:"diagonal-brace",from:b.upper,to:b.lower,od:b.OD,wall:b.wall};
};

export function checkInputs(data,side="left") {
  if(!SUPPORTED_SCHEMA.includes(data?.schema))throw new Error("Only current Roll Cage Generator v3/v4 geometry JSON is supported.");
  if(side!=="left" && side!=="right")throw new Error("Select left or right front leg.");
  const parts=[mainHoop(data),frontLeg(data,side),diagonal(data)];
  for(const part of parts)tubeSize(part.od,part.wall);
  for(const part of parts.slice(0,2)){
    if(part.points.length!==part.bends.length+2)throw new Error(part.id+": geometry stations must match bends.");
    for(const b of part.bends){
      pos(b.entry);pos(b.midPoint);pos(b.exit);
    }
    part.points.forEach(pos);
  }
  pos(parts[2].from);pos(parts[2].to);
  return parts;
}

function makeSpine(brep,formed) {
  const edges=[];
  let prev=pos(formed.points[0]);
  for(const b of formed.bends){
    const entry=pos(b.entry), mid=pos(b.midPoint), exit=pos(b.exit);
    if(!close(prev,entry))edges.push(brep.line(prev,entry));
    edges.push(brep.threePointArc(entry,mid,exit));
    prev=exit;
  }
  const end=pos(formed.points.at(-1));
  if(!close(prev,end))edges.push(brep.line(prev,end));
  if(!edges.length)throw new Error(formed.id+": missing spine edges.");
  return brep.unwrap(brep.wire(edges));
}

// Two real semicircular edges make the analytical cross-section. This avoids
// assumptions about default circle axes in the JS CAD library.
function makeRing(brep,start,tangent,radius) {
  const n=unit(tangent),axis=Math.abs(n[0])<0.8?[1,0,0]:[0,0,1];
  const u=unit(cross(n,axis)),v=unit(cross(n,u));
  const A=plus(start,mul(u,radius)),B=plus(start,mul(v,radius));
  const C=plus(start,mul(u,-radius)),D=plus(start,mul(v,-radius));
  return brep.unwrap(brep.wire([
    brep.threePointArc(A,B,C),
    brep.threePointArc(C,D,A)
  ]));
}
function solidVolume(brep,solid,label,minimum) {
  const value=brep.shape(solid).volume();
  if(!Number.isFinite(value)||value<=minimum)
    throw new Error(label+": CAD kernel returned an empty or invalid-volume solid.");
  return value;
}
function formedTube(brep,m){
  const {D,w}=tubeSize(m.od,m.wall);
  const path=makeSpine(brep,m),p0=pos(m.points[0]),b0=pos(m.bends[0].entry);
  const tangent=unit(minus(b0,p0));
  const envelope=brep.shape(makeRing(brep,p0,tangent,D/2)).sweep(path).val;
  const cavity=brep.shape(makeRing(brep,p0,tangent,D/2-w)).sweep(path).val;
  const hollow=brep.shape(envelope).cut(cavity).val;
  solidVolume(brep,hollow,m.id,10);
  return {solid:hollow,envelope};
}
function straightTube(brep,m){
  const {D,w}=tubeSize(m.od,m.wall);
  const p=pos(m.from),q=pos(m.to),d=minus(q,p),L=length(d),axis=unit(d);
  if(L < D)throw new Error(m.id+": centreline span shorter than tube diameter.");
  const envelope=brep.cylinder(D/2,L,{at:p,axis});
  const cavity=brep.cylinder(D/2-w,L+0.04,{at:plus(p,mul(axis,-.02)),axis});
  const hollow=brep.shape(envelope).cut(cavity).val;
  solidVolume(brep,hollow,m.id,10);
  return {solid:hollow,envelope};
}
function copeWithParent(brep,member,parent,label){
  const before=solidVolume(brep,member.solid,label,10);
  const coped=brep.shape(member.solid).cut(parent.envelope).val;
  const after=solidVolume(brep,coped,label,1);
  if(after>before+0.01 || after<before*.55)
    throw new Error(label+": coping result removed an implausible amount of material.");
  return {...member,solid:coped,removedVolume:before-after};
}

const deg = r => r * 180 / Math.PI;
const clip = n => Math.max(-1,Math.min(1,n));
const safeNumber = n => Number.isFinite(Number(n));
const normalOfBend = b => {
  const e=pos(b.entry),m=pos(b.midPoint),x=pos(b.exit);
  return unit(cross(minus(m,e),minus(x,m)));
};

/** Exact developed arc station, independently verified against model CLR/total. */
export function developedBendSchedule(part,data){
  if(!part.bends?.length)throw Error(part.id+": expected a bent member.");
  const radius=Number(part.id==="main-hoop"?data.hoop.CLR:data.frontStructure.CLR);
  if(!Number.isFinite(radius)||radius<=0)throw Error(part.id+": invalid bend CLR.");
  let running=0,previous=pos(part.points[0]),previousNormal=null,previousExit=null;
  const bends=[];
  for(let i=0;i<part.bends.length;i++){
    const b=part.bends[i],e=pos(b.entry),m=pos(b.midPoint),x=pos(b.exit);
    const straight=length(minus(e,previous));
    if(straight<=.0001)throw Error(part.id+": invalid first/preceding straight for B"+(i+1));
    const ab=length(minus(e,m)),bc=length(minus(m,x)),ac=length(minus(e,x));
    const twiceArea=length(cross(minus(m,e),minus(x,e)));
    if(twiceArea<1e-8)throw Error(part.id+": collinear bend arc.");
    const geometricRadius=ab*bc*ac/(2*twiceArea);
    if(Math.abs(radius-geometricRadius)>Math.max(.1,radius*.002))
      throw Error(part.id+": B"+(i+1)+" centreline radius differs from geometry.");
    const geometricAngle=deg(2*Math.asin(clip(ac/(2*geometricRadius))));
    const angle=Number(b.angleDeg??b.angle??(b.angleRad===undefined?geometricAngle:deg(b.angleRad)));
    if(!Number.isFinite(angle)||angle<=0||angle>=179)
      throw Error(part.id+": invalid bend angle at B"+(i+1));
    if(Math.abs(geometricAngle-angle)>.15)
      throw Error(part.id+": angle and arc disagree at B"+(i+1));
    const normal=normalOfBend(b),arc=radius*angle*Math.PI/180;
    let clock=null;
    if(previousNormal){
      const between=unit(minus(e,previousExit));
      clock=deg(Math.atan2(dot(between,cross(previousNormal,normal)),dot(previousNormal,normal)));
    }
    const start=running+straight,end=start+arc;
    bends.push({name:"B"+(i+1),start,center:start+arc/2,end,arc,angleDeg:angle,clr:radius,
      straightBefore:straight,clockFromPreviousDeg:clock});
    running=end;previous=x;previousExit=x;previousNormal=normal;
  }
  const lastStraight=length(minus(pos(part.points.at(-1)),previous));
  if(lastStraight<=.0001)throw Error(part.id+": invalid final straight.");
  const developedLength=running+lastStraight;
  const saved=Number(part.id==="main-hoop"?data.hoop.totalCenterlineLength:data.frontStructure?.[part.side]?.total);
  if(Number.isFinite(saved)&&Math.abs(developedLength-saved)>.25)
    throw Error(part.id+": developed span does not match the existing bend table.");
  if(part.side && Number.isFinite(Number(data.frontStructure?.[part.side]?.clock)) && bends.length===2){
    const given=Number(data.frontStructure[part.side].clock);
    if(Math.abs(bends[1].clockFromPreviousDeg-given)>.5)
      throw Error(part.id+": signed clock does not match the front-leg bend schedule.");
  }
  const member=data.cutList?.parts?.find(p=>p.id===part.id);
  const totalBlank=Number(member?.blank);
  const prepBlankLength=Number.isFinite(totalBlank)&&totalBlank>=developedLength-.1?totalBlank:developedLength;
  if(prepBlankLength<developedLength-.1)throw Error(part.id+": blank is shorter than developed length.");
  const allowancePerEnd=Math.max(0,(prepBlankLength-developedLength)/2);
  return {id:part.id,partNumber:partID(data,part.id),
    datum:part.id==="main-hoop"?"LEFT MAIN-HOOP FOOT":"FL5 / MAIN-HOOP ATTACHMENT",
    farEnd:part.id==="main-hoop"?"RIGHT MAIN-HOOP FOOT":"FL1 / FRONT FOOT",
    developedLength,prepBlankLength,allowancePerEnd,bends,lastStraight,
    radialZero:"0° = +Y radial of straight STEP; aligned to projected vehicle UP on initial tangent (vehicle FRONT if vertical)",
    clockConvention:"Signed right-hand rule about the intermediate straight, along tube feed +X",
    note:"STEP is the developed centreline length; extra trim stock and bend marks are NOT cut/etched into the solid."};
}
function straightMemberSchedule(part,data){
  const L=length(minus(pos(part.to),pos(part.from)));
  const meta=data.cutList?.parts?.find(p=>p.id===part.id);
  const b=Number(meta?.blank);
  const blank=Number.isFinite(b)&&b>=L?b:L;
  return {id:part.id,partNumber:partID(data,part.id),datum:"UPPER MAIN-HOOP JOINT",
    farEnd:"LOWER MAIN-HOOP JOINT",developedLength:L,prepBlankLength:blank,
    allowancePerEnd:(blank-L)/2,lastStraight:L,bends:[],
    radialZero:"0° = +Y radial of straight STEP; projected vehicle UP",
    clockConvention:"No bends",note:"Straight diagonal; both fishmouths retained after local-axis alignment."};
}
function rotateRodrigues(v,axis,theta){
  const c=Math.cos(theta),sin=Math.sin(theta);
  return plus(plus(mul(v,c),mul(cross(axis,v),sin)),mul(axis,dot(axis,v)*(1-c)));
}
function coordinatePose(origin,tangent){
  const start=Array.isArray(origin)?origin:pos(origin);
  const t=unit(tangent),eX=[1,0,0],c=clip(dot(t,eX));
  let axis=cross(t,eX),angle=0;
  if(length(axis)>1e-9){axis=unit(axis);angle=Math.acos(c);}
  else if(c<0){axis=unit(cross(t,[0,1,0]));angle=Math.PI;}
  const project=v=>minus(v,mul(t,dot(t,v)));
  let zero=project([0,1,0]);
  if(length(zero)<1e-7)zero=project([0,0,-1]);
  if(length(zero)<1e-7)zero=project([1,0,0]);
  zero=unit(zero);
  const swung=angle?rotateRodrigues(zero,axis,angle):zero;
  const roll=-Math.atan2(swung[2],swung[1]);
  return {origin:start,axis,angleDeg:deg(angle),rollDeg:deg(roll),radialZeroWorld:zero};
}
function localizeSolid(brep,solid,pose){
  let shape=brep.shape(solid).translate(mul(pose.origin,-1));
  if(Math.abs(pose.angleDeg)>1e-8)shape=shape.rotate(pose.angleDeg,{axis:pose.axis,at:[0,0,0]});
  if(Math.abs(pose.rollDeg)>1e-8)shape=shape.rotate(pose.rollDeg,{axis:[1,0,0],at:[0,0,0]});
  return shape.val;
}
/** Recreate the cope with the receiving parent rigidly oriented at its end. */
function straightenedMember(brep,part,original,parent,schedule){
  const start=pos(part.points?.[0]||part.from);
  const toward=pos(part.bends?.[0]?.entry||part.to);
  const pose=coordinatePose(start,minus(toward,start));
  const straight=straightTube(brep,{id:part.id,from:{x:0,y:0,z:0},
    to:{x:schedule.developedLength,y:0,z:0},od:part.od,wall:part.wall});
  if(!parent)return {...straight,pose,removedVolume:0};
  const transformedParent={envelope:localizeSolid(brep,parent.envelope,pose)};
  const coped=copeWithParent(brep,straight,transformedParent,part.id+" straightened");
  const before=Number(original.removedVolume)||0,after=Number(coped.removedVolume)||0;
  if(Math.abs(before-after)>Math.max(1,before*.003))
    throw Error(part.id+": cope geometry was not preserved in the straight tube.");
  return {...coped,pose};
}
export function bendMarkCSV(schedules){
  const cols=["Part number","Member","Datum at X=0","Far end","Developed centreline (mm)",
    "Prep blank (mm)","Extra allowance per end (mm)","Bend",
    "Start X (mm)","Centre X (mm)","End X (mm)","Bend angle (deg)",
    "CLR (mm)","Straight before (mm)","Clock from previous (deg)",
    "Radial 0 degree reference","Clock convention","Notes"];
  const rows=[cols];
  for(const part of schedules){
    for(const b of part.bends.length?part.bends:[null]){
      rows.push([part.partNumber,part.id,part.datum,part.farEnd,
        part.developedLength,part.prepBlankLength,part.allowancePerEnd,b?.name||"NO BENDS",
        b?.start??"",b?.center??"",b?.end??"",b?.angleDeg??"",b?.clr??"",
        b?.straightBefore??"",b?.clockFromPreviousDeg??"",
        part.radialZero,part.clockConvention,part.note]);
    }
  }
  // Protect CSV open in spreadsheet programs against user-supplied formula payloads.
  const cell=v=>{
    const txt=String(v);
    const clean=/^[\s]*[=+@-]/.test(txt)&&!Number.isFinite(Number(txt))?"'"+txt:txt;
    return '"'+clean.replaceAll('"','""')+'"';
  };
  return "\ufeff"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
}
export function bendMarkSVG(schedules){
  const height=80+schedules.length*212;
  const safe=t=>String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const rows=schedules.map((p,i)=>{
    const base=65+i*212,left=54,right=906,L=p.developedLength,X=s=>left+(right-left)*s/L;
    const title=safe(p.partNumber+" · "+p.id+" · developed "+L.toFixed(1)+" mm; extra trim "+p.allowancePerEnd.toFixed(1)+" mm/end");
    const marks=p.bends.map((b,j)=>{
      const y=base+40;
      const ticks=[[b.start,"#f9c773","S"],[b.center,"#76d8e7","C"],[b.end,"#b9a1fa","E"]];
      return '<g>'+ticks.map(([s,c,n])=>'<line x1="'+X(s).toFixed(3)+'" y1="'+(y-18)+'" x2="'+X(s).toFixed(3)+'" y2="'+(y+43)+'" stroke="'+c+'" stroke-width="2"><title>'+safe(b.name+" "+n+" "+s.toFixed(2)+" mm")+'</title></line>').join("")+
        '<text x="'+X(b.center).toFixed(3)+'" y="'+(base+91+j%2*15)+'" fill="#ffe1bb" text-anchor="middle" font-size="11">'+safe(b.name+" "+b.angleDeg.toFixed(1)+"°")+'</text></g>';
    }).join("");
    return '<g><text x="'+left+'" y="'+(base-8)+'" fill="#ffaf65" font-family="Arial" font-size="15" font-weight="700">'+title+'</text>'+
      '<rect x="'+left+'" y="'+(base+22)+'" width="'+(right-left)+'" height="30" fill="#414e57" stroke="#adbac3"/>'+
      marks+'<text x="'+left+'" y="'+(base+125)+'" fill="#e3e9ed" font-size="12">'+safe("DATUM: "+p.datum+" → "+p.farEnd)+'</text>'+
      '<text x="'+left+'" y="'+(base+145)+'" fill="#b4c2cb" font-size="11">'+safe(p.radialZero)+'</text>'+
      '<text x="'+left+'" y="'+(base+164)+'" fill="#b4c2cb" font-size="11">'+safe(p.clockConvention)+'</text></g>';
  }).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="'+height+'" viewBox="0 0 960 '+height+'">'+
    '<rect width="960" height="'+height+'" fill="#11181e"/>'+
    '<text x="54" y="29" fill="#ffa64a" font-size="19" font-family="Arial" font-weight="700">STRAIGHTENED STEP · BEND MARKOUT</text>'+
    '<text x="54" y="46" fill="#c0ccd3" font-size="11">Positions are X distances from finished theoretical end — NOT a 1:1 drawing, NOT bender feed marks or automatic laser etches.</text>'+
    rows+'</svg>';
}

function partID(data,id){
  return data?.cutList?.parts?.find(p=>p.id===id)?.partNumber ||
    ({'main-hoop':'RC-001','front-leg-left':'RC-002','front-leg-right':'RC-003','diagonal-brace':'RC-005'})[id];
}
function fileName(id,number){return String(number||id).replace(/[^a-z0-9-]/gi,'-')+"-"+id+".step";}


function fileRecord(brep,data,part,solid,variant,schedule){
  const filename=fileName(part.id,partID(data,part.id)).replace(".step","-"+variant.toUpperCase()+".step");
  const volume=solidVolume(brep,solid.solid,filename,1);
  const blob=brep.unwrap(brep.exportSTEP(solid.solid));
  return {filename,blob,volume,id:part.id,partNumber:partID(data,part.id),
    variant,removedVolume:solid.removedVolume||0,schedule};
}
async function completeRecord(r){
  if(!(r.blob instanceof Blob)||r.blob.size<2000)throw Error(r.filename+": no STEP binary produced.");
  if(!(await r.blob.slice(0,100).text()).toUpperCase().includes("ISO-10303-21"))
    throw Error(r.filename+": invalid STEP file header.");
  return r;
}
export async function generatePreview(brep,data,side="left",report=()=>{},mode="bent"){
  if(!["bent","straight","both"].includes(mode))throw Error("Unknown STEP output mode.");
  const [hoopPart,legPart,bracePart]=checkInputs(data,side);
  const out=[],schedules=[
    developedBendSchedule(hoopPart,data),
    developedBendSchedule(legPart,data),
    straightMemberSchedule(bracePart,data)
  ];
  report("Building analytic bent cage models...");
  const hoop=formedTube(brep,hoopPart);
  const front=copeWithParent(brep,formedTube(brep,legPart),hoop,legPart.id);
  const brace=copeWithParent(brep,straightTube(brep,bracePart),hoop,bracePart.id);
  const originals=[hoop,front,brace],parts=[hoopPart,legPart,bracePart];
  if(mode!=="straight"){
    for(let i=0;i<parts.length;i++){
      report("Validating finished "+parts[i].id+"...");
      out.push(await completeRecord(fileRecord(brep,data,parts[i],originals[i],"bent",schedules[i])));
    }
  }
  if(mode!=="bent"){
    report("Developing circular arcs into straight, centreline-length tube blanks...");
    const flattened=[
      straightenedMember(brep,hoopPart,hoop,null,schedules[0]),
      straightenedMember(brep,legPart,front,hoop,schedules[1]),
      straightenedMember(brep,bracePart,brace,hoop,schedules[2])
    ];
    for(let i=0;i<parts.length;i++){
      report("Checking preserved cope orientation and STEP topology: "+parts[i].id+"...");
      out.push(await completeRecord(fileRecord(brep,data,parts[i],flattened[i],"straight",schedules[i])));
    }
  }
  report(out.length+" genuine B-rep STEP solids generated; review in ProCAM before cutting.");
  return out;
}
