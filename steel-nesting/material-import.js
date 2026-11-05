'use strict';
// Browser-only import of simple cut lists and multi-section steel material reports.
let materialRecords=[];
let materialSource='';
function cleanCell(value){return String(value==null?'':value).replace(/\u00a0/g,' ').trim();}
function headerKey(value){return cleanCell(value).toLowerCase().replace(/[^a-z0-9]/g,'');}
function normalProfile(value){return cleanCell(value).replace(/[\u00d7*]/g,'x').replace(/\s+/g,'');}
function profileKey(value){return normalProfile(value).toUpperCase();}
function numeric(value){
 if(typeof value==='number')return value;
 const text=cleanCell(value).replace(/,/g,'');
 if(!text || !/^[+-]?\d+(?:\.\d+)?$/.test(text))return NaN;
 return Number(text);
}
function headerColumns(row){
 const keys=row.map(headerKey);
 const find=(names)=>keys.findIndex(k=>names.includes(k));
 const col={
  profile:find(['profile','profil','section','sectionsize','sectiondesignation','profiledesignation','materialsize','size']),
  part:find(['partpos','partmark','partname','partno','partnumber','partid','mark','markno','position','piece','item','itemno','part']),
  grade:find(['grade','steelgrade','materialgrade','quality','materialquality']),
  qty:find(['qty','quantity','requiredqty','qtyrequired','pieces','pcs','count','numberrequired']),
  length:find(['lengthmm','length','cutlengthmm','cutlength','memberlength','memberlengthmm','lenmm','len'])
 };
 return col.part>=0&&col.qty>=0&&col.length>=0?col:null;
}
function extractMaterialRecords(sheets,fallbackProfile,fallbackGrade){
 const records=[];
 let dataRows=0,invalid=0,headers=0,totals=0;
 for(const sheet of sheets){
  let cols=null;
  for(const [rowIndex,row] of sheet.rows.entries()){
   const cells=Array.isArray(row)?row:[];
   if(!cells.length)continue;
   const header=headerColumns(cells);
   if(header){cols=header;headers++;continue;}
   const flat=cells.map(cleanCell).filter(Boolean);
   if(!flat.length)continue;
   if(flat.some(x=>/^(subtotal|grand total|total|totals)$/i.test(x))){totals++;continue;}
   let rawPart,rawLen,rawQty,rawProfile,rawGrade;
   if(cols){
    rawPart=cells[cols.part];rawLen=cells[cols.length];rawQty=cells[cols.qty];
    rawProfile=cols.profile>=0?cells[cols.profile]:fallbackProfile;
    rawGrade=cols.grade>=0?cells[cols.grade]:fallbackGrade;
   }else{
    // Legacy plain CSV: mark,length,quantity or length,quantity
    if(cells.length>=3&&cleanCell(cells[0])&&!Number.isFinite(numeric(cells[0]))){
     rawPart=cells[0];rawLen=cells[1];rawQty=cells[2];rawProfile=fallbackProfile;rawGrade=fallbackGrade;
    }else if(cells.length>=2&&Number.isFinite(numeric(cells[0]))){
     rawPart='Part '+(rowIndex+1);rawLen=cells[0];rawQty=cells[1];rawProfile=fallbackProfile;rawGrade=fallbackGrade;
    }else continue;
   }
   const name=cleanCell(rawPart),profile=normalProfile(rawProfile),grade=cleanCell(rawGrade);
   if(!name||/^(subtotal|total|grand total)$/i.test(name))continue;
   const length=numeric(rawLen),qty=numeric(rawQty);
   if(!(length>0&&length<1000000)||!Number.isInteger(qty)||qty<1||qty>100000){
    if(cols&&name)invalid++;
    continue;
   }
   if(!profile){invalid++;continue;}
   dataRows++;
   records.push({profile,grade,mark:name,length,qty,sheet:sheet.name,row:rowIndex+1});
   if(records.length>20000)throw Error('Material file contains more than 20,000 part lines. Split it into smaller files.');
  }
 }
 return {records,dataRows,invalid,headers,totals};
}
function parseDelimited(text,separator){
 const rows=[];let line=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
   else if(ch==='"')quoted=false;
   else field+=ch;
  }else if(ch==='"'&&field==='')quoted=true;
  else if(ch===separator){line.push(field);field='';}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   line.push(field);if(line.some(v=>cleanCell(v)))rows.push(line);
   line=[];field='';
  }else field+=ch;
 }
 line.push(field);if(line.some(v=>cleanCell(v)))rows.push(line);
 return rows;
}
function guessSeparator(text){
 const first=text.split(/\r?\n/).slice(0,6).join('\n');
 const tokens=[',','\t',';'];
 return tokens.map(ch=>({ch,n:first.split(ch).length-1})).sort((a,b)=>b.n-a.n)[0].ch;
}
function ensureSheetJS(){
 if(window.XLSX)return Promise.resolve(window.XLSX);
 if(window.__sheetJSPromise)return window.__sheetJSPromise;
 window.__sheetJSPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  script.referrerPolicy='no-referrer';
  script.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('Spreadsheet reader did not initialise.'));
  script.onerror=()=>reject(Error('Could not load the Excel reader. Check your internet connection, or export the report as CSV.'));
  document.head.appendChild(script);
 }).catch(error=>{window.__sheetJSPromise=null;throw error;});
 return window.__sheetJSPromise;
}
function inferFamily(profile){
 const p=profileKey(profile);
 if(/^\d+(UB|UC)/.test(p))return RegExp.$1;
 for(const family of ['RHS','SHS','CHS','PFC','UB','UC','EA','UA','FLAT'])if(p.startsWith(family))return family;
 return 'CUSTOM';
}
function setProfileFromReport(profile){
 const family=inferFamily(profile);
 el('profileFamily').value=family;
 refreshProfileSizes();
 const canonical=profileKey(profile);
 const values=Array.from(el('profileSize').options).map(o=>o.value);
 const existing=values.find(v=>v!=='__custom__'&&profileKey(v)===canonical);
 if(existing)el('profileSize').value=existing;
 else {
  el('profileSize').value='__custom__';
  el('customProfile').value=profile;
 }
 syncSelectedProfile();
}
function clearOptionList(select){
 while(select.firstChild)select.removeChild(select.firstChild);
}
function addOption(select,value,label){
 const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
}
function refreshImportGrades(preferred){
 const profile=el('importProfile').value;
 const matches=materialRecords.filter(r=>profileKey(r.profile)===profileKey(profile));
 const grades=[...new Set(matches.map(r=>r.grade))].sort();
 const select=el('importGrade');clearOptionList(select);
 for(const grade of grades)addOption(select,grade,grade||'(Grade not specified)');
 select.value=grades.includes(preferred)?preferred:grades[0]||'';
 applyMaterialSelection();
}
function applyMaterialSelection(){
 if(!materialRecords.length)return;
 const profile=el('importProfile').value,grade=el('importGrade').value;
 const chosen=materialRecords.filter(r=>profileKey(r.profile)===profileKey(profile)&&r.grade===grade);
 const totalQty=chosen.reduce((sum,r)=>sum+r.qty,0);
 const summary=el('importSummary');
 if(totalQty>2000){
  summary.textContent=chosen.length+' lines contain '+totalQty+' parts, exceeding the 2,000-part limit. Filter or split this profile before nesting.';
  summary.className='warning';
  el('parts').value='';
  el('download').disabled=true;
  status('This profile exceeds the 2,000-member limit.','error');return;
 }
 // Existing cutting text parser is line-based: reject marks containing delimiters.
 const badMarks=chosen.filter(r=>/[,;\n\r]/.test(r.mark));
 if(badMarks.length){
  summary.textContent=badMarks.length+' part marks contain commas/semicolons. Export a cleaned cut list before importing this selection.';
  summary.className='warning';
  status('Unsupported part-mark punctuation detected.','error');return;
 }
 setProfileFromReport(profile);
 if(grade)el('grade').value=grade;
 el('parts').value=chosen.map(r=>[r.mark,r.length,r.qty,normalProfile(r.profile)].join(',')).join('\n');
 summary.textContent=chosen.length+' material lines · '+totalQty+' pieces · '+(grade||'grade not specified')+'. Ready to optimise.';
 summary.className='import-note';
 el('download').disabled=true;
 el('print').disabled=true;
 status('Imported '+totalQty+' parts for '+profile+' ('+(grade||'ungraded')+'). Select Optimise.');
}
function loadParsedMaterialRecords(report,filename){
  materialRecords=report.records;
  materialSource=filename;
  const profileMap=new Map();
  for(const r of materialRecords){
   const key=profileKey(r.profile);
   if(!profileMap.has(key))profileMap.set(key,{display:r.profile,qty:0});
   profileMap.get(key).qty+=r.qty;
  }
  const select=el('importProfile');clearOptionList(select);
  const profiles=[...profileMap.values()].sort((a,b)=>a.display.localeCompare(b.display,undefined,{numeric:true}));
  for(const p of profiles)addOption(select,p.display,p.display+' · '+p.qty+' pcs');
  el('importPanel').hidden=false;
  el('fileInfo').textContent=filename+' · '+materialRecords.length+' material lines · '+profiles.length+' profiles'+(report.invalid?' · '+report.invalid+' rows skipped':'');
  refreshImportGrades('');
}
async function importMaterialFile(){
 const file=el('upload').files?.[0];if(!file)return;
 const name=file.name.toLowerCase();
 if(!/\.(xls|xlsx|xlsm|csv|tsv|txt|pdf)$/.test(name)){status('Supported formats are XLS, XLSX, CSV, TSV and text-based PDF material lists.','error');return;}
 if(file.size>8*1024*1024){status('This file exceeds the 8 MB import limit. Split it by profile.','error');return;}
 status('Reading '+file.name+' locally…');
 if(name.endsWith('.pdf')){
  try{await importPdfMaterialFile(file);}
  catch(err){status('PDF import failed: '+(err.message||String(err)),'error');}
  return;
 }
 try{
  let sheets=[];
  if(/\.(xls|xlsx|xlsm)$/.test(name)){
   const XLSX=await ensureSheetJS();
   const wb=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:false});
   sheets=wb.SheetNames.map(sheet=>({name:sheet,rows:XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true,blankrows:false})}));
  }else{
   const text=await file.text();
   const delimiter=name.endsWith('.tsv')?'\t':guessSeparator(text);
   sheets=[{name:'Text import',rows:parseDelimited(text.replace(/^\uFEFF/,''),delimiter)}];
  }
  const report=extractMaterialRecords(sheets,el('profile').value,el('grade').value);
  if(!report.records.length)throw Error('No usable Part / Length / Qty rows found. Check that the report contains an identifiable header.');
  loadParsedMaterialRecords(report,file.name);
 }catch(err){
  status('Import failed: '+(err.message||String(err)),'error');
 }
}
el('upload').addEventListener('change',importMaterialFile);
el('importProfile').addEventListener('change',()=>refreshImportGrades(''));
el('importGrade').addEventListener('change',applyMaterialSelection);
