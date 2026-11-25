/* Progressive, UI-only workspace for the existing roll-cage calculator.
   Move original DOM nodes, never clone engineering inputs, SVGs or export controls. */
(() => {
  'use strict';
  const main=document.querySelector('main.wrap-main');
  const original=main?.querySelector(':scope > .layout');
  const controls=original?.querySelector('aside.controls');
  const results=original?.querySelector('.results');
  const rules=document.getElementById('rulesPanel');
  if(!main||!original||!controls||!results||!rules)return;
  const $=id=>document.getElementById(id);
  const names=['design','members','fabrication','exports'];
  const labels={design:'Design',members:'Members',fabrication:'Fabrication',exports:'Exports'};
  const descriptions={
    design:'Main hoop geometry and live drawings.',
    members:'Enable cage members and set their individual dimensions.',
    fabrication:'Numbered cutting, nesting and bend schedules.',
    exports:'Printable fishmouth templates, STEP and CAD data.'
  };
  const shell=document.createElement('div');
  shell.id='cageWorkspace';
  shell.innerHTML=
    '<nav class="cage-tabs" role="tablist" aria-label="Roll cage workflow">'+
    names.map((name,i)=>'<button type="button" class="cage-tab-button" role="tab" id="cage-tab-'+name+'" aria-controls="cage-page-'+name+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?'0':'-1')+'"><span class="tab-number">0'+(i+1)+'</span>'+labels[name]+'</button>').join('')+
    '</nav><div class="cage-overview" aria-label="Live cage cutting summary">'+
    '<div class="overview-card"><small>Complete tubes</small><strong id="overviewTubeCount">—</strong></div>'+
    '<div class="overview-card"><small>Combined prep blanks</small><strong id="overviewPrepLength">—</strong></div>'+
    '<div class="overview-card"><small>CHS sizes</small><strong id="overviewProfiles">—</strong></div>'+
    '<div class="overview-card"><small>Rules review</small><strong id="overviewRules">Advisory</strong></div>'+
    '</div><div class="cage-global-validation"></div><div class="cage-tab-pages">'+
    names.map(name=>'<section class="cage-tab-page" id="cage-page-'+name+'" role="tabpanel" tabindex="0" aria-labelledby="cage-tab-'+name+'"'+(name!=='design'?' hidden':'')+'><header class="cage-page-title"><p class="cage-eyebrow">Roll cage / '+labels[name]+'</p><h2>'+labels[name]+'</h2><p>'+descriptions[name]+'</p></header></section>').join('')+
    '</div>';
  main.insertBefore(shell,original);
  const pages=Object.fromEntries(names.map(n=>[n,$('cage-page-'+n)]));
  const validation=$('validation');
  if(validation)shell.querySelector('.cage-global-validation').appendChild(validation);

  const designGrid=document.createElement('div');
  designGrid.className='cage-design-grid';
  const designSettings=document.createElement('div');
  designSettings.className='cage-design-settings';
  const designPreview=document.createElement('div');
  designPreview.className='cage-design-preview';
  designGrid.append(designSettings,designPreview);
  pages.design.appendChild(designGrid);

  const membersGroup=controls.querySelector(':scope > .addon-group');
  if(membersGroup)membersGroup.remove();
  designSettings.appendChild(controls);
  const hoopHeading=controls.querySelector(':scope > h2');
  if(hoopHeading)hoopHeading.textContent='Main hoop setup';
  for(const heading of [...controls.querySelectorAll(':scope > h3')]){
    const grid=heading.nextElementSibling;
    if(!grid?.classList.contains('fields'))continue;
    const disclosure=document.createElement('details');
    disclosure.className='cage-setting-fold';
    disclosure.open=true;
    const summary=document.createElement('summary');
    summary.textContent=heading.textContent;
    controls.insertBefore(disclosure,heading);
    disclosure.append(summary,grid);
    heading.remove();
  }
  function fold(node,title,open=false){
    if(!node)return null;
    const wrapper=document.createElement('details');
    wrapper.className='cage-output-fold';
    wrapper.open=open;
    const summary=document.createElement('summary');
    summary.textContent=title;
    wrapper.append(summary,node);
    return wrapper;
  }
  const ruleFold=fold(rules,'Cage rules & class checks (advisory)');
  if(ruleFold)designSettings.appendChild(ruleFold);
  const originalMetrics=results.querySelector(':scope > .summary');
  if(originalMetrics)designPreview.appendChild(originalMetrics);

  const preview=document.createElement('section');
  preview.className='panel cage-preview';
  preview.innerHTML=
    '<div class="cage-preview-head"><div><h3>Live drawing</h3><p>Calculated views · finished centreline geometry</p></div>'+
    '<div class="cage-view-tabs" role="group" aria-label="Drawing direction">'+
    '<button type="button" data-direction="front" aria-pressed="true">Front</button>'+
    '<button type="button" data-direction="side" aria-pressed="false">Side</button>'+
    '<button type="button" data-direction="plan" aria-pressed="false">Plan</button></div></div>'+
    '<label class="cage-preview-picker" for="cageDrawingChoice">Drawing / component<select id="cageDrawingChoice"></select></label>'+
    '<div id="cagePreviewStage" class="cage-preview-stage"></div><p id="cagePreviewHint" class="cage-preview-hint"></p>';
  // Keep the proven SVG drawings as a one-click alternative to the 3D view.
  // The WebGL preview script progressively activates its own mode only after
  // successful GPU initialisation; without it, the original 2D view remains.
  const modeSwitch=document.createElement('div');
  modeSwitch.className='cage-preview-modes';
  modeSwitch.setAttribute('role','group');
  modeSwitch.setAttribute('aria-label','Live preview mode');
  modeSwitch.innerHTML='<button type="button" id="cageShow3D" aria-pressed="false">3D cage</button><button type="button" id="cageShow2D" aria-pressed="true">2D drawings</button>';
  preview.querySelector('.cage-preview-head').appendChild(modeSwitch);
  const twoD=document.createElement('div');
  twoD.id='cage2DInterface';
  for(const selector of ['.cage-view-tabs','.cage-preview-picker','#cagePreviewStage','#cagePreviewHint']){
    const node=preview.querySelector(selector);
    if(node)twoD.appendChild(node);
  }
  const threeD=document.createElement('div');
  threeD.id='cage3DMount';
  threeD.hidden=true;
  preview.append(threeD,twoD);
  designPreview.appendChild(preview);
  const stage=$('cagePreviewStage'),views=[];
  const drawing=results.querySelector('section.drawing');
  if(drawing){
    drawing.classList.add('cage-preview-figure');
    const legend=drawing.querySelector('.legend');
    if(legend){
      const disclosure=document.createElement('details');
      disclosure.className='cage-drawing-legend';
      const summary=document.createElement('summary');
      summary.textContent='Drawing key';
      legend.replaceWith(disclosure);
      disclosure.append(summary,legend);
    }
    stage.appendChild(drawing);
    views.push({id:'drawingSvg',direction:'front',label:'Main hoop · front',node:drawing});
  }
  const viewDefinitions=[
    ['frontFaceSvg','front','Front legs · front','useFrontLegs'],
    ['reinforcementFrontSvg','front','Hoop reinforcement · front',null],
    ['frontSideSvg','side','Front legs · side','useFrontLegs'],
    ['staySideSvg','side','Rear stays · side','useStays'],
    ['doorSideSvg','side','Door bars · side','useDoor'],
    ['reinforcementSideSvg','side','Pillar reinforcement · side',null],
    ['frontPlanSvg','plan','Front legs · plan','useFrontLegs'],
    ['stayPlanSvg','plan','Rear stays · plan','useStays'],
    ['doorPlanSvg','plan','Door bars · plan','useDoor'],
    ['reinforcementPlanSvg','plan','Roof reinforcement · plan',null]
  ];
  for(const [id,direction,label,requires] of viewDefinitions){
    const node=$(id)?.closest('.subview');
    if(!node)continue;
    node.classList.add('cage-preview-figure');
    stage.appendChild(node);
    views.push({id,direction,label,requires,node});
  }
  for(const grid of results.querySelectorAll('.subviews')){
    if(!grid.children.length)grid.hidden=true;
  }
  let activeDirection='front',selectedDrawing='drawingSvg';
  const choice=$('cageDrawingChoice');
  function showDrawing(direction,requested){
    activeDirection=direction;
    const matches=views.filter(v=>v.direction===direction);
    choice.replaceChildren();
    for(const view of matches){
      const option=document.createElement('option');
      option.value=view.id;
      option.textContent=view.label;
      choice.appendChild(option);
    }
    const preferred=matches.find(v=>v.id===requested)||
      matches.find(v=>!v.requires||$(v.requires)?.checked)||matches[0];
    if(!preferred)return;
    selectedDrawing=preferred.id;
    choice.value=selectedDrawing;
    for(const v of views)v.node.hidden=v.id!==selectedDrawing;
    for(const button of preview.querySelectorAll('[data-direction]')){
      button.setAttribute('aria-pressed',String(button.dataset.direction===direction));
    }
    $('cagePreviewHint').textContent=(!preferred.requires||$(preferred.requires)?.checked)
      ?'Indicative geometry only. Check tube dimensions and actual bend allowances before cutting.'
      :'Enable this component under Members to populate its drawing.';
  }
  for(const button of preview.querySelectorAll('[data-direction]')){
    button.addEventListener('click',()=>showDrawing(button.dataset.direction));
  }
  choice.addEventListener('change',()=>showDrawing(activeDirection,choice.value));
  showDrawing('front','drawingSvg');

  const intro=document.createElement('p');
  intro.className='cage-section-hint';
  intro.textContent='Tick a tube to include it in the cut list. Open Settings to edit its dimensions. Turning a tube off retains its measurements.';
  pages.members.appendChild(intro);
  const memberColumns=document.createElement('div');
  memberColumns.className='cage-members-grid';
  const memberSettings=document.createElement('section');
  memberSettings.className='panel cage-member-settings';
  memberSettings.innerHTML='<h3>Tube selection and dimensions</h3>';
  const memberOutputs=document.createElement('div');
  memberOutputs.className='cage-member-outputs';
  memberColumns.append(memberSettings,memberOutputs);
  pages.members.appendChild(memberColumns);
  if(membersGroup)memberSettings.appendChild(membersGroup);
  if(membersGroup){
    for(const heading of [...membersGroup.querySelectorAll('label.addon-heading')]){
      const fields=heading.nextElementSibling;
      if(!fields?.classList.contains('addon-fields'))continue;
      const input=heading.querySelector('input[type=checkbox]');
      const card=document.createElement('div');
      card.className='cage-member-card';
      heading.before(card);
      const head=document.createElement('div');
      head.className='cage-member-card-head';
      const settings=document.createElement('button');
      settings.type='button';
      settings.className='cage-member-toggle';
      settings.setAttribute('aria-controls',fields.id);
      head.append(heading,settings);
      card.append(head,fields);
      let expanded=Boolean(input?.checked&&input.id==='useBrace');
      function updateCard(){
        card.classList.toggle('expanded',expanded);
        card.classList.toggle('enabled',Boolean(input?.checked));
        settings.setAttribute('aria-expanded',String(expanded));
        settings.textContent=expanded?'Hide settings':'Settings';
      }
      settings.addEventListener('click',()=>{expanded=!expanded;updateCard();});
      input?.addEventListener('change',()=>{
        expanded=input.checked;
        updateCard();
        if(views.some(v=>v.id===selectedDrawing))showDrawing(activeDirection,selectedDrawing);
      });
      updateCard();
    }
  }


  // Fast member selection belongs in Design, alongside the live drawing.
  // Proxy checkboxes use the original inputs' native click behaviour so every
  // established geometry/rules listener runs exactly as it does in Members.
  const memberDefinitions=[
    {id:'useFrontLegs',label:'Front legs',preview:'frontFaceSvg'},
    {id:'useStays',label:'Rear stays',preview:'staySideSvg'},
    {id:'useHeader',label:'Windscreen header',requires:'useFrontLegs',requiresLabel:'front legs',preview:'frontFaceSvg'},
    {id:'useBrace',label:'Main hoop diagonal',preview:'drawingSvg'},
    {id:'useMainCross',label:'Second hoop diagonal',preview:'reinforcementFrontSvg'},
    {id:'useRoofX',label:'Roof cross',requires:'useFrontLegs',requiresLabel:'front legs',preview:'reinforcementPlanSvg'},
    {id:'usePillarA',label:'A-pillar braces',requires:'useFrontLegs',requiresLabel:'front legs',preview:'reinforcementSideSvg'},
    {id:'usePillarB',label:'B-pillar braces',requires:'useFrontLegs',requiresLabel:'front legs',preview:'reinforcementSideSvg'},
    {id:'useHarness',label:'Rear-stay crossbar',requires:'useStays',requiresLabel:'rear stays',preview:'stayPlanSvg'},
    {id:'useHoopHarness',label:'Main-hoop harness bar',preview:'reinforcementFrontSvg'},
    {id:'useDoor',label:'Side intrusion bars',preview:'doorSideSvg'},
    {id:'useDoor2',label:'Second door bars',preview:'reinforcementSideSvg'}
  ];
  // The Design editor temporarily moves ONE original member card alongside
  // the live preview. IDs and input listeners are never cloned or replaced.
  const inlineEditor=document.createElement('section');
  inlineEditor.className='panel cage-inline-member-editor';
  inlineEditor.id='cageInlineMemberEditor';
  inlineEditor.hidden=true;
  inlineEditor.innerHTML=
    '<div class="cage-inline-editor-nav">'+
      '<button type="button" id="cageBackToHoop">← Main hoop setup</button>'+
      '<span>MEMBER SETTINGS</span>'+
    '</div>'+
    '<h2 id="cageInlineMemberTitle" tabindex="-1">Member settings</h2>'+
    '<p id="cageInlineMemberHint" class="cage-inline-member-hint"></p>'+
    '<div id="cageInlineMemberBody"></div>';
  designSettings.appendChild(inlineEditor);
  let activeEditor=null;

  function updateInlineEditorHint(){
    if(!activeEditor)return;
    const {definition,source}=activeEditor;
    const dependency=definition.requires&&!$(definition.requires)?.checked;
    const message=!source.checked
      ?'This member is not included yet. Adjust its dimensions below, then tick its checkbox to add it to the cage.'
      :dependency
        ?'This member needs '+definition.requiresLabel+' enabled before its geometry can be calculated.'
        :'Changes here update the live drawing, tube cut list and bend schedules.';
    $('cageInlineMemberHint').textContent=message;
  }
  function closeInlineMemberEditor(){
    if(!activeEditor)return;
    // Restore to the exact original location, including nested front-leg
    // groups, before displaying the Members tab or another member editor.
    const {card,placeholder}=activeEditor;
    if(placeholder.parentNode)placeholder.replaceWith(card);
    activeEditor=null;
    inlineEditor.hidden=true;
    controls.hidden=false;
    if(ruleFold)ruleFold.hidden=false;
    if(typeof syncQuickMembers==='function')syncQuickMembers();
  }
  function openInlineMemberEditor(definition,source){
    const card=source.closest('.cage-member-card');
    if(!card)return;
    if(activeEditor?.card!==card)closeInlineMemberEditor();
    if(!activeEditor){
      const placeholder=document.createComment('member card original position');
      card.before(placeholder);
      $('cageInlineMemberBody').appendChild(card);
      activeEditor={definition,source,card,placeholder};
    }
    controls.hidden=true;
    if(ruleFold)ruleFold.hidden=true;
    inlineEditor.hidden=false;
    $('cageInlineMemberTitle').textContent=definition.label;
    // Ensure the real settings fields are expanded while editing. A disabled
    // member can still have its measurements prepared before being enabled.
    if(!card.classList.contains('expanded'))
      card.querySelector('.cage-member-toggle')?.click();
    updateInlineEditorHint();
    const target=views.find(view=>view.id===definition.preview);
    if(target)showDrawing(target.direction,target.id);
    syncQuickMembers();
    designGrid.scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('cageBackToHoop').addEventListener('click',()=>{
    closeInlineMemberEditor();
    designGrid.scrollIntoView({behavior:'smooth',block:'start'});
  });

  const picker=document.createElement('section');
  picker.className='panel cage-design-member-selector';
  picker.id='designMemberPicker';
  picker.innerHTML=
    '<div class="cage-member-picker-head"><div><h3>Choose cage members</h3>'+
    '<p>Tick the tubes you need; the live drawing and cut list recalculate automatically.</p></div>'+
    '<span id="designMemberSummary" class="cage-member-picker-count" aria-live="polite"></span></div>'+
    '<div class="cage-member-fixed">Main hoop <span>Always included</span><button type="button" id="cageDesignEditMainHoop">Edit</button></div>'+
    '<div id="designMemberOptions" class="cage-member-picker-grid"></div>'+
    '<p class="cage-member-picker-foot">Use <strong>Edit</strong> to change a member’s dimensions beside the live preview. The orange selection boxes control which tubes are included.</p>';
  pages.design.insertBefore(picker,designGrid);
  $('cageDesignEditMainHoop').addEventListener('click',()=>{
    closeInlineMemberEditor();
    designGrid.scrollIntoView({behavior:'smooth',block:'start'});
  });
  const quickOptions=$('designMemberOptions');
  const quickRows=[];
  function syncQuickMembers(){
    let selected=0;
    for(const row of quickRows){
      const {definition,source,proxy,card,status}=row;
      proxy.checked=source.checked;
      proxy.disabled=source.disabled;
      card.classList.toggle('is-selected',source.checked);
      card.classList.toggle('is-editing',activeEditor?.source===source);
      if(source.checked)selected++;
      const pending=Boolean(source.checked&&definition.requires&&!$(definition.requires)?.checked);
      card.classList.toggle('is-pending',pending);
      status.textContent=pending?'Needs '+definition.requiresLabel:'';
      status.hidden=!pending;
    }
    $('designMemberSummary').textContent=selected+' of '+quickRows.length+' selected';
    updateInlineEditorHint();
  }
  for(const definition of memberDefinitions){
    const source=$(definition.id);
    if(!source)continue;
    const card=document.createElement('div');
    card.className='cage-member-quick-card';
    const top=document.createElement('div');
    top.className='cage-member-quick-main';
    const label=document.createElement('label');
    label.className='cage-member-quick-label';
    const proxy=document.createElement('input');
    proxy.type='checkbox';
    proxy.id='design-'+definition.id;
    proxy.checked=source.checked;
    const name=document.createElement('span');
    name.textContent=definition.label;
    label.append(proxy,name);
    const edit=document.createElement('button');
    edit.type='button';
    edit.className='cage-member-quick-edit';
    edit.textContent='Edit';
    edit.setAttribute('aria-label','Edit '+definition.label+' dimensions');
    top.append(label,edit);
    const status=document.createElement('small');
    status.className='cage-member-quick-status';
    status.hidden=true;
    card.append(top,status);
    quickOptions.appendChild(card);
    quickRows.push({definition,source,proxy,card,status});
    proxy.addEventListener('change',()=>{
      // source.click() triggers the original change handlers and calculations.
      if(source.checked!==proxy.checked)source.click();
      syncQuickMembers();
      if(proxy.checked&&definition.preview){
        const requested=views.find(view=>view.id===definition.preview);
        if(requested)showDrawing(requested.direction,requested.id);
      }else if(!proxy.checked){
        showDrawing(activeDirection,selectedDrawing);
      }
    });
    source.addEventListener('change',syncQuickMembers);
    edit.addEventListener('click',()=>openInlineMemberEditor(definition,source));
  }
  syncQuickMembers();

  const addons=$('addonsPanel'),reinforcement=$('reinforcementPanel');
  if(addons)memberOutputs.appendChild(addons);
  if(reinforcement)memberOutputs.appendChild(fold(reinforcement,'Reinforcement geometry summary'));
  const fabrication=pages.fabrication;
  const cutList=$('cageCutPanel');
  if(cutList)fabrication.appendChild(cutList);
  const outputSections=[
    ['cageBendListPanel','All-tube bend mark-out schedule'],
    ['allMemberMarksPanel','Individual tube mark-out diagrams'],
    ['marksPanel','Main-hoop developed mark-out'],
    ['frontPanel','Front-leg reference and bend schedule']
  ];
  for(const [id,title] of outputSections){
    const node=$(id);
    if(node)fabrication.appendChild(fold(node,title));
  }
  const hoopSchedule=[...results.children].find(n=>
    n.matches?.('section.panel')&&!n.id&&!n.classList.contains('drawing'));
  if(hoopSchedule)fabrication.appendChild(fold(hoopSchedule,'Main-hoop bend and straight-section tables'));
  const notch=$('notchPanel');
  if(notch){
    pages.exports.appendChild(notch);
    const help=$('stepExportHelp');
    if(help)notch.insertBefore(fold(help,'STEP modes, limitations and Windows exporter setup'),$('jointNotchCards'));
    const gallery=$('jointNotchCards');
    if(gallery)notch.appendChild(fold(gallery,'Browse individual fishmouth templates'));
  }
  const caution=results.querySelector('.caution');
  if(caution){
    caution.classList.add('cage-workspace-caution');
    shell.appendChild(caution);
  }
  original.remove();

  const buttons=Object.fromEntries(names.map(n=>[n,$('cage-tab-'+n)]));
  function activate(name,scroll=false){
    if(!pages[name])return;
    if(name!=='design')closeInlineMemberEditor();
    for(const key of names){
      pages[key].hidden=key!==name;
      buttons[key].setAttribute('aria-selected',String(key===name));
      buttons[key].tabIndex=key===name?0:-1;
    }
    try{sessionStorage.setItem('dcb-cage-workspace-tab',name);}catch(_){}
    if(scroll)shell.querySelector('.cage-tabs').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function openTarget(id,scroll=true){
    const target=$(id);
    const name=names.find(n=>target&&pages[n].contains(target));
    if(!name)return false;
    activate(name);
    for(let node=target;node&&node!==pages[name];node=node.parentElement){
      if(node.tagName==='DETAILS')node.open=true;
    }
    if(scroll)target.scrollIntoView({behavior:'smooth',block:'start'});
    return true;
  }
  for(const name of names){
    buttons[name].addEventListener('click',()=>activate(name,true));
    buttons[name].addEventListener('keydown',event=>{
      const i=names.indexOf(name);
      let next;
      if(event.key==='ArrowRight')next=names[(i+1)%names.length];
      else if(event.key==='ArrowLeft')next=names[(i+names.length-1)%names.length];
      else if(event.key==='Home')next=names[0];
      else if(event.key==='End')next=names[names.length-1];
      else return;
      event.preventDefault();
      activate(next);
      buttons[next].focus();
    });
  }
  let remembered='design';
  try{remembered=sessionStorage.getItem('dcb-cage-workspace-tab')||'design';}catch(_){}
  const hash=decodeURIComponent(location.hash.slice(1));
  if(!openTarget(hash,false))activate(names.includes(remembered)?remembered:'design');
  window.addEventListener('hashchange',()=>openTarget(decodeURIComponent(location.hash.slice(1))));

  // The original Print layout action still prints the complete fabrication
  // sheet, including panels collapsed for normal on-screen navigation.
  let printState=null;
  window.addEventListener('beforeprint',()=>{
    printState={
      active:names.find(n=>!pages[n].hidden)||'design',
      details:[...shell.querySelectorAll('details')].map(node=>[node,node.open])
    };
    for(const node of shell.querySelectorAll('details'))node.open=true;
    for(const name of names)pages[name].hidden=false;
    for(const view of views)view.node.hidden=false;
  });
  window.addEventListener('afterprint',()=>{
    if(!printState)return;
    for(const [node,open] of printState.details)node.open=open;
    for(const view of views)view.node.hidden=view.id!==selectedDrawing;
    activate(printState.active);
    printState=null;
  });


  function updateOverview(){
    const rows=[...document.querySelectorAll('#cageCutTotals tr')];
    let pieces=0,blank=0;
    for(const row of rows){
      const cells=row.querySelectorAll('td');
      if(cells.length<3)continue;
      const count=Number(cells[1].textContent);
      const length=Number.parseFloat(cells[2].textContent.replace(/,/g,''));
      if(Number.isFinite(count))pieces+=count;
      if(Number.isFinite(length))blank+=length;
    }
    $('overviewTubeCount').textContent=pieces?String(pieces):'—';
    $('overviewPrepLength').textContent=blank?(blank/1000).toLocaleString('en-AU',{maximumFractionDigits:2})+' m':'—';
    $('overviewProfiles').textContent=rows.length?String(rows.length):'—';
    const warnings=document.querySelectorAll('#rulesMessages .rule-message.warn').length;
    const failed=Boolean(validation?.textContent?.trim()&&validation.style.display!=='none');
    const selected=$('rulesBody')?.value;
    const rulesText=failed?'Check dimensions':selected==='generic'?'Advisory':
      warnings?warnings+' review item'+(warnings===1?'':'s'):'Review rules';
    $('overviewRules').textContent=rulesText;
    $('overviewRules').classList.toggle('needs-review',failed||warnings>0);
  }
  for(const id of ['cageCutTotals','rulesMessages','validation']){
    const node=$(id);
    if(node)new MutationObserver(updateOverview).observe(node,{childList:true,subtree:true,characterData:true});
  }
  $('rulesBody')?.addEventListener('change',updateOverview);
  updateOverview();
  document.documentElement.classList.add('cage-workspace-ready');
})();