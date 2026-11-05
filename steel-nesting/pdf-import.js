'use strict';
// Text-based fixed-column steel material-list PDFs. All PDF content stays on device.
const PDF_ENGINE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/';
let pdfEnginePromise = null;
function getPdfEngine(){
 if(pdfEnginePromise)return pdfEnginePromise;
 pdfEnginePromise=import(PDF_ENGINE+'pdf.min.mjs').then(pdf=>{
   pdf.GlobalWorkerOptions.workerSrc=PDF_ENGINE+'pdf.worker.min.mjs';
   return pdf;
 }).catch(e=>{pdfEnginePromise=null;throw new Error('PDF reader could not load. Check your internet connection, or export this report to CSV. '+(e.message||e));});
 return pdfEnginePromise;
}
// This report layout places Mark, Profile, Grade, Qty, Length and Name
// in six fixed horizontal bands. Fractions are relative to page width.
const PDF_COLUMN_BOUNDS=[92/595.32,205/595.32,320/595.32,349/595.32,408/595.32];
function westwoodPdfLines(page){
 const lines=[];
 for(const item of page.items){
  if(!item||typeof item.str!=='string'||!item.str.trim())continue;
  const transform=item.transform||[],y=Number(transform[5]),x=Number(transform[4]);
  if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  let row=lines.find(r=>Math.abs(r.y-y)<3);
  if(!row){row={y,fields:['','','','','','']};lines.push(row);}
  const content=item.str,width=Number(item.width)||Math.max(content.length*4,1);
  for(let i=0;i<content.length;i++){
   const ch=content[i];
   if(!ch||/\s/.test(ch))continue;
   const relative=(x+(i+.5)*width/content.length)/page.width;
   const col=PDF_COLUMN_BOUNDS.findIndex(v=>relative<v);
   row.fields[col<0?5:col]+=ch;
  }
 }
 return lines.sort((a,b)=>b.y-a.y);
}
function parseFixedColumnPdf(pages){
 const records=[],issues=[];let candidates=0,headerSeen=false;
 for(let pageNo=0;pageNo<pages.length;pageNo++){
  const page=pages[pageNo];
  const lines=westwoodPdfLines(page);
  for(const line of lines){
   const f=line.fields.map(v=>v.replace(/\s/g,'').trim());
   if(/mark/i.test(f[0])&&/profile/i.test(f[1])){headerSeen=true;continue;}
   if(!f[0]||!f[1])continue;
   // Non-member lines (decorative separators, headings, subtotal rows) are ignored.
   const profile=normalProfile(f[1]);
   if(!/^(?:RHS|SHS|CHS|PFC|EA|UA|UB|UC|FLAT)[0-9]/i.test(profile))continue;
   candidates++;
   const mark=f[0],grade=f[2],qty=Number(f[3]),length=Number(f[4]);
   if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(mark)||
      !grade||!Number.isInteger(qty)||qty<1||qty>100000||
      !Number.isFinite(length)||length<=0||length>=1000000){
      issues.push('Page '+(pageNo+1)+' near '+Math.round(line.y)+' pt: '+f.join(' / '));
      continue;
   }
   records.push({profile,grade,mark,qty,length,sheet:'PDF page '+(pageNo+1),row:records.length+1});
   if(records.length>20000)throw Error('Too many material lines in this PDF (20,000 maximum).');
  }
 }
 if(issues.length){
  throw Error('PDF has '+issues.length+' unrecognised part rows; import stopped to avoid omitting cuts. Example: '+issues[0]+'. Check the PDF or export it to Excel.');
 }
 if(records.length===0){
  throw Error('No supported material rows were found. This importer requires a text-based, column-aligned steel material list, not a scanned image or drawing.');
 }
 if(!headerSeen)throw Error('This PDF does not appear to use the expected Mark / Profile / Grade / Qty / L(mm) material-list layout. Convert it to CSV before importing.');
 return {records,dataRows:records.length,invalid:0,headers:pages.length,totals:0,candidates};
}
async function importPdfMaterialFile(file){
 status('Reading '+file.name+' locally…');
 const pdfjs=await getPdfEngine();
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
 let doc;
 try{
  doc=await task.promise;
  if(doc.numPages>100)throw Error('This PDF is over 100 pages. Split it into smaller reports.');
  const pages=[];
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
   const page=await doc.getPage(pageNo);
   const text=await page.getTextContent();
   pages.push({width:page.getViewport({scale:1}).width,items:text.items});
   page.cleanup();
  }
  const report=parseFixedColumnPdf(pages);
  loadParsedMaterialRecords(report,file.name);
 }finally{
  if(doc)await doc.destroy();
  else task.destroy();
 }
}
