const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('roll-cage/index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
assert.equal(scripts.length,1,'Expected one inline calculator script');
new vm.Script(scripts[0],{filename:'roll-cage/index.html'});
const els = new Map();
for(const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const tag=m[1],attrs=m[2],id=m[3],value=(attrs.match(/\bvalue="([^"]*)"/)||[])[1]||'';
  els.set(id,{id,tag,value,checked:/\bchecked\b/.test(attrs),innerHTML:'',textContent:'',disabled:false,style:{},classList:{toggle(){}},setAttribute(){},addEventListener(type,cb){this.events[type]=cb},events:{},cloneNode(){return this;}});
}
for(const [id,val] of [['braceUpperSide','right'],['doorSides','both']])els.get(id).value=val;
const document={
  getElementById(id){assert(els.has(id),'Missing UI element: '+id);return els.get(id);},
  querySelectorAll(){return [];}
};
const ctx=vm.createContext({document,window:{},navigator:{},console,Blob:class{},URL:{},XMLSerializer:class{},setTimeout(){},alert(){}});
const injected=scripts[0].replace(/  updateRulesClass\(\);updateFrontControls\(\);render\(\);\s*\}\)\(\);\s*$/, '  updateRulesClass();updateFrontControls();render(); window.__inspectRollCage=()=>latest; window.__inspectCutCSV=()=>cageCutCSV(latest.cutList); window.__inspectCutPrint=()=>cageCutPrintHTML(latest.cutList); window.__bendCSV=()=>cageBendMarkCSV(latest.bendMarkList); window.__bendPrint=()=>cageBendMarkPrintHTML(latest.bendMarkList);\n})();');
assert.notEqual(injected,scripts[0],'Test probe injection must match script tail');
vm.runInContext(injected,ctx,{timeout:12000,filename:'roll-cage/index.html'});
function isSpan(id){assert.match(els.get(id).textContent,/^\d+[.]?\d* mm$/,'Missing computed span for '+id);}
isSpan('developed');isSpan('braceSpan');isSpan('staySpan');isSpan('harnessSpan');isSpan('doorSpan');
const initialScene=ctx.window.dcbCage3DSnapshot;
assert(initialScene&&Array.isArray(initialScene.tubes),'3D snapshot is published after the first render');
assert.equal(initialScene.tubes.length,7,'Default 3D cage is seven continuous physical tubes');
const mainTube=initialScene.tubes.find(t=>t.id==='main-hoop');
assert(mainTube&&mainTube.points.length>12,'Main hoop is a sampled curved 3D tube, not square-corner linework');
assert.equal(mainTube.od,44.45,'3D tube OD follows the selected main hoop CHS');
assert(mainTube.points.every(p=>p.length===3&&p.every(Number.isFinite)&&Math.abs(p[2])<1e-9),'Main hoop remains in the rear datum plane');
assert(initialScene.tubes.filter(t=>t.group==='stays').length===2,'Both rear stays appear separately in 3D');
assert(initialScene.tubes.some(t=>t.group==='harness'),'Rear-stay crossbar is included in 3D');
assert(initialScene.tubes.some(t=>t.group==='door'),'Door bars are included in 3D');
const initialStay=initialScene.tubes.find(t=>t.id==='stay-left');
assert(initialStay.points.at(-1)[2]>0,'Rear stay footing extends rearward of the hoop');
const initialDoor=initialScene.tubes.find(t=>t.group==='door');
assert(initialDoor.points.at(-1)[2]<0,'Door bars extend toward the front of the vehicle');

const initialPreflight=ctx.window.dcbCagePreflight;
assert(initialPreflight&&initialPreflight.ready,'Default cage must pass essential fabrication checks');
assert.equal(initialPreflight.blockers.length,0);
assert(!els.get('sendCageToNesting').disabled,'Valid default cage may be sent to the existing nesting page');
els.get('braceWall').value='30';els.get('braceWall').events.input();
assert(!ctx.window.dcbCagePreflight.ready,'Selected diagonal with impossible wall thickness blocks fabrication');
assert(ctx.window.dcbCagePreflight.blockers.some(x=>x.includes('diagonal')),
  'Invalid diagonal must be specifically identified by the preflight');
assert.equal(els.get('sendCageToNesting').disabled,true,'Nesting must be disabled on incomplete cage geometry');
assert.equal(els.get('saveCageCutCSV').disabled,true,'Incomplete cage must not silently export a partial cut list');
assert.equal(els.get('printCageBendList').disabled,true,'Incomplete cage must block bend mark exports');
els.get('braceWall').value='2.6';els.get('braceWall').events.input();
assert(ctx.window.dcbCagePreflight.ready,'Correcting the tube size clears blocking errors');
assert.equal(els.get('sendCageToNesting').disabled,false,'Nesting re-enables after geometry is corrected');
const initialMarkouts=ctx.window.__inspectRollCage().memberMarkouts;
assert.equal(initialMarkouts.length,7,'Default enabled set: main hoop, diagonal, two rear stays, harness and two intrusion bars');

const initialCut=ctx.window.__inspectRollCage().cutList;
assert.equal(initialCut.count,7,'The original seven enabled pieces are all in the numbered cut list');
const initialBends=ctx.window.__inspectRollCage().bendMarkList;
assert.equal(initialBends.tubeCount,7,'All seven enabled tubes have a bend-mark entry');
assert.equal(initialBends.bentTubeCount,1,'Only the main hoop requires bending before front legs are enabled');
assert.equal(initialBends.bendCount,2,'Default U-hoop yields two bends');
assert.deepEqual(Array.from(initialBends.tubes,t=>t.partNumber),['RC-001','RC-005','RC-006','RC-007','RC-008','RC-009','RC-010']);
assert(initialBends.tubes.slice(1).every(t=>t.bends.length===0),'All straight braces/stays/bars have zero bend marks');
for(const t of initialBends.tubes)for(const b of t.bends){
  assert(b.start>=0&&b.start<=b.mid&&b.mid<=b.end&&b.end<=t.blank,'Developed marks stay inside square blank');
  assert(Number.isFinite(b.clr)&&b.clr>0,'Each bend has an actual die CLR');
}
assert.match(els.get('cageBendListCount').textContent,/7 tubes · 1 bent members · 2 bends/);
assert.match(els.get('cageBendListBody').innerHTML,/RC-001/);
assert.match(els.get('cageBendListBody').innerHTML,/NO BENDS/i);
assert.match(els.get('cageBendListBody').innerHTML,/No bends/);
assert.match(els.get('cageBendListBody').innerHTML,/start \(mm\)/i);
assert.match(ctx.window.__bendCSV(),/Part number/);
assert.match(ctx.window.__bendCSV(),/Bend centre from datum \(mm\)/);
assert.match(ctx.window.__bendCSV(),/NO BENDS/);
assert.match(ctx.window.__bendPrint(),/A4 landscape/);
assert.match(ctx.window.__bendPrint(),/RC-001/);
assert.match(ctx.window.__bendPrint(),/NO BENDS/);

assert.deepEqual(Array.from(initialCut.rows,p=>p.partNumber),['RC-001','RC-005','RC-006','RC-007','RC-008','RC-009','RC-010'],'Stable part numbers do not depend on optional parts');
assert.equal(initialCut.groups.length,2,'Default CHS sizes are grouped');
assert(Math.abs(initialCut.totalBlank-initialCut.rows.reduce((n,p)=>n+p.blank,0))<.000001,'Prep blank total matches member sum');
assert(initialCut.totalBlank>initialCut.totalSpan,'Prep blank total includes tube preparation allowance');
assert.match(els.get('cageCutCount').textContent,/7 tubes/);
assert.match(els.get('cageCutBody').innerHTML,/RC-001/);
assert.match(els.get('cageCutBody').innerHTML,/RC-010/);
assert.match(els.get('cageCutSummary').innerHTML,/combined prep-blank lengths/);
assert.match(els.get('memberMarkoutCards').innerHTML,/RC-005/,'Individual marking cards include stable part numbers');
assert.match(els.get('jointNotchCards').innerHTML,/PART RC-005/,'Fishmouth SVG identifies matching diagonal part');
assert.match(els.get('jointNotchCards').innerHTML,/PART RC-008/,'Harness fishmouth SVG uses same cut-list part ID');
assert.match(ctx.window.__inspectCutCSV(),/Part number/);
assert.match(ctx.window.__inspectCutCSV(),/RC-010/);
assert.match(ctx.window.__inspectCutPrint(),/RC-001/);
assert.match(ctx.window.__inspectCutPrint(),/Totals by CHS size/);
assert.match(ctx.window.__inspectCutPrint(),/A4 landscape/);
assert.match(ctx.window.__inspectCutPrint(),/NOT the finished tip-to-tip cut length/);
els.get('cageJobRef').value='45186';els.get('cageJobRef').events.input();
assert.equal(ctx.window.__inspectRollCage().cutList.rows[0].partNumber,'45186-RC-001');
assert.match(els.get('memberMarkoutCards').innerHTML,/45186-RC-005/);
assert.match(els.get('cageBendListBody').innerHTML,/45186-RC-005/);
assert.match(ctx.window.__bendCSV(),/45186-RC-001/);
assert.match(ctx.window.__bendPrint(),/45186-RC-001/);
assert.match(els.get('jointNotchCards').innerHTML,/PART 45186-RC-005/,'Changing the job also updates the finished fishmouth template ID');
assert.match(ctx.window.__inspectCutCSV(),/45186-RC-005/);
els.get('cageMaterial').value='CDS & <Grade>';els.get('cageMaterial').events.input();
assert.match(els.get('cageCutSummary').innerHTML,/CDS &amp; &lt;Grade&gt;/,'User-entered material escaped in webpage');
assert.match(ctx.window.__inspectCutCSV(),/CDS & <Grade>/,'Raw material description retained in quoted CSV');
assert.match(ctx.window.__inspectCutPrint(),/CDS &amp; &lt;Grade&gt;/,'Print sheet escapes user-provided material');
assert.match(ctx.window.__bendPrint(),/CDS &amp; &lt;Grade&gt;/,'Bend print sheet also safely escapes material');
els.get('cageJobRef').value='';els.get('cageJobRef').events.input();
els.get('cageMaterial').value='';els.get('cageMaterial').events.input();
assert.equal(ctx.window.__inspectRollCage().cutList.rows[0].partNumber,'RC-001');
assert.match(els.get('jointNotchCards').innerHTML,/PART RC-005/,'Clearing job reference restores standard template IDs');

assert.deepEqual(Array.from(initialMarkouts,m=>m.id),[
  'main-hoop','diagonal-brace','rear-stay-left','rear-stay-right','harness-bar','side-intrusion-left','side-intrusion-right'
]);
assert.equal(initialMarkouts[0].bends.length,2,'Main hoop is a two-bend tube in default mode');
assert.equal(initialMarkouts[1].bends.length,0,'Diagonal brace is straight and has no invented bend marks');
for(const m of initialMarkouts){
  assert(m.blank>=m.span&&m.span>0,'Blank and span must be finite positive for '+m.id);
  assert(Math.abs(m.blank-m.span-2*m.extra)<0.01,'Blank must equal theoretical span plus two end allowances for '+m.id);
  for(const b of m.bends)assert(b.start<=b.mid&&b.mid<=b.end&&b.end<=m.blank,'Bend marks stay within blank for '+m.id);
}
assert.match(els.get('memberMarkoutCount').textContent,/7 individual tubes/);
assert.match(els.get('memberMarkoutCards').innerHTML,/DATUM \/ 0 mm/);
assert.match(els.get('memberMarkoutCards').innerHTML,/Main-hoop diagonal brace/);
assert.match(els.get('memberMarkoutCards').innerHTML,/REAR \/ MAIN HOOP/);
assert.match(els.get('memberMarkoutCards').innerHTML,/THEORETICAL JOINT-CENTRE SPAN/);
assert.match(els.get('memberMarkoutCards').innerHTML,/Save this tube SVG/);
assert.match(els.get('memberMarkoutCards').innerHTML,/Print this tube/);
assert.match(html,/A4 landscape/,'Dedicated mark-out print sheet uses landscape pages');

assert.match(els.get('stayPlanSvg').innerHTML,/Harness/);
assert.match(els.get('doorSideSvg').innerHTML,/Forward/);
assert.match(els.get('doorPlanSvg').innerHTML,/Front joints/);
assert.match(els.get('addonsBody').innerHTML,/Harness crossbar/);
assert.match(els.get('addonsBody').innerHTML,/side intrusion/);
assert.match(els.get('drawingSvg').innerHTML,/Harness/);
els.get('mode4').events.click();isSpan('harnessSpan');isSpan('doorSpan');
assert.equal(ctx.window.__inspectRollCage().bendMarkList.bendCount,4,'Four bend main hoop adds all four marks to all-tube schedule');
assert.equal(ctx.window.__inspectRollCage().memberMarkouts.find(m=>m.id==='main-hoop').bends.length,4,
  'Four bend tapered hoop has four bend-mark triples in its individual sheet');
assert.match(els.get('drawingSvg').innerHTML,/Shoulder/);
els.get('doorSides').value='left';els.get('doorSides').events.change();
assert.match(els.get('addonsBody').innerHTML,/Left side intrusion/);
assert.doesNotMatch(els.get('addonsBody').innerHTML,/Right side intrusion/);
assert.equal(ctx.window.__inspectRollCage().memberMarkouts.length,6,'Left-only intrusion produces one tube sheet');
assert.equal(ctx.window.__inspectRollCage().cutList.count,6);
assert.equal(ctx.window.__inspectRollCage().bendMarkList.tubeCount,6,'Optional right bar removed from bend list');
assert(!ctx.window.__inspectRollCage().cutList.rows.some(p=>p.partNumber==='RC-010'),'Right side part removed without renumbering left');

els.get('harnessHeight').value='1600';els.get('harnessHeight').events.input();
assert.match(els.get('addonsWarning').textContent,/Harness bar height/);
els.get('harnessHeight').value='600';els.get('harnessHeight').events.input();isSpan('harnessSpan');
els.get('useStays').checked=false;els.get('useStays').events.change();assert.match(els.get('addonsWarning').textContent,/Harness bar requires/);
els.get('useStays').checked=true;els.get('useStays').events.change();isSpan('harnessSpan');
els.get('doorSides').value='both';els.get('doorSides').events.change();
// All physical tube-to-tube ends have separate named 1:1 developed wrap-arounds.
// The two side-bar front ends remain locked until front parent CHS geometry is confirmed.
let g=ctx.window.__inspectRollCage();
function printable(){return g.tubeJoints.filter(j=>!j.error&&j.paper&&j.profile);}
assert.equal(g.tubeJoints.length,10,'2 diagonal + 2 stay + 2 harness + 4 door joints');
assert.equal(printable().length,8,'Front tube geometry starts unconfirmed');
assert.match(els.get('jointNotchCards').innerHTML,/HARNESS BAR.*REAR STAY/);
assert.match(els.get('jointNotchCards').innerHTML,/REAR STAY.*MAIN HOOP/);
assert.match(els.get('jointNotchCards').innerHTML,/FRONT.*A-PILLAR/);
assert.match(els.get('jointNotchCards').innerHTML,/100 mm CALIBRATION/);
for(const j of printable()){
  assert.equal(j.profile.length,721,'Full 720-increment developed circumference');
  assert(Math.abs(j.profile[0].cut-j.profile.at(-1).cut)<.0001,'Wrap seam should meet');
  assert(Number.isFinite(j.cutDepth)&&j.cutDepth>=0,'Finite physical saddle depth');
  assert(Number.isFinite(j.angle)&&j.angle>=12,'Supported 3D intersection angle');
  assert.equal(j.profile[0].s,0,'Developed wrap starts at zero');
  assert(Math.abs(j.profile.at(-1).s-Math.PI*j.branchOD)<.0001,'Full circumference');
}
els.get('frontTubeConfirmed').checked=true;els.get('frontTubeConfirmed').events.change();
g=ctx.window.__inspectRollCage();
assert.equal(printable().length,10,'Both side-bar front wraps unlock after parent geometry confirmation');
const before=g.tubeJoints.find(j=>j.id==='door-left-front').cutDepth;
els.get('frontTubeRearLean').value='15';els.get('frontTubeRearLean').events.input();
g=ctx.window.__inspectRollCage();
assert(Math.abs(g.tubeJoints.find(j=>j.id==='door-left-front').cutDepth-before)>.01,'Front tube lean changes actual cope');
els.get('frontTubeRearLean').value='0';els.get('frontTubeRearLean').events.input();
els.get('harnessOD').value='63.5';els.get('harnessOD').events.input();
g=ctx.window.__inspectRollCage();
assert(g.tubeJoints.find(j=>j.id==='harness-left').error,'Branch tube larger than parent is flagged');
assert(g.tubeJoints.find(j=>j.id==='diagonal-upper').profile,'Other joints remain available');
els.get('harnessOD').value='38.1';els.get('harnessOD').events.input();
els.get('mode4').events.click();
g=ctx.window.__inspectRollCage();
const b=g.bends[2];assert(b,'Four bend hoop has upper right roof-to-shoulder bend');
els.get('braceTop').value=String((b.entry.y+b.exit.y)/2);
els.get('braceTop').events.input();
g=ctx.window.__inspectRollCage();
assert(g.addons.brace.upper.isBend,'Test joint is on curved parent section');
assert(!g.tubeJoints.find(j=>j.id==='diagonal-upper').error,'Actual bent-hoop centreline can be coped');
els.get('width').value='10';els.get('width').events.input();
assert.match(els.get('validation').innerHTML,/Not enough space/);
assert.equal(els.get('jointNotchCards').innerHTML,'','Invalid hoop clears output without referencing legacy DOM IDs');
assert.equal(els.get('memberMarkoutCards').innerHTML,'','Invalid hoop also clears all per-member diagrams');
assert.equal(els.get('cageCutBody').innerHTML,'','Invalid hoop clears cut list');
assert.equal(els.get('cageBendListBody').innerHTML,'','Invalid hoop also clears all bend mark-out rows');
assert.equal(els.get('cageBendListCount').textContent,'—');
assert.equal(ctx.window.dcbCage3DSnapshot.tubes.length,0,'Invalid main hoop clears the WebGL scene and never leaves stale tubes');
assert(ctx.window.dcbCage3DSnapshot.issues.length>0,'3D scene reports why invalid geometry cannot be rendered');
assert.equal(els.get('cageCutTotals').innerHTML,'','Invalid hoop clears material totals');


// Front leg and windscreen header regression tests. Preserve manual mode separately.
els.get('width').value='1250';els.get('width').events.input();
els.get('braceTop').value='1050';els.get('braceTop').events.input();
els.get('useFrontLegs').checked=true;els.get('useFrontLegs').events.change();
g=ctx.window.__inspectRollCage();
assert(g.addons.front,'Front leg model generated');
assert.equal(g.addons.front.errors.length,0,'Default front geometry must be buildable');
assert.equal(g.addons.front.left.bends.length,2,'Left front leg must have two circular bends');
assert.equal(g.addons.front.right.bends.length,2,'Right front leg must have two circular bends');
const frontScene=ctx.window.dcbCage3DSnapshot;
const frontTubes=frontScene.tubes.filter(t=>t.group==='front');
assert.equal(frontTubes.length,2,'Two independent continuous front-leg tubes appear in 3D');
assert(frontTubes.every(t=>t.points.length>15),'3D front legs sample actual calculated two-arc profiles');
assert(frontTubes.every(t=>t.points.some(p=>p[2]<-100)),'Both 3D front legs extend toward the windscreen');
assert(frontScene.tubes.some(t=>t.id==='windscreen-header'),'Calculated windscreen header appears in 3D');
assert(frontScene.tubes.some(t=>t.group==='brace'),'Existing diagonal remains in 3D after adding front structure');
assert(Number.isFinite(g.addons.front.left.clock),'Left bend plane clock must be finite');
assert(Math.abs(g.addons.front.left.clock+g.addons.front.right.clock)<.01,'Clocking is mirrored for symmetric front legs');
assert(g.addons.front.left.total>0&&g.addons.front.left.blank>0,'Positive centreline and stock length');
assert(g.addons.front.header?.length>0,'Header between modelled front legs');
assert.equal(g.memberMarkouts.length,10,'Whole cage includes ten physical individual member mark-outs');
assert.equal(g.cutList.count,10,'Full cage cut list includes all ten pieces');
assert.equal(g.bendMarkList.tubeCount,10,'All ten cage parts are represented in the consolidated bend mark-out list');
assert.equal(g.bendMarkList.bentTubeCount,3,'Two front legs and the main hoop are the bent members');
assert.equal(g.bendMarkList.bendCount,8,'4 main-hoop bends and 2 per front leg (4 total) in current four-bend mode');
assert(g.bendMarkList.tubes.some(t=>t.partNumber==='RC-004'&&t.bends.length===0),'Windscreen header has a straight-member NO BENDS row');
for(const side of ['left','right']){
  const tube=g.bendMarkList.tubes.find(t=>t.id==='front-leg-'+side);
  assert(tube&&tube.bends.length===2,'Front leg '+side+' has two developed bend marks');
  assert.match(tube.datum,/FL5/,'Front leg datum retained');
  assert(tube.bends[0].clockFromPrevious===null,'First bend has no preceding bend plane');
  assert(Math.abs(tube.bends[1].clockFromPrevious-g.addons.front[side].clock)<0.001,'B2 clock angle matches 3D geometry');
  for(const [i,b] of tube.bends.entries()){
    const bend=g.addons.front[side].bends[i];
    assert(Math.abs(b.start-(bend.start+g.v.frontTrim))<0.01,'Front mark start follows the actual datum allowance');
    assert(Math.abs(b.mid-(bend.mid+g.v.frontTrim))<0.01);
    assert(Math.abs(b.end-(bend.end+g.v.frontTrim))<0.01);
    assert.equal(b.clr,g.v.frontCLR);
  }
}
assert.match(els.get('cageBendListBody').innerHTML,/RC-002/);
assert.match(els.get('cageBendListBody').innerHTML,/RC-003/);
assert.match(els.get('cageBendListBody').innerHTML,/FL3/);
assert.match(els.get('cageBendListBody').innerHTML,/Clock from previous/);
assert.match(ctx.window.__bendPrint(),/signed clock/i);

assert.deepEqual(Array.from(g.cutList.rows,p=>p.partNumber).sort(),[
  'RC-001','RC-002','RC-003','RC-004','RC-005','RC-006','RC-007','RC-008','RC-009','RC-010'
],'All ten stable IDs are included when the full cage is enabled');
assert(g.cutList.rows.some(p=>p.partNumber==='RC-004'&&p.member==='Windscreen header'));
assert(g.cutList.rows.every(p=>p.qty===1),'Left/right mirrored parts remain separate one-piece rows');
assert.match(els.get('cageCutCount').textContent,/10 tubes/);
assert.match(els.get('cageCutBody').innerHTML,/RC-004/);
assert.match(ctx.window.__inspectCutCSV(),/RC-003/);

for(const id of ['front-leg-left','front-leg-right','windscreen-header']){
  assert(g.memberMarkouts.some(m=>m.id===id),'Whole cage includes '+id);
}
for(const side of ['left','right']){
  const leg=g.memberMarkouts.find(m=>m.id==='front-leg-'+side);
  assert.equal(leg.bends.length,2,'Front leg must show both bend triples');
  assert.match(leg.datum,/FL5/,'Front leg datum is named FL5 rear connection');
  assert.match(leg.farEnd,/FL1/,'Front leg far end is FL1 floor mount');
  for(let i=0;i<leg.bends.length;i++){
    assert(Math.abs(leg.bends[i].start-(g.addons.front[side].bends[i].start+g.v.frontTrim))<.001,
      'Front leg mark offset matches existing bend schedule');
  }
}
assert.equal(g.memberMarkouts.find(m=>m.id==='windscreen-header').bends.length,0);
assert.match(els.get('memberMarkoutCount').textContent,/10 individual tubes/);
assert.match(els.get('memberMarkoutCards').innerHTML,/FL5 \/ REAR HOOP/);
assert.match(els.get('memberMarkoutCards').innerHTML,/2 bends/);

assert(g.addons.door.frontIsModelled,'Door ends reference modelled front leg, not manual input');
assert(Math.abs(g.addons.door.left.front.z+Number(els.get('frontFootRun').value))<1,'Door front joint follows front leg foot line');
assert.match(els.get('frontSideSvg').innerHTML,/Roof joint/);
assert.match(els.get('frontPlanSvg').innerHTML,/Upper A-pillar spacing/);
assert.match(els.get('frontFaceSvg').innerHTML,/Header/);
assert.match(els.get('frontBendsBody').innerHTML,/LEFT/);
assert.match(els.get('frontBendsBody').innerHTML,/RIGHT/);

const pointTable=els.get('frontStationsBody').innerHTML;
for(const code of ['FL1','FL2','FL3','FL4','FL5']){
  assert.match(pointTable,new RegExp(code),'Point reference schedule includes '+code);
  assert.match(els.get('frontSideSvg').innerHTML,new RegExp('>'+code+'</text>'),'Side view annotates '+code);
  assert.match(els.get('frontPlanSvg').innerHTML,new RegExp('L-'+code),'Plan left view annotates '+code);
  assert.match(els.get('frontPlanSvg').innerHTML,new RegExp('R-'+code),'Plan right view annotates '+code);
  assert.match(els.get('frontFaceSvg').innerHTML,new RegExp('L-'+code),'Front left view annotates '+code);
  assert.match(els.get('frontFaceSvg').innerHTML,new RegExp('R-'+code),'Front right view annotates '+code);
}
assert.match(pointTable,/Virtual geometry corner/,'Virtual bend vertices must be distinguished');
assert.match(pointTable,/On tube centreline/,'Actual formed tube stations must be distinguished');
assert.match(pointTable,/Roof bend start tangent \(B1\)/,'FL4 must resolve bend 1 tangent');
assert.match(els.get('frontSideSvg').innerHTML,/FL3 forward 820 mm/,'Roof forward dimension is drawn');
assert.match(els.get('frontSideSvg').innerHTML,/FL1 forward 1080 mm/,'Mount forward dimension is drawn');
assert.match(els.get('frontSideSvg').innerHTML,/FL5 H 1150 mm/,'Hoop connection height shown');
assert.match(els.get('frontPlanSvg').innerHTML,/FL2 width 1190/,'Plan base spacing shown');
assert.match(els.get('frontFaceSvg').innerHTML,/FL3 top 1040 mm/,'Front upper width shown');
assert.match(pointTable,/1080.0 mm/,'Station values reflect current measurements');
const inputWidthId='frontFootWidth',initialWidth=els.get(inputWidthId).value;
els.get(inputWidthId).value='1160';els.get(inputWidthId).events.input();
assert.match(els.get('frontFaceSvg').innerHTML,/FL1 feet 1160 mm/,'Changing foot spacing changes dimensions in front view');
assert.match(els.get('frontPlanSvg').innerHTML,/FL1 width 1160/,'Changing foot spacing changes dimensions in plan');
assert.match(els.get('frontStationsBody').innerHTML,/1160.0 mm/,'Station schedule follows width updates');
els.get(inputWidthId).value=initialWidth;els.get(inputWidthId).events.input();

assert.equal(g.tubeJoints.length,14,'10 original joints + 2 front leg rear + 2 header ends');
assert(g.tubeJoints.some(j=>j.id==='front-leg-left-rear'));
assert(g.tubeJoints.some(j=>j.id==='windscreen-header-right'));
const frontEnds=g.tubeJoints.filter(j=>j.id.startsWith('front-leg-')||j.id.startsWith('windscreen-header-'));
assert.equal(frontEnds.length,4);
assert(frontEnds.every(j=>!j.error),`Every modelled front leg/header joint must produce a template: ${frontEnds.map(j=>j.id+': '+(j.error||'OK')).join(' | ')}`);
assert(['left','right'].every(side=>!g.tubeJoints.find(j=>j.id==='door-'+side+'-front').error),'Side intrusion front joints must use actual front-leg tube');

const originalRun=g.addons.door.left.forward;
els.get('doorRun').value='720';els.get('doorRun').events.input();
g=ctx.window.__inspectRollCage();
assert.equal(g.addons.door.left.forward,originalRun,'Manual forward distance ignored while actual front legs enabled');
els.get('frontFootRun').value='1130';els.get('frontFootRun').events.input();
g=ctx.window.__inspectRollCage();
assert(g.addons.door.left.forward>originalRun,'Door front follows the front leg when mounting run changes');
els.get('frontFootRun').value='1080';els.get('frontFootRun').events.input();
els.get('frontCLR').value='3000';els.get('frontCLR').events.input();
g=ctx.window.__inspectRollCage();
assert(g.addons.front.errors.length>0,'Impossible front CLR flagged');
assert.match(els.get('frontWarning').textContent,/too short/);
els.get('frontCLR').value='140';els.get('frontCLR').events.input();
g=ctx.window.__inspectRollCage();
assert.equal(g.addons.front.errors.length,0,'Front leg recovers after fix');
els.get('useFrontLegs').checked=false;els.get('useFrontLegs').events.change();
g=ctx.window.__inspectRollCage();
assert.equal(g.addons.front,null,'Manual front mode preserved when front legs disabled');
assert.equal(g.tubeJoints.length,10,'Original ten joint inventory restored');
assert.equal(g.memberMarkouts.length,7,'Disabling front legs also removes both leg sheets and header sheet');
assert.equal(g.cutList.count,7);
assert.equal(g.bendMarkList.tubeCount,7,'Turning off front legs also removes bend schedules for optional front members');
assert(!g.cutList.rows.some(p=>p.partNumber==='RC-004'),'Disabled windscreen header is not silently counted');


const ruleBody=els.get('rulesBody'),ruleClass=els.get('rulesClass');
ruleBody.value='aasa';ruleBody.events.change();
ruleClass.value='3';ruleClass.events.change();
g=ctx.window.__inspectRollCage();
assert.equal(g.ruleReview.body,'aasa');
assert.equal(g.ruleReview.cls,'3');
assert(g.ruleReview.alerts>0,'Class 3 requires more members than the default cage');
assert.match(els.get('rulesMessages').innerHTML,/Main-hoop full-width harness bar/);
assert.match(els.get('rulesMessages').innerHTML,/Roof V \/ cross reinforcement/);
assert.match(els.get('rulesMessages').innerHTML,/ATTENTION/);
els.get('tubeSpec').value='cds';els.get('tubeSpec').events.change();
assert.match(els.get('rulesMessages').innerHTML,/MAIN-HOOP MINIMUM TUBE SIZE/);
function toggle(id,on){els.get(id).checked=on;els.get(id).events.change();}
toggle('useHoopHarness',true);
g=ctx.window.__inspectRollCage();
assert(g.addons.extras.hoopHarness,'Separate full width hoop harness is calculated');
assert(g.cutList.rows.some(p=>p.partNumber==='RC-011'),'New harness bar has reserved RC-011');
assert(g.cutList.rows.some(p=>p.partNumber==='RC-008'),'Old rear-stay crossbar keeps RC-008');
assert(g.tubeJoints.filter(j=>j.id.startsWith('hoop-harness-')).length===2);
toggle('useMainCross',true);
g=ctx.window.__inspectRollCage();
assert(g.addons.extras.cross,'Main-hoop opposite diagonal is calculated');
assert(g.cutList.rows.some(p=>p.partNumber==='RC-012'));
toggle('useFrontLegs',true);
toggle('useRoofX',true);
g=ctx.window.__inspectRollCage();
assert.equal(g.addons.extras.roof.length,2,'Both roof diagonals calculated');
assert(g.cutList.rows.some(p=>p.partNumber==='RC-013'));
assert(g.cutList.rows.some(p=>p.partNumber==='RC-014'));
assert.match(els.get('reinforcementPlanSvg').innerHTML,/Roof X/);
assert(g.addons.extras.roof.every(m=>m.farParent.kind==='header'),'Roof reinforcement front joints are on header');
toggle('usePillarA',true);
toggle('usePillarB',true);
toggle('useDoor2',true);
g=ctx.window.__inspectRollCage();
assert.equal(g.addons.extras.pillarA.length,2);
assert.equal(g.addons.extras.pillarB.length,2);
assert.equal(g.addons.extras.door2.length,2);
assert(g.cutList.rows.some(p=>p.partNumber==='RC-015'));
assert(g.cutList.rows.some(p=>p.partNumber==='RC-016'));
assert(g.cutList.rows.some(p=>p.partNumber==='RC-017'));
assert(g.cutList.rows.some(p=>p.partNumber==='RC-018'));
assert(g.cutList.rows.some(p=>p.partNumber==='RC-019'));
assert(g.cutList.rows.some(p=>p.partNumber==='RC-020'));
assert.equal(g.cutList.count,20,'All base and reinforcing tubes are individually listed');
assert(ctx.window.dcbCagePreflight.ready,'Twenty-piece reinforced cage passes selected-member completeness check');
const full3D=ctx.window.dcbCage3DSnapshot;
assert.equal(full3D.tubes.length,20,'3D preview contains every one of the twenty calculated tubes');
for(const group of ['main','front','stays','brace','roof','door','harness','header','reinforcement']){
  assert(full3D.tubes.some(t=>t.group===group),'3D preview includes selected '+group+' member group');
}
assert(full3D.tubes.every(t=>Number.isFinite(t.od)&&t.od>0&&t.points.every(p=>p.every(Number.isFinite))),
  'All 3D members retain valid OD and spatial centreline positions');

assert.equal(g.memberMarkouts.length,20,'All 20 tubes have distinct datum markouts');
assert.equal(g.bendMarkList.tubeCount,20,'Bend schedule includes every reinforcement (NO BENDS)');
assert.match(els.get('rulesMessages').innerHTML,/A-PILLAR UPPER JOINT OFFSET/);
assert.match(els.get('reinforcementSideSvg').innerHTML,/B-pillar/);
assert(g.tubeJoints.some(j=>j.id==='roof-left-near'));
assert(g.tubeJoints.some(j=>j.id==='roof-left-far'));
assert(g.tubeJoints.some(j=>j.partNumber==='RC-018'));
assert.equal(g.ruleReview.body,'aasa');
ruleBody.value='ma';ruleBody.events.change();
ruleClass.value='type2';ruleClass.events.change();
g=ctx.window.__inspectRollCage();
assert.equal(g.ruleReview.body,'ma');
assert.match(els.get('rulesMessages').innerHTML,/TYPE 2 STRUCTURE/);
assert.match(els.get('rulesSummary').textContent,/NOT approval/);
toggle('useHoopHarness',false);
g=ctx.window.__inspectRollCage();
assert(!g.cutList.rows.some(p=>p.partNumber==='RC-011'),'Removing hoop harness preserves all other part IDs');
assert(g.cutList.rows.some(p=>p.partNumber==='RC-020'),'Part number 020 remains reserved independently');
toggle('useRoofX',false);
assert(!ctx.window.__inspectRollCage().cutList.rows.some(p=>p.partNumber==='RC-013'));

console.log('Roll cage geometry, views, controls and invalid-input smoke tests passed');
