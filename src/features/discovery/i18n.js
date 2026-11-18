import pmDe from './catalog/sap-pm-discovery-catalog.de.json'
import processDe from './catalog/sap-pm-process-catalog.de.json'
import { discoveryCatalog } from './catalog.js'
import { processCatalog } from './processCatalog.js'
const readyPm=pmDe.reviewed===true&&pmDe.version===discoveryCatalog.version
const readyProcess=processDe.reviewed===true&&processDe.version===processCatalog.version
export const germanCatalogStatus={objects:readyPm,processes:readyProcess}
export const getAreaTitle=(area,language='en')=>language==='de'&&readyPm?pmDe.areas[area.id]?.title||area.title:area.title
export const getProcessCategoryTitle=(category,language='en')=>language==='de'&&readyProcess?processDe.categories[category.id]?.title||category.title:category.title
export function localizeObject(o,language='en'){
 if(!o||language!=='de'||!readyPm)return o
 const de=pmDe.objects[o.id]
 if(!de)return o
 return {...o,title:de.title||o.title,plain:de.plain||o.plain,
  fields:o.fields.map(f=>({...f,label:de.fields?.[f.id]?.label||f.label})),
  questions:o.questions.map(q=>({...q,text:de.questions?.[q.id]?.text||q.text,options:de.questions?.[q.id]?.options?.length===q.options?.length?de.questions[q.id].options:q.options})),
  decisions:o.decisions.map(d=>({...d,text:de.decisions?.[d.id]?.text||d.text,options:de.decisions?.[d.id]?.options?.length===d.options?.length?de.decisions[d.id].options:d.options}))}
}
export function localizeProcess(p,language='en'){
 if(!p||language!=='de'||!readyProcess)return p
 const de=processDe.processes[p.id]
 if(!de)return p
 return {...p,title:de.title||p.title,plain:de.plain||p.plain,
  questions:(p.questions||[]).map(q=>({...q,text:de.questions?.[q.id]?.text||q.text,options:de.questions?.[q.id]?.options?.length===q.options?.length?de.questions[q.id].options:q.options}))}
}
export const germanHoverText=(id,kind)=>readyPm?(kind==='object'?pmDe.objects[id]?.title:kind==='area'?pmDe.areas[id]?.title:undefined):undefined
