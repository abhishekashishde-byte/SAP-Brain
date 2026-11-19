import catalog from './catalog/sap-pm-discovery-catalog.json'

const QUESTION_TYPES = new Set(['yesno', 'single', 'multi', 'number', 'text'])
const ids = new Set()

function ensure(test, detail) {
  if (!test) throw new Error('Invalid discovery catalog: ' + detail)
}

function requireId(id, context) {
  ensure(typeof id === 'string' && id.trim().length > 0, context + ' has no ID')
  // Identifiers are unique within each catalog kind. An area and an object
  // may both be named e.g. "org" without colliding.
  const key = context + ':' + id
  ensure(!ids.has(key), 'duplicate ' + context + ' ID ' + id)
  ids.add(key)
}

export function validateDiscoveryCatalog(data) {
  ids.clear()
  ensure(data && typeof data === 'object', 'not an object')
  ensure(typeof data.catalogId === 'string' && !!data.version, 'catalog/version missing')
  ensure(Array.isArray(data.areas) && data.areas.length > 0, 'areas missing')
  ensure(Array.isArray(data.objects) && data.objects.length > 0, 'objects missing')
  const areas = new Set()
  for (const area of data.areas) {
    requireId(area.id, 'area')
    ensure(typeof area.title === 'string', 'area title missing')
    areas.add(area.id)
  }
  for (const obj of data.objects) {
    requireId(obj.id, 'object')
    ensure(areas.has(obj.area), obj.id + ' has unknown area')
    ensure(typeof obj.title === 'string' && typeof obj.plain === 'string', obj.id + ' has no title/description')
    ensure(Array.isArray(obj.tcodes) && Array.isArray(obj.fields) && Array.isArray(obj.questions) && Array.isArray(obj.decisions), obj.id + ' item arrays missing')
    for (const field of obj.fields) {
      requireId(field.id, 'field')
      ensure(typeof field.label === 'string' && ['core', 'optional'].includes(field.tier), field.id + ' invalid field')
    }
    for (const question of obj.questions) {
      requireId(question.id, 'question')
      ensure(typeof question.text === 'string' && QUESTION_TYPES.has(question.type), question.id + ' invalid question')
      if (['single', 'multi'].includes(question.type)) ensure(Array.isArray(question.options) && question.options.length > 0, question.id + ' options missing')
    }
    for (const decision of obj.decisions) {
      requireId(decision.id, 'decision')
      ensure(typeof decision.text === 'string' && Array.isArray(decision.options) && decision.options.length > 0, decision.id + ' invalid decision')
    }
  }
  return data
}

export const discoveryCatalog = validateDiscoveryCatalog(catalog)
export const discoveryCounts = {
  areas: discoveryCatalog.areas.length,
  objects: discoveryCatalog.objects.length,
  fields: discoveryCatalog.objects.reduce((n, o) => n + o.fields.length, 0),
  questions: discoveryCatalog.objects.reduce((n, o) => n + o.questions.length, 0),
  decisions: discoveryCatalog.objects.reduce((n, o) => n + o.decisions.length, 0),
}
