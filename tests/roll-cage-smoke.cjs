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
vm.runInContext(scripts[0],ctx,{timeout:4000,filename:'roll-cage/index.html'});
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
console.log('Roll cage geometry, views, controls and invalid-input smoke tests passed');
