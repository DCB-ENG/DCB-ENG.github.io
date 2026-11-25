/* DCB ENG Roll Cage Generator: versioned, local editable project files.
   No cloud, cookies or external services: browser draft uses localStorage. */
(() => {
  'use strict';
  const core=window.dcbCageCore;
  if(!core||typeof core.restoreState!=='function')return;
  const KEY='dcb-cage-project-draft-v1';
  const SCHEMA='dcb-roll-cage-project-v1';
  const $=id=>document.getElementById(id);
  const status=$('cageProjectStatus');
  const fileInput=$('cageLoadProjectFile');
  const saveButton=$('cageSaveProject');
  const resetButton=$('cageResetProject');
  const setStatus=text=>{if(status)status.textContent=text;};
  function fields(){
    const data={};
    for(const input of document.querySelectorAll('#cageWorkspace input[id],#cageWorkspace select[id],#cageWorkspace textarea[id]')){
      const id=input.id;
      if(!id||id.startsWith('design-')||id==='cageDrawingChoice')continue;
      if(input.type==='file'||input.type==='button')continue;
      if(input.type==='checkbox')data[id]={checked:input.checked};
      else data[id]={value:String(input.value)};
    }
    return data;
  }
  function snapshot(){
    return {schema:SCHEMA,version:1,savedAt:new Date().toISOString(),
      mode:core.mode(),fields:fields()};
  }
  function verify(project){
    if(!project||project.schema!==SCHEMA||project.version!==1||![2,4].includes(project.mode)||
      !project.fields||typeof project.fields!=='object'||Array.isArray(project.fields)||
      Object.keys(project.fields).length>180)throw new Error('This is not a compatible DCB ENG roll-cage project.');
    for(const [id,entry] of Object.entries(project.fields)){
      if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||!entry||typeof entry!=='object'||
        (typeof entry.value!=='string'&&typeof entry.checked!=='boolean')||
        (entry.value!==undefined&&String(entry.value).length>200))
        throw new Error('The project contains invalid or incompatible field data.');
    }
    return project;
  }
  let saving=false,timer=null;
  function saveDraft(){
    if(saving)return;
    try{
      localStorage.setItem(KEY,JSON.stringify(snapshot()));
      setStatus('Draft saved locally');
    }catch(error){setStatus('Local autosave unavailable — use Save project.');}
  }
  function queueSave(){
    if(saving)return;
    clearTimeout(timer);
    timer=setTimeout(saveDraft,450);
  }
  function restore(project,fromFile=false){
    verify(project);
    saving=true;
    clearTimeout(timer);
    try{
      core.restoreState(project);
      // Only write new local draft after successful single-pass geometry refresh.
      localStorage.setItem(KEY,JSON.stringify(snapshot()));
      setStatus(fromFile?'Project loaded and draft saved':'Recovered local draft');
    }finally{saving=false;}
  }
  for(const event of ['input','change']){
    document.addEventListener(event,e=>{
      const control=e.target;
      if(!control?.id||control.id.startsWith('design-')||control.id==='cageDrawingChoice')return;
      if(control.closest('#cageWorkspace'))queueSave();
    },true);
  }
  document.addEventListener('click',event=>{
    if(event.target?.closest('#mode2,#mode4'))queueSave();
  },true);
  window.addEventListener('beforeunload',()=>{clearTimeout(timer);saveDraft();});
  saveButton?.addEventListener('click',()=>{
    const project=snapshot();
    try{
      const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      const ref=String($('cageJobRef')?.value||'').replace(/[^A-Za-z0-9-]/g,'').slice(0,25);
      link.download=(ref?ref+'-':'')+'roll-cage-project.json';
      link.href=url;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      saveDraft();
      setStatus('Project JSON saved — keep a copy with your job files.');
    }catch(error){setStatus('Project download failed: '+error.message);}
  });
  fileInput?.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    try{
      if(file.size>250000)throw new Error('Project file exceeds the 250 kB safety limit.');
      const project=verify(JSON.parse(await file.text()));
      restore(project,true);
    }catch(error){
      setStatus('Load failed: '+error.message);
      alert('Unable to load roll-cage project: '+error.message);
    }finally{fileInput.value='';}
  });
  resetButton?.addEventListener('click',()=>{
    if(!confirm('Reset this cage to default measurements? Save your project JSON first if you need these dimensions.'))return;
    try{localStorage.removeItem(KEY);}catch(_){}
    window.removeEventListener('beforeunload',()=>{});
    // Avoid repopulating the draft in the beforeunload event.
    saving=true;
    window.location.reload();
  });
  try{
    const draft=localStorage.getItem(KEY);
    if(draft)restore(JSON.parse(draft));
    else setStatus('Autosave enabled on this browser');
  }catch(error){
    setStatus('Draft recovery unavailable — use Load project to restore a saved file.');
  }
})();