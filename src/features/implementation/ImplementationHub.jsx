import { useEffect, useState } from 'react'
import { WaniLogo, WaniWordmark } from '../../pages/Login.jsx'
import { loadWorkshops } from '../discovery/data.js'
import { discoveryCatalog } from '../discovery/catalog.js'
import './ImplementationHub.css'

// SAP modules covered by the Discover phase. Only modules with a real catalog are
// clickable; the rest are shown so the roadmap is visible, not hidden.
const MODULES = [
  { id: 'pm', code: 'PM', name: 'Plant Maintenance', blurb: 'Technical objects, maintenance planning, orders, notifications and work clearance.', href: '/discovery', available: true },
  { id: 'mm', code: 'MM', name: 'Materials Management', blurb: 'Procurement, inventory management, material master and MRP.' },
  { id: 'pp', code: 'PP', name: 'Production Planning', blurb: 'BOMs, routings, production versions, planning and shop floor execution.' },
  { id: 'qm', code: 'QM', name: 'Quality Management', blurb: 'Inspection planning, quality notifications and results recording.' },
  { id: 'ewm', code: 'EWM', name: 'Warehouse Management', blurb: 'Warehouse structure, putaway, picking and stock movements.' },
  { id: 'sd', code: 'SD', name: 'Sales & Distribution', blurb: 'Order-to-cash, pricing, delivery and billing.' },
]

const PHASES = [
  { n: '02', name: 'Prepare', text: 'Governance, scope baseline, plan' },
  { n: '03', name: 'Explore', text: 'Fit-to-standard, design, backlog' },
  { n: '04', name: 'Realize', text: 'Configuration, build, migration, test' },
  { n: '05', name: 'Deploy', text: 'Cutover, enablement, go-live' },
  { n: '06', name: 'Run', text: 'Hypercare, handover, improvement' },
]

export default function ImplementationHub({ session }) {
  const [recent, setRecent] = useState(null)
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadWorkshops(userId)
      .then(rows => { if (!cancelled) setRecent(rows.slice(0, 4)) })
      .catch(() => { if (!cancelled) setRecent([]) })
    return () => { cancelled = true }
  }, [userId])

  const pmCounts = {
    objects: discoveryCatalog.objects.length,
    questions: discoveryCatalog.objects.reduce((n, o) => n + o.questions.length, 0),
  }

  return (
    <main className="ih">
      <header className="ih-top">
        <a className="ih-brand" href="/" aria-label="Back to Wani chat">
          <WaniLogo size={24} dark />
          <WaniWordmark height={13} dark />
        </a>
        <nav className="ih-crumbs" aria-label="Breadcrumb">
          <a href="/">Chat</a><span aria-hidden="true">›</span><span aria-current="page">Implementation</span>
        </nav>
      </header>

      <section className="ih-hero">
        <p className="ih-eyebrow">SAP S/4HANA · Implementation workspace</p>
        <h1>Implementation</h1>
        <p className="ih-lead">Run each phase of an SAP implementation in one place. Start with Discover: pick the module and capture the customer's requirements in a guided workshop.</p>
      </section>

      <section className="ih-phase" aria-labelledby="ih-discover">
        <div className="ih-phase-head">
          <div>
            <span className="ih-phase-num">Phase 01</span>
            <h2 id="ih-discover">Discover</h2>
            <p>Understand the customer landscape, business goals, processes, data and scope — module by module.</p>
          </div>
          <span className="ih-pill ih-pill-live">Available</span>
        </div>

        <h3 className="ih-sub">Choose a module</h3>
        <div className="ih-modules">
          {MODULES.map(m => {
            const body = (
              <>
                <div className="ih-module-top">
                  <span className="ih-code">{m.code}</span>
                  <span className={`ih-pill ${m.available ? 'ih-pill-live' : ''}`}>{m.available ? 'Available' : 'Planned'}</span>
                </div>
                <strong>{m.name}</strong>
                <p>{m.blurb}</p>
                {m.available && <span className="ih-module-meta">{pmCounts.objects} objects · {pmCounts.questions} guided questions</span>}
                {m.available && <span className="ih-open">Open workshops →</span>}
              </>
            )
            return m.available
              ? <a key={m.id} className="ih-module ih-module-live" href={m.href}>{body}</a>
              : <div key={m.id} className="ih-module" aria-disabled="true">{body}</div>
          })}
        </div>

        <div className="ih-recent">
          <div className="ih-recent-head">
            <h3 className="ih-sub">Recent PM workshops</h3>
            <a className="ih-link" href="/discovery?new=1">+ New workshop</a>
          </div>
          {recent === null && <p className="ih-muted">Loading…</p>}
          {recent?.length === 0 && <p className="ih-muted">No workshops yet. Create your first one to start capturing requirements.</p>}
          {recent?.length > 0 && (
            <ul>
              {recent.map(w => (
                <li key={w.id}>
                  <a href={`/discovery?workshop=${encodeURIComponent(w.id)}`}>
                    <span className="ih-recent-name">{w.client_name}</span>
                    <span className="ih-recent-meta">{w.project_name || w.title}</span>
                    <span className="ih-recent-date">{w.call_date}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="ih-roadmap" aria-labelledby="ih-next">
        <h3 id="ih-next" className="ih-sub">Next phases</h3>
        <ol>
          {PHASES.map(p => (
            <li key={p.n}>
              <span className="ih-phase-num">Phase {p.n}</span>
              <strong>{p.name}</strong>
              <span>{p.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
