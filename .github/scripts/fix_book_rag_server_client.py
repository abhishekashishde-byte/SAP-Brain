from pathlib import Path
p=Path('api/chat.js')
s=p.read_text()
old="""async function fetchBookChunks(question, detectedModule, userToken) {
  try {
    const url    = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey || !userToken) return []

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } }
    })
"""
new="""async function fetchBookChunks(question, detectedModule, userToken) {
  try {
    // sap_book_chunks is Wani's shared server-owned reference corpus, not user data.
    // Using an anon client carrying the end-user JWT made Book RAG subject to
    // authenticated-role RLS/grants and could silently return zero rows even though
    // the same RPC/data works in SQL Editor. The API request is already authenticated
    // before this function is called, so retrieve the shared corpus with Wani's
    // server-side service-role client, exactly like other server-owned resources.
    const bookClient = getSupabase()
"""
if s.count(old)!=1:
    raise SystemExit(f'book client anchor count={s.count(old)}')
s=s.replace(old,new,1)
old2="""    const { data, error } = await userClient.rpc('match_sap_book_chunks', {
"""
new2="""    const { data, error } = await bookClient.rpc('match_sap_book_chunks', {
"""
if s.count(old2)!=1:
    raise SystemExit(f'book rpc anchor count={s.count(old2)}')
s=s.replace(old2,new2,1)
# Add high-signal PM object/transaction terms. Failure to detect a module still maps
# to NULL below, so it never blocks the global book search.
old3="""'FUNCTIONAL LOCATION', 'EQUIPMENT MASTER', 'MEASUREM'"""
new3="""'FUNCTIONAL LOCATION', 'EQUIPMENT', 'EQUIPMENT MASTER', 'IH08', 'IE03', 'IE05', 'MEASUREM'"""
if s.count(old3)!=1:
    raise SystemExit(f'PM pattern anchor count={s.count(old3)}')
s=s.replace(old3,new3,1)
p.write_text(s)
print('Book RAG shared-corpus retrieval repair applied')
