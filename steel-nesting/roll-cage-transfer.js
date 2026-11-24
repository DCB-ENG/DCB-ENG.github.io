/* Roll Cage Generator -> Steel Nesting: same-origin, one-tab browser handoff. */
(() => {
  'use strict';

  if(new URLSearchParams(window.location.search).get('from')!=='roll-cage')return;
  const KEY='dcb-roll-cage-nesting-v1';
  const el=id=>document.getElementById(id);

  let payload;
  try{
    payload=JSON.parse(sessionStorage.getItem(KEY)||'null');
  }catch(error){
    status('Could not read the roll-cage cut list from this tab. Return to the generator and select Send to Steel Nesting again.','error');
    return;
  }

  function validGroup(group){
    if(!group||typeof group.profile!=='string'||!/^CHS\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i.test(group.profile))return false;
    if(!Array.isArray(group.parts)||!group.parts.length||group.parts.length>2000)return false;
    let total=0;
    for(const part of group.parts){
      if(typeof part.mark!=='string'||!part.mark.trim()||/[,;\r\n]/.test(part.mark))return false;
      if(typeof part.length!=='number'||!Number.isFinite(part.length)||part.length<=0||part.length>1000000)return false;
      if(!Number.isInteger(part.qty)||part.qty<1||part.qty>1000)return false;
      total+=part.qty;
    }
    return total<=2000;
  }

  const valid=payload&&payload.schema==='dcb-roll-cage-nesting-v1'&&
    Number.isFinite(payload.createdAt)&&Math.abs(Date.now()-payload.createdAt)<86400000&&
    Array.isArray(payload.groups)&&payload.groups.length>0&&payload.groups.length<=30&&
    payload.groups.every(validGroup);
  if(!valid){
    status('No valid, recent roll-cage cut list was found. Open the Roll Cage Generator and use Send to Steel Nesting again.','error');
    return;
  }

  const select=el('rollCageTransferProfile');
  const previousSettings=new Map();
  let activeIndex=-1;
  const totalPieces=payload.groups.reduce((sum,g)=>sum+g.parts.reduce((count,p)=>count+p.qty,0),0);
  const job=typeof payload.job==='string'&&payload.job?payload.job:'unlabelled cage';
  const grade=typeof payload.grade==='string'&&payload.grade!=='Not specified'?payload.grade.slice(0,50):'';

  payload.groups.forEach((group,index)=>{
    const option=document.createElement('option');
    const pcs=group.parts.reduce((sum,p)=>sum+p.qty,0);
    const length=group.parts.reduce((sum,p)=>sum+p.qty*p.length,0);
    option.value=String(index);
    option.textContent=group.profile+' · '+pcs+' tubes · '+(length/1000).toFixed(2)+' m';
    select.appendChild(option);
  });

  function saveCurrentSettings(){
    if(activeIndex<0)return;
    previousSettings.set(activeIndex,{
      parts:el('parts').value,
      stocks:el('stocks').value,
      kerf:el('kerf').value,
      clamp:el('clamp').value,
      keep:el('keep').checked,
      grade:el('grade').value
    });
  }

  function showGroup(index){
    if(!Number.isInteger(index)||index<0||index>=payload.groups.length)return;
    saveCurrentSettings();
    activeIndex=index;
    const group=payload.groups[index];
    const saved=previousSettings.get(index);
    setProfileFromReport(group.profile);
    el('parts').value=saved?saved.parts:group.parts.map(p=>
      [p.mark,p.length,p.qty,group.profile].join(',')
    ).join('\n');
    el('grade').value=saved?saved.grade:grade;
    if(saved){
      el('stocks').value=saved.stocks;
      el('kerf').value=saved.kerf;
      el('clamp').value=saved.clamp;
      el('keep').checked=saved.keep;
    }
    // Previous optimisations must not be exported as if they belonged to the new size.
    last=null;
    el('download').disabled=true;
    el('print').disabled=true;
    el('stats').replaceChildren();
    el('warnings').replaceChildren();
    el('bars').textContent='Select Optimise cutting plan to calculate this CHS size.';
    const count=group.parts.reduce((sum,p)=>sum+p.qty,0);
    el('rollCageTransferSummary').textContent='Job '+job+' · '+totalPieces+' tubes across '+payload.groups.length+
      ' CHS size'+(payload.groups.length===1?'':'s')+' · selected '+group.profile+' ('+count+' tubes).';
    status('Roll-cage prep blanks filled for '+group.profile+'. Review stock lengths, kerf and clamp; then select Optimise.');
  }

  select.addEventListener('change',()=>showGroup(Number(select.value)));
  el('rollCageTransferPanel').hidden=false;
  select.value='0';
  showGroup(0);
})();
