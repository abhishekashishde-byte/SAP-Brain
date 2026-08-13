from pathlib import Path

# Richer handout prompt
p = Path('api/chat.js')
s = p.read_text()
s = s.replace('- summarize aggressively: retain only the most useful 4-7 points\n- make the page easy to scan in 20 seconds', '- do NOT over-compress the answer: preserve useful technical substance, conditions, hierarchy, gotchas, and practical details\n- aim for 5-8 clearly separated sections when the verified answer supports them\n- include roughly 65-80% of the substantive information from the verified answer, shortened into visual phrases rather than deleting useful facts\n- for a short question, enrich only from the VERIFIED ANSWER: include hierarchy/process, gotchas, technical fields/t-codes, and implementation notes already present\n- make the page easy to scan in 30-45 seconds while still feeling like a useful consultant handout')
p.write_text(s)

# UI, branding and persistence
p = Path('src/pages/Brain.jsx')
s = p.read_text()
s = s.replace("const waniMark = await loadImage('/logo-w-light.png')", "const waniMark = await loadImage('/wani-handout-mark.svg')")
s = s.replace('const footerH = Math.round(canvas.height * 0.055)', 'const footerH = Math.round(canvas.height * 0.065)')
s = s.replace('const markH = Math.round(footerH * 0.48)', 'const markH = Math.round(footerH * 0.56)')
s = s.replace('const gap = Math.round(footerH * 0.12)', 'const gap = Math.round(footerH * 0.14)')
s = s.replace('const margin = Math.round(footerH * 0.22)', 'const margin = Math.round(footerH * 0.32)')
s = s.replace("return canvas.toDataURL('image/png', 0.96)", "return canvas.toDataURL('image/jpeg', 0.88)")

old_img = '''        <div style={{ marginTop:10, maxWidth:620 }}>
          <img src={msg._handoutData} alt="Wani handout" style={{ width:'100%', height:'auto', display:'block', borderRadius:12, border:`1px solid ${t.border}`, boxShadow:'0 8px 28px rgba(0,0,0,0.10)' }}/>
          <a href={msg._handoutData} download={`wani-handout-${Date.now()}.png`} style={{ display:'inline-block', marginTop:8, fontSize:12, color:'#4F46E5', fontWeight:600, textDecoration:'none' }}>Download PNG</a>
        </div>'''
new_img = '''        <div style={{ marginTop:10, maxWidth:620, position:'relative' }}>
          <img src={msg._handoutData} alt="Wani handout" style={{ width:'100%', height:'auto', display:'block', borderRadius:12, border:`1px solid ${t.border}`, boxShadow:'0 8px 28px rgba(0,0,0,0.10)' }}/>
          <a href={msg._handoutData} download={`wani-handout-${Date.now()}.jpg`} title="Download handout" aria-label="Download handout" style={{ position:'absolute', top:10, right:10, width:38, height:38, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(20,20,24,0.78)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:20, lineHeight:1, boxShadow:'0 3px 12px rgba(0,0,0,0.22)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>↓</a>
        </div>'''
if old_img not in s:
    raise SystemExit('handout image block not found')
s = s.replace(old_img, new_img, 1)

old_persist = '''    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c
      const msgs = [...(c.messages || [])]
      if (!msgs[msgIndex]) return c
      msgs[msgIndex] = { ...msgs[msgIndex], _handoutData: branded }
      return { ...c, messages: msgs }
    }))
    return branded'''
new_persist = '''    let updatedMsgs = null
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c
      const msgs = [...(c.messages || [])]
      if (!msgs[msgIndex]) return c
      msgs[msgIndex] = { ...msgs[msgIndex], _handoutData: branded }
      updatedMsgs = msgs
      return { ...c, messages: msgs, updated_at:new Date().toISOString() }
    }))
    if (updatedMsgs) await updateConversation(convId, { messages: updatedMsgs }).catch(err => console.error('Handout persistence failed:', err))
    return branded'''
if old_persist not in s:
    raise SystemExit('handout persistence block not found')
s = s.replace(old_persist, new_persist, 1)
p.write_text(s)
print('handout v2 fixes applied')
