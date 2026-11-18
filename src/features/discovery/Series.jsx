import { useMemo,useState } from 'react'
import { discoveryCatalog } from './catalog.js'
import { entryKey } from './data.js'
import { compareEntries } from './seriesData.js'
const objects=Object.fromEntries(discoveryCatalog.objects.map(o=>[o.id,o.title]))
function human(row){return row.item_type==='field'?discoveryCatalog.objects.find(o=>o.id===row.object_id)?.fields.find(f=>f.id===row.item_id)?.label||row.item_id:row.item_type==='decision'?discoveryCatalog.objects.find(o=>o.id===row.object_id)?.decisions.find(f=>f.id===row.item_id)?.text||row.item_id:row.item_id}
export function EngagementTimeline({workshops,current}){
 if(!current?.engagement_id)return null
 return <section className="dw-series"><h3>Engagement sessions</h3><div className="dw-series-timeline">{workshops.map(w=><div key={w.id} className={w.id===current.id?'dw-series-active':''}><strong>Session {w.session_no||'?'}: {w.call_date}</strong><span>{w.title} · {w.status}</span></div>)}</div></section>
}
export function CarryoverReview({workshop,entries,previousEntries=[],todos=[],requests=[],parking=[],onJump,onTodo,onRequest,onParking}){
 const [showOnlyChanged,setShowOnlyChanged]=useState(false)
 const prev=useMemo(()=>compareEntries(Object.values(entries),previousEntries),[entries,previousEntries])
 const items=Object.values(entries).filter(r=>r.carried_from&&(
  r.item_type==='field'&&r.value?.mark==='clarify'||r.item_type==='decision'&&r.value?.status==='open'))
 const display=showOnlyChanged?prev:items
 if(!workshop?.previous_workshop_id)return null
 return <section className="dw-series"><div className="dw-object-heading"><div><h3>Open from last session</h3><p className="dw-caption">Carried-forward items remain open until a consultant records a real resolution. Changed values are compared directly, without AI interpretation.</p></div><label className="dw-mini-checkbox"><input type="checkbox" checked={showOnlyChanged} onChange={e=>setShowOnlyChanged(e.target.checked)}/>Changed since last session</label></div>
 {display.map(row=><div className="dw-series-item" key={[row.object_id,row.item_type,row.item_id].join(':')}><strong>{objects[row.object_id]||row.object_id}: {human(row)}</strong><p className="dw-caption">{showOnlyChanged?'Before: '+JSON.stringify(row.previous_value)+' · Now: '+JSON.stringify(row.value):row.item_type==='field'?'Field requires clarification':'Decision remains open'}</p><div className="dw-actions"><button className="dw-button" onClick={()=>onJump(row.object_id)}>Review / resolve</button><span className="dw-caption">Keep open until reviewed</span></div></div>)}
 {!display.length&&<p className="dw-caption">No {showOnlyChanged?'changed':'open'} carried-over catalog items.</p>}
 {!showOnlyChanged&&<><h4>Open requests</h4>{requests.filter(r=>r.status==='open').map(r=><div className="dw-series-item" key={r.id}><span>{r.item} · {r.due_date||'No due date'}</span><button className="dw-button" onClick={()=>onRequest(r)}>Mark received</button></div>)}
 <h4>Open action items</h4>{todos.filter(t=>!t.done).map(t=><div className="dw-series-item" key={t.id}><span>{t.text}</span><button className="dw-button" onClick={()=>onTodo(t)}>Mark done</button></div>)}
 <h4>Parking lot</h4>{parking.filter(p=>p.status==='parked').map(p=><div className="dw-series-item" key={p.id}><span>{p.text}</span><button className="dw-button" onClick={()=>onParking(p)}>Drop</button></div>)}</>}
 </section>
}
