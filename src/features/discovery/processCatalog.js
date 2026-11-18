import catalog from './catalog/sap-pm-process-catalog.json'
import { discoveryCatalog } from './catalog.js'
export function validateProcessCatalog(d){
 if(!d||typeof d.catalogId!=='string'||typeof d.version!=='string'||!Array.isArray(d.categories)||!Array.isArray(d.processes))throw new Error('Invalid process catalog')
 const ids=new Set(),cats=new Set()
 for(const c of d.categories){if(!c.id||cats.has(c.id)||!['job','process'].includes(c.kind)||!c.title)throw new Error('Invalid process category '+c.id);cats.add(c.id)}
 const objects=new Set(discoveryCatalog.objects.map(o=>o.id))
 for(const p of d.processes){
  if(!p.id||ids.has(p.id)||!cats.has(p.category)||!p.title||!p.plain||!Array.isArray(p.questions))throw new Error('Invalid process '+p.id)
  ids.add(p.id)
  for(const id of String(p.relatedObjects||'').split(',').filter(Boolean))if(!objects.has(id))throw new Error('Unknown related SAP object '+id)
  for(const q of p.questions)if(!q.id||!q.text||!['yesno','single','multi','number','text'].includes(q.type))throw new Error('Invalid process question')
 }
 if(new Set(d.statuses).size!==d.statuses.length||new Set(d.frequencies).size!==d.frequencies.length)throw new Error('Duplicate process choice')
 return d
}
export const processCatalog=validateProcessCatalog(catalog)
