// Regression guard: the workspace must be a presentation-only enhancement.
// The comprehensive geometry assertions remain in roll-cage-smoke.cjs.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('roll-cage/index.html','utf8');
const ui=fs.readFileSync('roll-cage/ui-workspace.js','utf8');
const css=fs.readFileSync('roll-cage/ui-workspace.css','utf8');
const htmlBeforeScript=html.split('<script>')[0];
const originalIds=[...htmlBeforeScript.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const ids=new Set(originalIds);
assert.equal(originalIds.length,ids.size,'Duplicate static HTML IDs can break existing calculator event bindings');
assert.match(html,/<link rel="stylesheet" href="\.\/ui-workspace\.css">/);
assert.match(html,/<script src="\.\/ui-workspace\.js" defer><\/script>/);
new vm.Script(ui,{filename:'roll-cage/ui-workspace.js'});
for(const id of [
  'mode2','mode4','width','height','od','wall','radius','extra','rulesPanel',
  'useBrace','useStays','useFrontLegs','useDoor','useHeader','braceFields','frontLegFields',
  'drawingSvg','frontSideSvg','frontPlanSvg','frontFaceSvg','staySideSvg','stayPlanSvg',
  'doorSideSvg','doorPlanSvg','reinforcementFrontSvg','reinforcementPlanSvg',
  'validation','developed','blank','bendCount','cageCutTotals','rulesMessages',
  'cageCutPanel','cageCutBody','cageBendListPanel','frontPanel','allMemberMarksPanel',
  'notchPanel','jointNotchCards','browserStepOpen','printNotches','sendCageToNesting',
  'saveCageCutCSV','cageMaterial','cageJobRef','copyTop','printTop'
]){
  assert(ids.has(id),'Existing calculator DOM control missing: '+id);
}
for(const name of ['design','members','fabrication','exports']){
  assert(ui.includes("'"+name+"'"),'Missing workflow tab '+name);
}
assert.match(ui,/designSettings\.appendChild\(controls\)/);
assert.match(ui,/memberSettings\.appendChild\(membersGroup\)/);
assert.match(ui,/stage\.appendChild\(drawing\)/);
assert.match(ui,/memberOutputs\.appendChild\(addons\)/);
assert.match(ui,/fabrication\.appendChild\(cutList\)/);
assert.match(ui,/pages\.exports\.appendChild\(notch\)/);
assert.match(ui,/original\.remove\(\)/,'The original one-page grid must be removed only after nodes are moved');
assert.match(ui,/new MutationObserver\(updateOverview\)/,'Live summary must update from existing cut calculations');
assert.match(ui,/new MutationObserver\(updateOverview\)/);
assert.match(ui,/window\.addEventListener\('beforeprint'/);
assert.match(ui,/window\.addEventListener\('afterprint'/);
// Design-tab quick selection must mirror ALL existing member toggles, using
// the original checkbox's click event to preserve geometry, rules and outputs.
const memberIds=[
  'useFrontLegs','useStays','useHeader','useBrace','useMainCross','useRoofX',
  'usePillarA','usePillarB','useHarness','useHoopHarness','useDoor','useDoor2'
];
for(const id of memberIds){
  assert.match(ui,new RegExp("id:'"+id+"',label:"),'Design picker must include '+id);
  assert(ids.has(id),'Original member toggle is missing: '+id);
}
assert.match(ui,/pages\.design\.insertBefore\(picker,designGrid\)/,'Member selector should be visible in Design before the main layout');
assert.match(ui,/source\.click\(\)/,'Design checkbox must activate original geometry event handlers');
assert.match(ui,/source\.addEventListener\('change',syncQuickMembers\)/,'Members controls must sync back to Design');
assert.match(ui,/activate\('members'\)/,'Edit should take the user to detailed member dimensions');
assert.match(ui,/showDrawing\(requested\.direction,requested\.id\)/,'Selecting a member should switch to a relevant live drawing');
assert.match(ui,/pending=Boolean\(source\.checked&&definition\.requires/,'Missing parent tubes should be clearly flagged');
assert.match(css,/\.cage-member-picker-grid\{display:grid/);
assert.match(css,/@media\(max-width:520px\)/);

assert.match(css,/#cageWorkspace \[hidden\]\{display:none!important\}/);
assert.match(css,/@media print\{/);
assert.match(css,/#cageWorkspace \.cage-tab-page\[hidden\],#cageWorkspace \.cage-preview-figure\[hidden\]/);
console.log('Roll-cage workspace structure and compatibility assertions passed');
