from pathlib import Path
p=Path('src/pages/Brain.jsx')
s=p.read_text()
old="  const [introVideoFailed, setIntroVideoFailed] = useState(false) // graceful fallback if /wani-intro.mp4 fails to load — shows the spinner instead of a blank/black screen\n"
new="  const [introVideoFailed, setIntroVideoFailed] = useState(false) // graceful fallback if /wani-intro.mp4 fails to load\n  const [showIntroVideo, setShowIntroVideo] = useState(true) // intro lifetime is independent of DB/history loading\n"
assert old in s
s=s.replace(old,new,1)
old="{messages.length===0 && dbLoading ? ("
new="{messages.length===0 && showIntroVideo ? ("
assert old in s
s=s.replace(old,new,1)
start=s.index("                  // True initial load only", s.index(new))
end=s.index("                  introVideoFailed ? (", start)
s=s[:start]+"                  // Intro playback is intentionally independent of database/history loading.\n                  // One clean contained video only; when it ends, reveal the normal Wani landing page.\n"+s[end:]
oldblock='''                  <div style={{ position:'relative',width:'100%',height:'70vh',minHeight:420,maxHeight:640,overflow:'hidden',borderRadius:16,background:'#000000',animation:'fadeIn 0.25s ease' }}>
                    <video autoPlay muted playsInline onError={()=>setIntroVideoFailed(true)}
                      style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:'blur(50px) saturate(1.3) brightness(0.55)',transform:'scale(1.25)' }}
                    >
                      <source src="/wani-intro.mp4" type="video/mp4"/>
                    </video>
                    <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <video autoPlay muted playsInline onError={()=>setIntroVideoFailed(true)}
                        style={{ maxWidth:'94%',maxHeight:'94%',objectFit:'contain',borderRadius:10,boxShadow:'0 20px 70px rgba(0,0,0,0.55)' }}
                      >
                        <source src="/wani-intro.mp4" type="video/mp4"/>
                      </video>
                    </div>
                  </div>'''
newblock='''                  <div style={{ position:'relative',width:'100%',height:'70vh',minHeight:420,maxHeight:640,overflow:'hidden',borderRadius:16,background:'#000000',animation:'fadeIn 0.25s ease',display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <video autoPlay muted playsInline
                      onEnded={()=>setShowIntroVideo(false)}
                      onError={()=>{ setIntroVideoFailed(true); setTimeout(()=>setShowIntroVideo(false),1200) }}
                      style={{ width:'100%',height:'100%',objectFit:'contain',background:'#000000' }}
                    >
                      <source src="/wani-intro.mp4" type="video/mp4"/>
                    </video>
                  </div>'''
assert oldblock in s
s=s.replace(oldblock,newblock,1)
# fallback must also release the intro instead of trapping user on spinner
old="                  introVideoFailed ? (\n                    <div style={{ display:'flex'"
new="                  introVideoFailed ? (\n                    <div onClick={()=>setShowIntroVideo(false)} style={{ display:'flex'"
assert old in s
s=s.replace(old,new,1)
p.write_text(s)
print('isolated intro video fix applied')
