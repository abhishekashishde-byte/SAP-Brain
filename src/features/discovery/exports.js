import { discoveryCatalog, scopeIncludes, decisionsEnabled, withoutDecisions } from './catalog.js'
import { entryKey } from './data.js'
import { processCatalog } from './processCatalog.js'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const xml=s=>esc(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
const valueText=v=>v==null?'':Array.isArray(v)?v.join('; '):typeof v==='object'?JSON.stringify(v):String(v)
const clean=v=>v==null?'':typeof v==='string'?v:valueText(v)
function gather(workshop,entries,todos,audience='client',extras={}) {
 const get=(o,t,id)=>entries[entryKey(o,t,id)]
 const can=(e)=>audience==='internal'||!e?.is_internal
 const rows={Overview:[['Property','Value']],Requirements:[['Area','SAP Object','T-codes','Field ID','Field','Tier','Status','Field note','Object status']],Questions:[['Area','SAP Object','Question ID','Question','Type','Answer','Other','Approximate','Note']],Decisions:[['Area','SAP Object','Decision ID','Decision','Selected option','Status','Rationale']],Actions:[['SAP Object','Action item','Owner','Due date','Status']],Notes:[['Level','Area','SAP Object','Note','Internal']],Custom:[['Area','SAP Object','Type','ID','Description','Value']],Coverage:[['Area','SAP Object','Item type','Total','Completed','Open']],SourceSystems:[['Name','Type','Version','Owner / contact','Notes']],ObjectSources:[['Area','SAP Object','Source systems','Not maintained','Notes']],ExtraFields:[['Area','SAP Object','Source system','Source field','Meaning / example','Used today','SAP handling','SAP target','SAP catalog field','Notes','Origin']],Processes:[['Category','Process ID','Process / job','Description','Status','Frequency','Run window','Volume','Responsible','How done today','SAP hint','Related objects','Note']],ProcessQuestions:[['Category','Process','Question ID','Question','Type','Answer']]}
 const add=(k,v)=>rows.Overview.push([k,clean(v)])
 ;[['Customer',workshop.client_name],['Meeting date',workshop.call_date],['Time',[(workshop.start_time||''),(workshop.end_time||'')].filter(Boolean).join(' – ')],['Workshop',workshop.title],['Project',workshop.project_name],['Consultant',workshop.consultant_name],['Participants',workshop.participants],['Legacy system',workshop.legacy_system],['SAP module','Plant Maintenance'],['Catalog version',workshop.catalog_version],['Status',workshop.status],['Audience',audience]].forEach(([k,v])=>add(k,v))
 const objects=discoveryCatalog.objects.filter(o=>scopeIncludes(workshop.scope_areas,o.area)).map(o=>decisionsEnabled(entries)?o:withoutDecisions(o))
 const labels=Object.fromEntries(discoveryCatalog.areas.map(a=>[a.id,a.title]))
 const workshopNote=get('workshop','workshop_note','main')
 if(can(workshopNote)&&workshopNote?.value?.text)rows.Notes.push(['Workshop','','',workshopNote.value.text,!!workshopNote.is_internal])
 for(const area of discoveryCatalog.areas){
  if(!objects.some(o=>o.area===area.id))continue
  const a=get(area.id,'area_note','main')
  if(can(a)&&a?.value?.text)rows.Notes.push(['Area',area.title,'',a.value.text,!!a.is_internal])
 }
 for(const category of processCatalog.categories){
  const n=get('process:'+category.id,'area_note','main')
  if(can(n)&&n?.value?.text)rows.Notes.push(['Process category',category.title,'',n.value.text,!!n.is_internal])
 }
 const coverage={fields:0,marked:0,questions:0,answered:0,decisions:0,decided:0,clarify:0}
 for(const o of objects){
  const a=labels[o.area],tc=o.tcodes.join(', '),status=get(o.id,'object_status','main')?.value?.status||'not_started'
  const fieldCount=o.fields.filter(f=>!!get(o.id,'field',f.id)?.value?.mark).length
  const questionCount=o.questions.filter(q=>{const v=get(o.id,'question',q.id)?.value?.answer;return v!==undefined&&v!==''&&(!Array.isArray(v)||v.length>0)}).length
  const decisionCount=o.decisions.filter(d=>get(o.id,'decision',d.id)?.value?.status==='decided').length
  rows.Coverage.push([a,o.title,'Fields',o.fields.length,fieldCount,o.fields.length-fieldCount])
  rows.Coverage.push([a,o.title,'Questions',o.questions.length,questionCount,o.questions.length-questionCount])
  rows.Coverage.push([a,o.title,'Decisions',o.decisions.length,decisionCount,o.decisions.length-decisionCount])
  coverage.fields+=o.fields.length;coverage.marked+=fieldCount;coverage.questions+=o.questions.length;coverage.answered+=questionCount;coverage.decisions+=o.decisions.length;coverage.decided+=decisionCount
  for(const f of o.fields){const e=get(o.id,'field',f.id),v=e?.value||{};if(v.mark==='clarify')coverage.clarify++;rows.Requirements.push([a,o.title,tc,f.id,f.label,f.tier,v.mark||'unmarked',can(e)?v.note||'':'',status])}
  for(const q of o.questions){const e=get(o.id,'question',q.id),v=e?.value||{};rows.Questions.push([a,o.title,q.id,q.text,q.type,clean(v.answer),v.other||'',v.approx?'Yes':'',can(e)?v.note||'':''])}
  for(const d of o.decisions){const v=get(o.id,'decision',d.id)?.value||{};rows.Decisions.push([a,o.title,d.id,d.text,v.choice==='Other…'?v.other||'Other':v.choice||'',v.status||'open',v.rationale||'',(extras.firstCall?.stakeholders||[]).find(s=>s.id===v.decided_by)?.name||'',v.decided_at||''])}
  for(const row of Object.values(entries).filter(x=>x.object_id===o.id&&(x.item_type==='custom_field'||x.item_type==='custom_question')))rows.Custom.push([a,o.title,row.item_type,row.item_id,row.value?.label||row.value?.text||'',row.value?.mark||row.value?.answer||''])
  for(const type of ['legacy_today','note']){const e=get(o.id,type,'main');if(can(e)&&e?.value?.text)rows.Notes.push([type==='note'?'Object':'Legacy today',a,o.title,e.value.text,!!e.is_internal])}
 }
 const {sourceSystems=[],objectSources={},legacyFields=[],processEntries={},legacyHints=[],firstCall={},gaps=[],inventories={}}=extras
 const sourceById=Object.fromEntries(sourceSystems.map(x=>[x.id,x]))
 for(const source of sourceSystems)rows.SourceSystems.push([source.name,source.system_type,source.version||'',source.owner||'',source.notes||''])
 for(const o of objects){
  const src=objectSources[o.id]||{}
  rows.ObjectSources.push([labels[o.area],o.title,(src.source_system_ids||[]).map(id=>sourceById[id]?.name||'(source removed)').join('; '),src.not_maintained?'Yes':'No',src.note||''])
 }
 for(const item of legacyFields.filter(x=>objects.some(o=>o.id===x.object_id))){
  const object=objects.find(o=>o.id===item.object_id)
  rows.ExtraFields.push([labels[object.area],object.title,sourceById[item.source_system_id]?.name||'',item.source_field,item.meaning||'',item.used_today||'',item.sap_handling||'unmapped',item.sap_target||'',item.sap_catalog_field_id||'',item.note||'',item.origin||'manual'])
 }
 if(audience==='internal'){
  rows.LegacyHints=[['SAP Object','Legacy feature','Suggested mapping / gap','Gap type','Source reference']]
  for(const h of legacyHints.filter(h=>h.accepted===true))rows.LegacyHints.push([discoveryCatalog.objects.find(o=>o.id===h.object_id)?.title||h.object_id,h.legacy_feature,h.hint,h.gap_type,h.source_ref||''])
 }
 const {stakeholders=[],drivers=[],sizing=[],requests=[],parking=[]}=firstCall
 rows.Stakeholders=[['Name','Organisation','Function / role','Project role','Responsible for','Present','Contact','Notes']]
 for(const x of stakeholders)rows.Stakeholders.push([x.name,x.organisation||'',x.function_role||'',x.project_role||'',(x.responsible_for||[]).join('; '),x.present?'Yes':'No',audience==='internal'?x.contact||'':'',audience==='internal'||!x.is_internal?x.note||'':''])
 rows.Drivers=[['Type','Description','Priority','Raised by','Affected items','KPI','Baseline','Notes']]
 for(const x of drivers)rows.Drivers.push([x.kind,x.text,x.priority,stakeholders.find(z=>z.id===x.raised_by)?.name||'',(x.affected||[]).join('; '),x.kpi||'',x.baseline||'',x.note||''])
 rows.Sizing=[['Metric ID','Label','Unit','Value','Approximate','Source','Notes']]
 for(const x of sizing)rows.Sizing.push([x.metric_id,x.custom_label||'',x.custom_unit||'',x.value??'',x.approx?'Yes':'No',x.source||'',x.note||''])
 rows.Requests=[['Item','Related ID','Format','From','Due date','Status','Notes']]
 for(const x of requests)rows.Requests.push([x.item,x.related_id||'',x.format||'',stakeholders.find(z=>z.id===x.from_stakeholder)?.name||'',x.due_date||'',x.status||'open',x.note||''])
 rows.Parking=[['Topic','Context','Status','Created at','Notes']]
 for(const x of parking)rows.Parking.push([x.text,x.context_id||'',x.status||'parked',x.created_at||'',x.note||''])
 rows.Gaps=[['Gap ID','Title','Description','Related item','Origin','Gap type','RICEFW','Size','Size points','Priority','Owner','Status','Solution idea','Notes']]
 const sizePts={S:1,M:3,L:8,XL:13}
 for(const g of gaps)rows.Gaps.push(['G-'+String(g.seq).padStart(3,'0'),g.title,g.description||'',g.related_id||'',g.origin,g.gap_type||'',g.ricefw||'',g.size||'',sizePts[g.size]||0,g.priority||'',g.owner||'',g.status||'open',audience==='internal'||!g.is_internal_solution?g.solution_idea||'':'',g.note||''])
 rows.Interfaces=[['Name','Partner system','Direction','Related object/process','Data / object','Frequency','Volume','Technology','Today exists','Owner','Status','Notes']]
 for(const x of inventories.interfaces||[])rows.Interfaces.push([x.name,x.partner_system||'',x.direction||'',x.related_id||'',x.data_text||'',x.frequency||'',x.volume||'',x.technology||'',x.exists_today||'',stakeholders.find(p=>p.id===x.owner_stakeholder)?.name||'',x.status||'open',x.note||''])
 rows.FormsReports=[['Name','Kind','Related object','Used by','Frequency','Today in','Sample received','Linked request','Decision','Notes']]
 for(const x of inventories.forms_reports||[])rows.FormsReports.push([x.name,x.kind||'',x.related_id||'',x.used_by||'',x.frequency||'',x.today_in||'',x.sample_received?'Yes':'No',requests.find(r=>r.id===x.request_id)?.item||'',x.decision||'',x.note||''])
 rows.RAID=[['Kind','Description','Related item','Probability','Impact','Mitigation / validation','Owner','Status','Notes']]
 for(const x of inventories.raid||[])rows.RAID.push([x.kind,x.text,x.related_id||'',x.probability||'',x.impact||'',x.mitigation||'',stakeholders.find(p=>p.id===x.owner_stakeholder)?.name||'',x.status||'open',audience==='internal'||!x.is_internal?x.note||'':''])
 const customProcesses=Object.values(processEntries).filter(x=>x.custom).map(x=>({...x.custom,id:x.process_id,sapHint:'',relatedObjects:'',questions:[]}))
 for(const p of [...processCatalog.processes,...customProcesses]){
  const state=processEntries[p.id]||{},category=processCatalog.categories.find(c=>c.id===p.category)?.title||p.category
  rows.Processes.push([category,p.id,p.title,p.plain,state.status||'unanswered',state.frequency||'',state.run_window||'',state.volume||'',state.responsible||'',state.today||'',audience==='internal'?p.sapHint||'':'',p.relatedObjects||'',audience==='internal'||!state.is_internal?state.note||'':''])
  for(const q of p.questions||[]){const answer=state.answers?.[q.id]?.answer;rows.ProcessQuestions.push([category,p.title,q.id,q.text,q.type,clean(answer)])}
 }
 const names=Object.fromEntries(discoveryCatalog.objects.map(o=>[o.id,o.title]))
 for(const t of todos) rows.Actions.push([names[t.object_id]||'',t.text,t.owner||'',t.due_date||'',t.done?'Done':'Open'])
 for(const k of ['fields','marked','questions','answered','decisions','decided','clarify'])add(k,coverage[k])
 return {rows,coverage,objects}
}
function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
const filename=w=>(w.client_name||'customer').replace(/[^a-z0-9_-]+/gi,'_').slice(0,35)+'_'+(w.call_date||'undated')
const tab=v=>String(v??'').replace(/\t/g,' ').replace(/\r?\n/g,' ')
const csvLine=a=>a.map(v=>'"'+tab(valueText(v)).replace(/"/g,'""')+'"').join(',')
const CSV_FILENAMES={SourceSystems:'source_systems.csv',ObjectSources:'object_sources.csv',ExtraFields:'extra_fields.csv',ProcessQuestions:'process_questions.csv',LegacyHints:'legacy_hints.csv',FormsReports:'forms_reports.csv'}
export function exportCSV(w,e,t,audience,extras){
 const {rows}=gather(w,e,t,audience,extras)
 const files=Object.entries(rows).map(([name,data])=>[
  CSV_FILENAMES[name]||name.toLowerCase().replace(/[^a-z0-9]+/g,'_')+'.csv',
  '\ufeff'+data.map(csvLine).join('\r\n')+'\r\n'
 ])
 download(zip(files,'application/zip'),filename(w)+'_CSV.zip')
}
export function exportJSON(w,e,t,audience,extras){const {rows}=gather(w,e,t,audience,extras);download(new Blob([JSON.stringify({workshop:w,audience,sheets:rows},null,2)],{type:'application/json'}),filename(w)+'.json')}
export function exportMarkdown(w,e,t,audience,extras){const {rows}=gather(w,e,t,audience,extras);let md='# '+w.client_name+' — '+(w.title||'Discovery Workshop')+'\n\nMeeting date: '+w.call_date+'\n\n';for(const [sheet,data] of Object.entries(rows)){md+='## '+sheet+'\n\n';md+='| '+data[0].map(tab).join(' | ')+' |\n|'+data[0].map(()=>'---').join('|')+'|\n';for(const line of data.slice(1))md+='| '+line.map(x=>tab(valueText(x)).replace(/\|/g,'\\|')).join(' | ')+' |\n';md+='\n'}download(new Blob([md],{type:'text/markdown;charset=utf-8'}),filename(w)+'.md')}

// Minimal standards-compliant, dependency-free XLSX writer. ZIP store method,
// Office OpenXML inline strings, widths, filters, frozen header and print setup.
const te=new TextEncoder()
const u16=(a,n)=>{a.push(n&255,(n>>>8)&255)}
const u32=(a,n)=>{a.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zip(files,mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const local=[],central=[];let offset=0
 for(const [name,body] of files){const nameBytes=te.encode(name),data=te.encode(body),sum=crc(data),lh=[];u32(lh,0x04034b50);u16(lh,20);u16(lh,0);u16(lh,0);u16(lh,0);u16(lh,0);u32(lh,sum);u32(lh,data.length);u32(lh,data.length);u16(lh,nameBytes.length);u16(lh,0);local.push(new Uint8Array(lh),nameBytes,data)
 const ch=[];u32(ch,0x02014b50);u16(ch,20);u16(ch,20);u16(ch,0);u16(ch,0);u16(ch,0);u16(ch,0);u32(ch,sum);u32(ch,data.length);u32(ch,data.length);u16(ch,nameBytes.length);u16(ch,0);u16(ch,0);u16(ch,0);u16(ch,0);u32(ch,0);u32(ch,offset);central.push(new Uint8Array(ch),nameBytes)
 offset+=lh.length+nameBytes.length+data.length
 }
 const centre=central.reduce((n,a)=>n+a.length,0),tail=[];u32(tail,0x06054b50);u16(tail,0);u16(tail,0);u16(tail,files.length);u16(tail,files.length);u32(tail,centre);u32(tail,offset);u16(tail,0)
 return new Blob([...local,...central,new Uint8Array(tail)],{type:mime})
}
const letters=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function sheetXML(data){const size=Math.max(1,...data.map(x=>x.length)),last=letters(size-1)
 const widths=Array.from({length:size},(_,i)=>Math.min(64,Math.max(14,...data.slice(0,150).map(r=>String(r[i]??'').length+2))))
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
 '<cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+
 data.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{const cell=letters(ci)+(ri+1),str=valueText(v);return typeof v==='number'&&Number.isFinite(v)?'<c r="'+cell+'" s="'+(ri===0?1:0)+'"><v>'+v+'</v></c>':'<c r="'+cell+'" t="inlineStr" s="'+(ri===0?1:0)+'"><is><t xml:space="preserve">'+xml(str)+'</t></is></c>'}).join('')+'</row>').join('')+
 '</sheetData><autoFilter ref="A1:'+last+data.length+'"/><pageMargins left="0.25" right="0.25" top="0.55" bottom="0.55" header="0.25" footer="0.25"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>'
}
export function exportXLSX(w,e,t,audience,extras){
 const {rows}=gather(w,e,t,audience,extras),names=Object.keys(rows)
 const files=[['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+names.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
 ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,i)=>'<sheet name="'+xml(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(names.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml','<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF302445"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs></styleSheet>']]
 names.forEach((n,i)=>files.push(['xl/worksheets/sheet'+(i+1)+'.xml',sheetXML(rows[n])]))
 download(zip(files),filename(w)+'.xlsx')
}
export function printReport(w,e,t,audience,extras){
 const {rows}=gather(w,e,t,audience,extras)
 const popup=window.open('','_blank');if(!popup){alert('Please allow pop-ups to print this report.');return}
 const body=Object.entries(rows).map(([name,data])=>'<section><h2>'+esc(name)+'</h2><table><thead><tr>'+data[0].map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+data.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+esc(valueText(c))+'</td>').join('')+'</tr>').join('')+'</tbody></table></section>').join('')
 popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(w.client_name)+' · Discovery Workshop</title><style>body{font:11px/1.5 Arial;color:#151515;margin:15mm}h1{font-size:22px}h2{font-size:15px;border-bottom:2px solid #333;padding-bottom:6px}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #bbb;padding:5px;overflow-wrap:anywhere;vertical-align:top}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}section{break-before:page}section:first-of-type{break-before:auto}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>'+esc(w.client_name)+' — '+esc(w.title)+'</h1><p>Meeting date: '+esc(w.call_date)+' · '+esc(audience)+' report</p>'+body+'</body></html>')
 popup.document.close();popup.focus();popup.print()
}
export function exportScopePack(w,e,t,audience,extras){
 const {rows}=gather(w,e,t,audience,extras)
 const sections=['Sizing','Gaps','Interfaces','FormsReports','RAID']
 const data=sections.map(name=>{
  const lines=rows[name]||[[]]
  return '## '+(name==='FormsReports'?'Forms & reports':name)+'\n\n'+
    '| '+lines[0].map(tab).join(' | ')+' |\n|'+lines[0].map(()=>'---').join('|')+'|\n'+
    lines.slice(1).map(r=>'| '+r.map(v=>tab(valueText(v)).replace(/\\|/g,'\\\\|')).join(' | ')+' |').join('\n')
 }).join('\n\n')
 const sizePoints=(extras.gaps||[]).filter(g=>g.status!=='rejected').reduce((n,g)=>n+({S:1,M:3,L:8,XL:13}[g.size]||0),0)
 const summary='# Scope pack — '+w.client_name+'\n\nWorkshop: '+w.title+'\nMeeting date: '+w.call_date+'\nAudience: '+audience+'\nTotal relative size points: '+sizePoints+'\n\n'
 download(new Blob([summary+data+'\n'],{type:'text/markdown;charset=utf-8'}),filename(w)+'_scope_pack.md')
}
export {gather}
