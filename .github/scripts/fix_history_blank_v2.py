from pathlib import Path

p = Path('src/supabaseClient.js')
s = p.read_text()
old = "const CONVERSATION_LIST_FIELDS = 'id,user_id,title,model_used,created_at,updated_at,project_id,topic_tag,summary,deliverable_type,is_project,project_name,fs_title,fs_generated_at,module,topic,is_summarised'"
new = "const CONVERSATION_LIST_FIELDS = 'id,user_id,title,created_at,updated_at,deliverable_type,is_project,project_name,fs_title,fs_generated_at,module,topic,is_summarised'"
if s.count(old) != 1:
    raise SystemExit(f'expected one conversation field list, found {s.count(old)}')
s = s.replace(old, new, 1)
old2 = "    if (error) return []\n    return data || []"
new2 = "    if (error) { console.error('loadConversations error:', error); return [] }\n    return data || []"
if s.count(old2) < 1:
    raise SystemExit('loadConversations error handler not found')
s = s.replace(old2, new2, 1)
p.write_text(s)
print('history blank v2 applied')
