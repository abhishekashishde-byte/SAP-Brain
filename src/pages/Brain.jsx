function HomeScreen({ conversations, onSelectTopic, t }) {
  const [slots, setSlots]     = useState(MODULE_STACK.map((_,i) => i))
  const [busy, setBusy]       = useState(false)
  const cardRefs              = useRef([])
  const touchY                = useRef(0)
  
  // Custom Easing Curves
  const SPRING = 'transform 700ms cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 500ms ease'
  const EJECT  = 'transform 450ms cubic-bezier(0.45, 0, 0.55, 1), opacity 300ms ease'
  const SNAP   = 'transform 400ms cubic-bezier(0.23, 1, 0.32, 1), opacity 300ms ease'

  const applySlot = (idx, slot, transition) => {
    const el = cardRefs.current[idx]
    if (!el) return
    const s = slotStyle(slot)
    el.style.transition    = transition
    el.style.transform     = s.transform
    el.style.opacity       = s.opacity
    el.style.zIndex        = s.zIndex
    el.style.pointerEvents = s.pointerEvents
  }

  const advance = () => {
    if (busy) return
    setBusy(true)
    const frontIdx = slots.indexOf(0)
    const el = cardRefs.current[frontIdx]
    
    if (el) {
      // Physical "Toss" Effect: Slide down + slight rotation + scale down
      el.style.transition = EJECT
      el.style.transform  = 'translateY(140px) rotate(4deg) scale(0.9)'
      el.style.opacity    = '0'
    }

    setTimeout(() => {
      const newSlots = slots.map(s => s === 0 ? N_CARDS - 1 : s - 1)
      
      // Move ejected card to back instantly
      applySlot(frontIdx, N_CARDS - 1, 'none')
      
      // Animate the rest of the stack forward with a "Spring"
      newSlots.forEach((slot, idx) => {
        if (idx !== frontIdx) applySlot(idx, slot, SPRING)
      })

      setTimeout(() => {
        applySlot(frontIdx, newSlots[frontIdx], SPRING)
        setSlots(newSlots)
        setBusy(false)
      }, 50)
    }, 350)
  }

  const retreat = () => {
    if (busy) return
    setBusy(true)
    const newSlots = slots.map(s => s === N_CARDS - 1 ? 0 : s + 1)
    setSlots(newSlots)
    newSlots.forEach((slot, idx) => applySlot(idx, slot, SPRING))
    setTimeout(() => setBusy(false), 600)
  }

  // Effect to sync initial DOM state
  useEffect(() => {
    slots.forEach((slot, idx) => applySlot(idx, slot, 'none'))
  }, [])

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'40px 16px', display:'flex', flexDirection:'column', alignItems:'center', zIndex:1 }}>
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:700, color:t.text, marginBottom:8, letterSpacing:'-0.5px' }}>
          Select a Module
        </h2>
        <p style={{ fontSize:13, color:t.text3, fontWeight:500 }}>Swipe or click to cycle the stack</p>
      </div>

      <div 
        style={{ position:'relative', width:'min(100%, 32rem)', height:320, perspective:'1000px' }}
        onClick={e => { if (!e.target.closest('button')) advance() }}
      >
        {MODULE_STACK.map((m, idx) => (
          <div
            key={m.key}
            ref={el => cardRefs.current[idx] = el}
            style={{
              position:'absolute', inset:0, borderRadius:24, overflow:'hidden',
              background: m.bg, border: `1px solid ${t.border}`,
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
              willChange: 'transform, opacity'
            }}
          >
            {/* Glossy Overlay */}
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(125deg, rgba(255,255,255,0.05) 0%, transparent 40%)', pointerEvents:'none' }} />
            
            <div style={{ padding:24, height:'100%', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <div style={{ fontSize:24 }}>{m.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:18, fontWeight:700, color:m.acc }}>{m.mod}</div>
                  <div style={{ fontSize:12, color:t.text3 }}>{m.sub}</div>
                </div>
              </div>
              
              <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:6, contentAlign:'flex-start' }}>
                {(TOPICS[m.key] || []).slice(0, 5).map(tp => (
                  <span key={tp} style={{ fontSize:11, padding:'4px 10px', borderRadius:12, background:'rgba(255,255,255,0.03)', border:`1px solid ${t.border}`, color:t.text2 }}>{tp}</span>
                ))}
              </div>

              <div style={{ marginTop:'auto', display:'flex', justifyContent:'flex-end' }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); onSelectTopic(m.key, null) }}
                  style={{ background: m.acc, color: '#000', border: 'none', padding: '8px 20px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Enter Module
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
