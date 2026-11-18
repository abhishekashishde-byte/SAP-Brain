import { useMemo, useState } from 'react'
import { discoveryCatalog, discoveryCounts } from './catalog.js'
import './DiscoveryWorkshop.css'

function Section({ title, count, children, defaultOpen = true }) {
  return <details className="dw-section" open={defaultOpen ? true : undefined}>
    <summary><span>{title}</span><span className="dw-count">{count}</span></summary>
    <div className="dw-section-body">{children}</div>
  </details>
}

function ReadonlyField({ field }) {
  return <div className="dw-field" title="Marking fields will be enabled in Phase 3">
    <span className="dw-empty-mark" aria-hidden="true" />
    <span>{field.label}</span>
    <span className="dw-tier">{field.tier}</span>
  </div>
}

function Question({ item }) {
  return <div className="dw-item">
    <div className="dw-item-title">{item.text}</div>
    <div className="dw-item-hint">{item.type === 'yesno' ? 'Yes · No · Unsure' : ['single','multi'].includes(item.type) ? item.options.join(' · ') : item.type === 'number' ? 'Number / approximate value' : 'Text response'}</div>
    <div className="dw-placeholder">Response not yet recorded</div>
  </div>
}

function Decision({ item }) {
  return <div className="dw-item">
    <div className="dw-item-title">{item.text}</div>
    <div className="dw-item-hint">{item.options.join(' · ')}</div>
    <div className="dw-placeholder">Decision open</div>
  </div>
}

export default function DiscoveryWorkshop() {
  const [selectedId, setSelectedId] = useState(discoveryCatalog.objects[0].id)
  const [presenter, setPresenter] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const objects = useMemo(() => discoveryCatalog.objects.filter(o =>
    (scope === 'all' || o.area === scope) &&
    (o.title.toLowerCase().includes(search.toLowerCase()) || o.plain.toLowerCase().includes(search.toLowerCase()) || o.tcodes.some(t => t.toLowerCase().includes(search.toLowerCase())))
  ), [scope, search])
  const selected = objects.find(o => o.id === selectedId) || objects[0]
  const selectedIndex = objects.findIndex(o => o.id === selected?.id)
  const area = discoveryCatalog.areas.find(a => a.id === selected?.area)
  const visibleFields = selected?.fields.filter(f => showOptional || f.tier === 'core') || []
  const optionalCount = selected?.fields.filter(f => f.tier === 'optional').length || 0

  function selectObject(id) {
    setSelectedId(id)
    setShowOptional(false)
    setMobileNav(false)
  }

  return <main className={`dw ${presenter ? 'dw-presenter' : ''}`}>
    <header className="dw-header">
      <div className="dw-brand"><a href="/" className="dw-back" aria-label="Back to Wani">←</a><span className="dw-logo">W</span><span>Wani <span className="dw-slash">/</span> Discovery Workshop</span></div>
      <div className="dw-actions">
        <button className="dw-button dw-toggle" aria-pressed={presenter} onClick={() => setPresenter(x => !x)}>{presenter ? 'Exit presenter mode' : 'Presenter mode'}</button>
        <button className="dw-button dw-mobile-nav" onClick={() => setMobileNav(x => !x)} aria-expanded={mobileNav}>Objects ☰</button>
      </div>
    </header>
    <div className="dw-container">
      <section className="dw-intro">
        <div className="dw-kicker">SAP PM · CATALOG v{discoveryCatalog.version}</div>
        <h1>Discovery Workshop</h1>
        <p>Walk through each maintenance process and master-data object with your customer. Every catalog question and decision is visible for review.</p>
        <div className="dw-alert" role="status"><strong>Phase 1 preview.</strong> Read-only catalog and presenter mode are available. Customer details, notes, autosave, decisions and Excel/PDF export will be enabled in subsequent phases. No workshop data is saved yet.</div>
        <div className="dw-metadata">
          <div><span>Customer / Company</span><strong>Not entered yet</strong></div>
          <div><span>Meeting date</span><strong>Not scheduled yet</strong></div>
          <div><span>Module</span><strong>SAP Plant Maintenance</strong></div>
          <div><span>Catalog coverage</span><strong>{discoveryCounts.objects} objects · {discoveryCounts.fields} fields · {discoveryCounts.questions} questions · {discoveryCounts.decisions} decisions</strong></div>
        </div>
      </section>
      <div className="dw-workspace">
        <aside className={`dw-sidebar ${mobileNav ? 'dw-open' : ''}`} aria-label="SAP PM workshop objects">
          <div className="dw-sidebar-top"><strong>Workshop catalog</strong><span>{objects.length} / {discoveryCounts.objects}</span></div>
          <input className="dw-search" aria-label="Search SAP objects" placeholder="Search objects or T-codes" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="dw-scope" aria-label="Filter area" value={scope} onChange={e => {setScope(e.target.value);setShowOptional(false)}}><option value="all">All areas</option>{discoveryCatalog.areas.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
          {discoveryCatalog.areas.filter(a => scope === 'all' || a.id === scope).map(a => {
            const children = objects.filter(o => o.area === a.id)
            if (!children.length) return null
            return <div className="dw-nav-group" key={a.id}><div className="dw-nav-heading">{a.title}</div>{children.map(o =>
              <button key={o.id} className={`dw-nav-item ${selected?.id === o.id ? 'dw-active' : ''}`} onClick={() => selectObject(o.id)} aria-current={selected?.id === o.id ? 'true' : undefined}><span>{o.title}</span><span className="dw-nav-count">{o.fields.length}</span></button>)}</div>
          })}
          {!objects.length && <p className="dw-no-results">No matching objects.</p>}
        </aside>
        <div className="dw-main">
          {selected ? <>
            <div className="dw-card">
              <div className="dw-object-heading">
                <div><div className="dw-kicker">{area?.title} · {selectedIndex + 1} of {objects.length}</div><h2>{selected.title}</h2></div>
                <span className="dw-status">Not started</span>
              </div>
              {selected.tcodes.length > 0 && <div className="dw-tcodes" aria-label="SAP transaction codes">{selected.tcodes.map(t => <code key={t}>{t}</code>)}</div>}
              <p className="dw-description">{selected.plain}</p>
              {!presenter && <div className="dw-subtle">Current (legacy) process — ready for notes in Phase 2.</div>}
              <Section title="Key fields" count={selected.fields.length}>
                <p className="dw-caption">Review all catalog fields, core fields first. Mark needed / not needed / clarify in the interactive phase.</p>
                <div className="dw-fields">{visibleFields.map(f => <ReadonlyField key={f.id} field={f}/>)}</div>
                {optionalCount > 0 && <button className="dw-inline-button" onClick={() => setShowOptional(x => !x)}>{showOptional ? 'Hide optional fields' : `Show optional fields (${optionalCount})`}</button>}
              </Section>
              <Section title="Process questions" count={selected.questions.length}>
                {selected.questions.map(q => <Question key={q.id} item={q}/>)}
                {!selected.questions.length && <p className="dw-caption">No questions for this object.</p>}
              </Section>
              <Section title="Decisions" count={selected.decisions.length}>
                {selected.decisions.map(d => <Decision key={d.id} item={d}/>)}
                {!selected.decisions.length && <p className="dw-caption">No decisions for this object.</p>}
              </Section>
              {!presenter && <Section title="Workshop notes & action items" count="Soon">
                <p className="dw-caption">Area notes, object notes, field/question notes, internal notes, to-dos and owners will be added with secure persistence. This preview does not accept data that could be lost.</p>
              </Section>}
              <div className="dw-pagination">
                <button className="dw-button" disabled={selectedIndex <= 0} onClick={() => selectObject(objects[selectedIndex - 1].id)}>← Previous object</button>
                <span>{selectedIndex + 1} / {objects.length}</span>
                <button className="dw-button dw-primary" disabled={selectedIndex >= objects.length - 1} onClick={() => selectObject(objects[selectedIndex + 1].id)}>Next object →</button>
              </div>
            </div>
          </> : <div className="dw-card"><h2>No objects match</h2><p>Try another search or area.</p></div>}
        </div>
      </div>
    </div>
  </main>
}
