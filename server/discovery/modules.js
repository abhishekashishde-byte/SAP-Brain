// Server view of the discovery catalogs: one per SAP module. A workshop's module is
// taken from its catalog_id, so transcript analysis, Find, corrections and reports
// always work against the catalog the consultant is actually using.
import { DISCOVERY_MODULES, moduleKeyFor } from '../../src/features/discovery/catalog.js'
import { PROCESS_CATALOGS } from '../../src/features/discovery/processCatalog.js'

function build(key) {
  const m = DISCOVERY_MODULES[key]
  const catalog = m.catalog
  const processes = PROCESS_CATALOGS[key]
  const allowed = new Set([...catalog.objects.flatMap(o => [o.id, ...o.fields.map(f => f.id), ...o.questions.map(q => q.id), ...o.decisions.map(d => d.id)]), ...processes.processes.map(p => p.id)])
  // The model sees what each object means (description, T-codes) and the exact allowed answers,
  // so it can relate what the customer said to the right item and propose valid values.
  const brief = {
    objects: catalog.objects.map(o => ({ id: o.id, title: o.title, meaning: o.plain, tcodes: o.tcodes, fields: o.fields.map(f => ({ id: f.id, label: f.label })), questions: o.questions.map(q => ({ id: q.id, text: q.text, type: q.type, ...(q.options ? { options: q.options } : {}) })), decisions: o.decisions.map(d => ({ id: d.id, text: d.text, options: d.options })) })),
    processes: processes.processes.map(p => ({ id: p.id, title: p.title })),
    processStatuses: processes.statuses,
  }
  return { key, label: m.label, name: m.name, catalog, processes, allowed, brief }
}

const CACHE = Object.fromEntries(Object.keys(DISCOVERY_MODULES).map(k => [k, build(k)]))
export const moduleOf = workshopOrCatalogId => CACHE[moduleKeyFor(typeof workshopOrCatalogId === 'string' ? workshopOrCatalogId : workshopOrCatalogId?.catalog_id)] || CACHE.pm
export const MODULES = CACHE
