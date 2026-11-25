const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const scan=require('../roll-cage/preview-collisions.js');
const projectScript=fs.readFileSync('roll-cage/project-state.js','utf8');
const html=fs.readFileSync('roll-cage/index.html','utf8');
const workspace=fs.readFileSync('roll-cage/ui-workspace.js','utf8');
const viewer=fs.readFileSync('roll-cage/preview-3d.js','utf8');
const css=fs.readFileSync('roll-cage/ui-workspace.css','utf8');
new vm.Script(projectScript,{filename:'roll-cage/project-state.js'});
new vm.Script(viewer,{filename:'roll-cage/preview-3d.js'});
assert.match(html,/id="cagePreflightPanel"/);
assert.match(html,/id="cageSaveProject"/);
assert.match(html,/id="cageLoadProjectFile"/);
assert.match(html,/id="cageResetProject"/);
assert.match(html,/function cageFabricationPreflight\(g\)/);
assert.match(html,/window\.dcbCageCore=\{/);
assert.match(html,/render\(\);\s*window\.dispatchEvent\(new Event\('dcb:cage-state-restored'\)\)/);
assert.match(workspace,/dcb:cage-state-restored/,'Quick-select member cards must sync after restoring project');
assert.match(viewer,/webglcontextlost/,'3D preview must fall back to 2D after GPU loss');
assert.match(viewer,/requestAnimationFrame\(\(\)=>\{/,'3D scene changes must be coalesced');
assert.match(viewer,/snapshot\.collisions/,'3D collision warnings must be shown');
assert.match(css,/\.cage-preflight-panel\.is-blocked/);
assert.match(html,/<script src="\.\/preview-collisions\.js" defer><\/script>/);
assert.match(html,/<script src="\.\/project-state\.js" defer><\/script>/);

// Real 3D envelope maths: ignore intended end joints; report central clashes.
const tube=(id,start,end,od=40)=>({id,label:id,od,points:[start,end]});
const across=tube('across',[-150,0,0],[150,0,0]);
const crossing=tube('crossing',[0,-150,0],[0,150,0]);
const results=scan([across,crossing]);
assert.equal(results.length,1,'Two midspan tube crossings are flagged');
assert.equal(results[0].clearance,-40,'Centrelines crossing produces negative OD-envelope clearance');
assert.equal(scan([across,tube('end-joint',[0,0,0],[0,160,0])]).length,0,
  'An intentional tube end connecting to parent middle is not flagged');
assert.equal(scan([across,tube('clear',[0,-150,85],[0,150,85])]).length,0,
  'Members with adequate physical separation are not flagged');
assert.equal(scan([across,tube('offset',[0,-150,35],[0,150,35])]).length,1,
  'Near intersecting full-OD tube envelopes are flagged even if axes do not cross');
assert.equal(scan([{id:'bad',od:-1,points:[]},across]).length,0,'Invalid meshes do not crash collision checks');

// Local project persistence: all saved fields have stable IDs and preserve mode.
const sample=[
  {id:'width',type:'number',value:'1250'},
  {id:'useStays',type:'checkbox',checked:true},
  {id:'cageJobRef',type:'text',value:'45186'}
];
let draft=null,restored=null;
const status={textContent:''}, fileInput={id:'cageLoadProjectFile',addEventListener(){}},
  saveButton={addEventListener(){}},resetButton={addEventListener(){}};
const nodes={cageProjectStatus:status,cageLoadProjectFile:fileInput,
  cageSaveProject:saveButton,cageResetProject:resetButton};
const events={},timers=[];
const document={
  getElementById:id=>nodes[id]||sample.find(p=>p.id===id)||null,
  querySelectorAll:()=>sample,
  addEventListener:(name,fn)=>{events[name]=fn;}
};
for(const entry of sample)entry.closest=()=>({});
const core={mode:()=>4,restoreState:data=>{restored=data;}};
const storage={getItem:()=>draft,setItem:(key,value)=>{draft=value;},removeItem:()=>{draft=null;}};
const window={
  dcbCageCore:core,
  addEventListener:(name,fn)=>{events['window:'+name]=fn;},
  location:{reload(){}}
};
vm.runInNewContext(projectScript,{window,document,localStorage:storage,
  Date,Blob,URL,setTimeout:fn=>{timers.push(fn);return timers.length;},
  clearTimeout:()=>{},console,alert:()=>{},confirm:()=>true});
assert.match(status.textContent,/Autosave enabled/);
assert.equal(typeof events.input,'function','Autosave listens to form inputs');
sample[0].value='1320';
events.input({target:sample[0]});
assert.equal(timers.length,1);
timers.shift()();
const saved=JSON.parse(draft);
assert.equal(saved.schema,'dcb-roll-cage-project-v1');
assert.equal(saved.mode,4);
assert.equal(saved.fields.width.value,'1320');
assert.equal(saved.fields.useStays.checked,true);
assert.equal(saved.fields.cageJobRef.value,'45186');
assert.match(status.textContent,/Draft saved locally/);

const newStatus={textContent:''};
const secondDocument={...document,getElementById:id=>id==='cageProjectStatus'?newStatus:nodes[id]||sample.find(p=>p.id===id)||null};
vm.runInNewContext(projectScript,{window,document:secondDocument,localStorage:storage,
  Date,Blob,URL,setTimeout:()=>0,clearTimeout:()=>{},console,alert:()=>{},confirm:()=>true});
assert(restored,'Saved draft should be restored on a subsequent visit');
assert.equal(restored.fields.width.value,'1320');
assert.match(newStatus.textContent,/Recovered local draft/);
console.log('Roll-cage project save/recovery, fabrication preflight and midspan collision checks passed');
