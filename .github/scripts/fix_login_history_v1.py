from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# ── supabaseClient.js: lightweight history + lazy single-conversation fetch ──
p = Path('src/supabaseClient.js')
s = p.read_text()

old = """export const loadConversations = async (userId) => {\n  try {\n    const { data, error } = await supabase\n      .from('sap_conversations')\n      .select('*')\n      .eq('user_id', userId)\n      .order('updated_at', { ascending: false })\n    if (error) return []\n    return data || []\n  } catch { return [] }\n}\n"""
new = """const CONVERSATION_LIST_FIELDS = 'id,user_id,title,model_used,created_at,updated_at,project_id,topic_tag,summary,deliverable_type,is_project,project_name,fs_title,fs_generated_at,module,topic,is_summarised'\n\n// History must stay lightweight. Never download the full messages JSON just to\n// render titles/cards; one large account can otherwise transfer tens of MB on login.\nexport const loadConversations = async (userId) => {\n  try {\n    const { data, error } = await supabase\n      .from('sap_conversations')\n      .select(CONVERSATION_LIST_FIELDS)\n      .eq('user_id', userId)\n      .order('updated_at', { ascending: false })\n    if (error) return []\n    return data || []\n  } catch { return [] }\n}\n\n// Fetch the heavy message payload only when the user actually opens a chat.\nexport const loadConversation = async (id, userId) => {\n  try {\n    const { data, error } = await supabase\n      .from('sap_conversations')\n      .select('*')\n      .eq('id', id)\n      .eq('user_id', userId)\n      .single()\n    if (error) return null\n    return data || null\n  } catch { return null }\n}\n"""
s = replace_once(s, old, new, 'lightweight conversation list')

old = """export const loadProjects = async (userId) => {\n  try {\n    const { data, error } = await supabase\n      .from('sap_conversations')\n      .select('*')\n      .eq('user_id', userId)\n      .eq('is_project', true)\n      .order('updated_at', { ascending: false })\n    if (error) return []\n    return data || []\n  } catch { return [] }\n}\n"""
new = """export const loadProjects = async (userId) => {\n  try {\n    const { data, error } = await supabase\n      .from('sap_conversations')\n      .select(CONVERSATION_LIST_FIELDS)\n      .eq('user_id', userId)\n      .eq('is_project', true)\n      .order('updated_at', { ascending: false })\n    if (error) return []\n    return data || []\n  } catch { return [] }\n}\n"""
s = replace_once(s, old, new, 'lightweight project list')
p.write_text(s)

# ── Brain.jsx: lazy-load selected messages and stop reloads on token refresh ──
p = Path('src/pages/Brain.jsx')
s = p.read_text()

s = replace_once(
    s,
    "  loadConversations, createConversation, updateConversation, deleteConversation,\n",
    "  loadConversations, loadConversation, createConversation, updateConversation, deleteConversation,\n",
    'Brain import loadConversation',
)

old = """  useEffect(()=>{\n    const loadAll = async () => {\n      try {\n        const [convs, prof, projs] = await Promise.all([\n          loadConversations(session.user.id).catch(()=>[]),\n          getProfile(session.user.id).catch(()=>null),\n          loadProjects(session.user.id).catch(()=>[]),\n        ])\n        setConversations(convs||[])\n        setProfile(prof)\n        setProjects(projs||[])\n      } catch(e) {\n        console.error('Startup load error:', e)\n        setConversations([])\n        setProjects([])\n      } finally {\n        setDbLoading(false)\n      }\n    }\n    loadAll()\n  },[session])\n"""
new = """  useEffect(()=>{\n    const userId = session?.user?.id\n    if (!userId) return\n    let cancelled = false\n    setDbLoading(true)\n    const loadAll = async () => {\n      try {\n        // History is metadata-only. Projects are derived from the same lightweight\n        // list so login makes one conversation-list query instead of two heavy ones.\n        const [convs, prof] = await Promise.all([\n          loadConversations(userId).catch(()=>[]),\n          getProfile(userId).catch(()=>null),\n        ])\n        if (cancelled) return\n        const list = convs || []\n        setConversations(list)\n        setProfile(prof)\n        setProjects(list.filter(c => c.is_project))\n      } catch(e) {\n        console.error('Startup load error:', e)\n        if (!cancelled) {\n          setConversations([])\n          setProjects([])\n        }\n      } finally {\n        if (!cancelled) setDbLoading(false)\n      }\n    }\n    loadAll()\n    return () => { cancelled = true }\n  },[session?.user?.id])\n\n  // Conversation messages are intentionally lazy-loaded. The History screen gets\n  // only ~metadata on login; opening one chat fetches only that row's messages.\n  useEffect(() => {\n    const userId = session?.user?.id\n    if (!activeConvId || !userId) return\n    const existing = conversations.find(c => c.id === activeConvId)\n    if (!existing || Array.isArray(existing.messages)) return\n\n    let cancelled = false\n    loadConversation(activeConvId, userId)\n      .then(full => {\n        if (cancelled || !full) return\n        setConversations(prev => prev.map(c => c.id === full.id ? { ...c, ...full } : c))\n        if (full.is_project) {\n          setProjects(prev => {\n            const found = prev.some(p => p.id === full.id)\n            return found ? prev.map(p => p.id === full.id ? { ...p, ...full } : p) : [full, ...prev]\n          })\n        }\n      })\n      .catch(err => console.error('Conversation load failed:', err))\n    return () => { cancelled = true }\n  }, [activeConvId, session?.user?.id])\n"""
s = replace_once(s, old, new, 'Brain startup/lazy history')
p.write_text(s)

# ── App.jsx: cheap admin identity check instead of loading the whole dashboard ──
p = Path('src/App.jsx')
s = p.read_text()
old = """  // Ask the server whether this verified user is an administrator. The server\n  // remains authoritative; normal users get 403 and never see the Admin control.\n  useEffect(() => {\n    if (!session || approved !== true) {\n      setAdminAvailable(false)\n      return\n    }\n    let cancelled = false\n    fetch('/api/recall', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ action: 'admin_dashboard' }),\n    })\n      .then(res => {\n        if (!cancelled) setAdminAvailable(res.ok)\n      })\n      .catch(() => {\n        if (!cancelled) setAdminAvailable(false)\n      })\n    return () => { cancelled = true }\n  }, [sessionUserId, approved])\n"""
new = """  // Ask the server whether this verified user is an administrator. Do NOT load\n  // the full admin dashboard just to answer this boolean; that made the Admin control\n  // depend on a much heavier request and could leave it missing on a slow login.\n  useEffect(() => {\n    if (!session || approved !== true) {\n      setAdminAvailable(false)\n      return\n    }\n    let cancelled = false\n    const token = session.access_token\n    fetch('/api/chat', {\n      method: 'POST',\n      headers: {\n        'Content-Type': 'application/json',\n        ...(token ? { Authorization: `Bearer ${token}` } : {}),\n      },\n      body: JSON.stringify({ action: 'admin_status' }),\n    })\n      .then(res => res.ok ? res.json() : Promise.reject(new Error('admin status failed')))\n      .then(data => {\n        if (!cancelled) setAdminAvailable(data?.isAdmin === true)\n      })\n      .catch(() => {\n        if (!cancelled) setAdminAvailable(false)\n      })\n    return () => { cancelled = true }\n  }, [sessionUserId, approved])\n"""
s = replace_once(s, old, new, 'App admin status check')
p.write_text(s)

print('login/history patch applied')
