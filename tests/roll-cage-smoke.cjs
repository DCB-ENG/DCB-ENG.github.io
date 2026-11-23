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
const injected=scripts[0].replace(/  render\(\);\s*\}\)\(\);\s*$/, '  render(); window.__inspectRollCage=()=>latest;\n})();');
assert.notEqual(injected,scripts[0],'Test probe injection must match script tail');
vm.runInContext(injected,ctx,{timeout:12000,filename:'roll-cage/index.html'});
function isSpan(id){assert.match(els.get(id).textContent,/^\d+[.]?\d* mm$/,'Missing computed span for '+id);}
isSpan('developed');isSpan('braceSpan');isSpan('staySpan');isSpan('harnessSpan');isSpan('doorSpan');
assert.match(els.get('stayPlanSvg').innerHTML,/Harness/);
assert.match(els.get('doorSideSvg').innerHTML,/Forward/);
assert.match(els.get('doorPlanSvg').innerHTML,/Front joints/);
assert.match(els.get('addonsBody').innerHTML,/Harness crossbar/);
assert.match(els.get('addonsBody').innerHTML,/side intrusion/);
assert.match(els.get('drawingSvg').innerHTML,/Harness/);
els.get('mode4').events.click();isSpan('harnessSpan');isSpan('doorSpan');assert.match(els.get('drawingSvg').innerHTML,/Shoulder/);
els.get('doorSides').value='left';els.get('doorSides').events.change();
assert.match(els.get('addonsBody').innerHTML,/Left side intrusion/);
assert.doesNotMatch(els.get('addonsBody').innerHTML,/Right side intrusion/);
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

console.log('Roll cage geometry, views, controls and invalid-input smoke tests passed');
