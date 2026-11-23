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
  return {id:"front-leg-"+side,points:f[side].points,bends:f[side].bends,od:f.OD,wall:f.wall};
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
function partID(data,id){
  return data?.cutList?.parts?.find(p=>p.id===id)?.partNumber ||
    ({'main-hoop':'RC-001','front-leg-left':'RC-002','front-leg-right':'RC-003','diagonal-brace':'RC-005'})[id];
}
function fileName(id,number){return String(number||id).replace(/[^a-z0-9-]/gi,'-')+"-"+id+".step";}

export async function generatePreview(brep,data,side="left",report=()=>{}){
  const [h,f,d]=checkInputs(data,side);
  const outputs=[];
  report("Generating true circular-bend main hoop…");
  const hoop=formedTube(brep,h);
  report("Generating and coping the bent "+side+" front leg…");
  const front=copeWithParent(brep,formedTube(brep,f),hoop,f.id);
  report("Generating and coping the diagonal at both main-hoop ends…");
  const brace=copeWithParent(brep,straightTube(brep,d),hoop,d.id);
  for(const [m,solid] of [[h,hoop],[f,front],[d,brace]]){
    report("Validating "+m.id+" and writing STEP…");
    const volume=solidVolume(brep,solid.solid,m.id,1);
    const result=brep.unwrap(brep.exportSTEP(solid.solid));
    if(!(result instanceof Blob) || result.size<2000)
      throw new Error(m.id+": STEP export returned no usable file.");
    const header=(await result.slice(0,100).text()).toUpperCase();
    if(!header.includes("ISO-10303-21"))
      throw new Error(m.id+": STEP header failed validation.");
    outputs.push({
      id:m.id,partNumber:partID(data,m.id),
      filename:fileName(m.id,partID(data,m.id)),
      blob:result,volume,removedVolume:solid.removedVolume||0,
      note:m.id==="main-hoop"?"Square mounting ends — no foot plates modelled":
        "Analytic cope only; fit-up and weld-gap approval required"
    });
  }
  report("Three analytical STEP solids generated. Inspect them in CAD before cutting.");
  return outputs;
}
