const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const cage=fs.readFileSync('roll-cage/index.html','utf8');
const nestPage=fs.readFileSync('steel-nesting/index.html','utf8');
const bridge=fs.readFileSync('steel-nesting/roll-cage-transfer.js','utf8');
assert.match(cage,/id="sendCageToNesting"/);
assert.match(cage,/const length=Math\.ceil\(row\.blank\*10-1e-8\)\/10/,'Nest must use conservative preparation blank length');
assert.match(cage,/sessionStorage\.setItem\('dcb-roll-cage-nesting-v1'/);
assert.match(nestPage,/id="rollCageTransferProfile"/);
assert.match(nestPage,/src="\.\/roll-cage-transfer\.js"/);
new vm.Script(bridge,{filename:'steel-nesting/roll-cage-transfer.js'});

const payload={
  schema:'dcb-roll-cage-nesting-v1',
  createdAt:Date.now(),
  job:'45186',
  grade:'CDS',
  groups:[
    {profile:'CHS44.45x2.6',parts:[
      {mark:'45186-RC-001 Main hoop',length:3690.3,qty:1},
      {mark:'45186-RC-002 Front leg left',length:2200.1,qty:1},
      {mark:'45186-RC-003 Front leg right',length:2200.1,qty:1}
    ]},
    {profile:'CHS38.1x2.6',parts:[
      {mark:'45186-RC-005 Diagonal brace',length:1500.8,qty:1},
      {mark:'45186-RC-006 Rear stay left',length:1900.2,qty:1},
      {mark:'45186-RC-007 Rear stay right',length:1900.2,qty:1}
    ]}
  ]
};

const elements=new Map();
function element(id){
  if(!elements.has(id)){
    const value=id==='stocks'?'12000, 8000':id==='kerf'?'3':id==='clamp'?'0':'';
    elements.set(id,{
      id,value,checked:false,disabled:false,hidden:true,textContent:'',options:[],events:{},
      appendChild(child){this.options.push(child);},
      replaceChildren(){this.options=[];this.textContent='';},
      addEventListener(name,callback){this.events[name]=callback;}
    });
  }
  return elements.get(id);
}
const sessionStorage={getItem(key){assert.equal(key,'dcb-roll-cage-nesting-v1');return JSON.stringify(payload);}};
const statuses=[];
const context=vm.createContext({
  document:{getElementById:element,createElement:()=>({value:'',textContent:''})},
  window:{location:{search:'?from=roll-cage'}},
  URLSearchParams,Date,Number,sessionStorage,Map,
  status(message){statuses.push(message);},
  setProfileFromReport(profile){element('profile').value=profile;},
  last:{something:'stale'}
});
vm.runInContext(bridge,context,{timeout:3000});
assert.equal(element('rollCageTransferPanel').hidden,false);
assert.equal(element('rollCageTransferProfile').options.length,2);
assert.equal(element('profile').value,'CHS44.45x2.6');
assert.equal(element('grade').value,'CDS');
assert.equal(element('parts').value.split('\n').length,3,'One continuous bent member per line');
assert.match(element('parts').value,/45186-RC-001 Main hoop,3690.3,1,CHS44.45x2.6/);
assert.equal(element('download').disabled,true);

element('stocks').value='3x6m';
element('kerf').value='10';
element('parts').value+='\\n45186-RC-004 Extra,1000,1,CHS44.45x2.6';
element('rollCageTransferProfile').value='1';
element('rollCageTransferProfile').events.change();
assert.equal(element('profile').value,'CHS38.1x2.6');
assert.equal(element('parts').value.split('\n').length,3);
assert.equal(element('stocks').value,'3x6m','Current stock settings carry into next CHS size initially');

element('stocks').value='2x8m';
element('kerf').value='3';
element('rollCageTransferProfile').value='0';
element('rollCageTransferProfile').events.change();
assert.equal(element('stocks').value,'3x6m','First CHS stock settings restored');
assert.equal(element('kerf').value,'10','First CHS kerf setting restored');
assert.match(element('parts').value,/RC-004 Extra/,'Manual edits restored for original CHS group');
assert.match(element('rollCageTransferSummary').textContent,/6 tubes across 2 CHS sizes/);
assert(statuses.some(message=>message.includes('prep blanks filled')));
console.log('Roll cage -> nesting handoff smoke test passed');
