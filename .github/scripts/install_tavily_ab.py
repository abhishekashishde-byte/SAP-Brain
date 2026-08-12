from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'ANCHOR {label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


chat_path = Path('api/chat.js')
chat = chat_path.read_text()

# 1) Request flag — server still enforces isAdmin, so a normal user cannot activate the experiment.
chat = replace_once(
    chat,
    "const { messages, tone = 'balanced', userName, userRole, userModules = [], docWizardStage, deliverableRequested = false } = body",
    "const { messages, tone = 'balanced', userName, userRole, userModules = [], docWizardStage, deliverableRequested = false, tavilyABTest = false } = body",
    'body destructure',
)

# 2) Label the normal/control answer only when A/B mode is active.
chat = replace_once(
    chat,
    "      send({ type: 'model_label', label: '' })",
    "      const runTavilyAB = Boolean(isAdmin && tavilyABTest)\n      send({ type: 'model_label', label: runTavilyAB ? 'A — WITH Tavily' : '' })",
    'model label',
)

# 3) Build the WITHOUT-Tavily prompt immediately before Sonnet is called.
# IMPORTANT: production currently injects Tavily-derived material in the Step-7 system prompt
# and injects Tavily snippets again in the sonnet-direct enrichment block. We deliberately
# preserve that exact current behavior for A (control), and surgically subtract ALL known
# Tavily-derived blocks for B. We do not "fix" production behavior inside this experiment.
needle = "      // Sonnet answers directly — THIS is the final answer, streamed live.\n"
insert = r'''      // ── PRIVATE ADMIN TAVILY A/B EXPERIMENT ──────────────────────────────
      // A = today's exact production prompt. B = byte-for-byte same prompt after removing
      // Tavily-derived content only. Sonnet's own native web_search stays enabled in BOTH.
      let noTavilySystemPrompt = enrichedSystemPrompt
      if (runTavilyAB) {
        // Step-7 Tavily content block (first injection)
        if (tavilyFiltered.length > 0) {
          const step7TavilyText = tavilyFiltered.map((r, i) =>
            `[T${i+1}] ${r.source} — ${r.title}\n${r.snippet}`
          ).join('\n\n')
          const step7TavilyBlock = `\n\nSAP COMMUNITY & BLOGS (from Tavily — SAP sources only):\n${step7TavilyText}`
          noTavilySystemPrompt = noTavilySystemPrompt.replace(step7TavilyBlock, '')

          // sonnet-direct Tavily content block (second injection in current production path)
          const directTavilyText = tavilyFiltered.map((r, i) =>
            `[Web ${i+1}] ${r.title}\nURL: ${r.url}\n${(r.snippet || '').slice(0, 1000)}`
          ).join('\n\n')
          const directTavilyBlock = `\n\n🔍 WEB SEARCH RESULTS — cite relevant ones with URL inline:\n${directTavilyText}\n\nWhen using web content, cite it as: [Title](URL)`
          noTavilySystemPrompt = noTavilySystemPrompt.replace(directTavilyBlock, '')
        }

        // Tavily-derived source reference list (general + community lane titles/URLs)
        if (allSearchResults.length > 0) {
          const sourceRefAB = allSearchResults.map((r, i) => `[${i+1}] ${r.title} — ${r.url}`).join('\n')
          const sourceBlockAB = `\n\nSOURCE REFERENCES:\n${sourceRefAB}\n\nCITATION RULES: Weave citations INLINE using [1] [2] notation. Do NOT add a Sources section at the end. This rule applies identically when you use your own web_search tool mid-answer — those results also get cited inline as [1] [2], never as a manually-typed list of raw URLs at the end of your answer. The UI renders a proper sources panel automatically from whatever you cite inline; a hand-typed link dump duplicates it and looks broken.`
          noTavilySystemPrompt = noTavilySystemPrompt.replace(sourceBlockAB, '')
        }

        // SAP note refs are extracted from Tavily search results, therefore excluded in B.
        if (noteRefs.length > 0) {
          const noteBlockAB = `\n\n📋 SAP NOTES FOUND:\n${noteRefs.map(n => `- SAP Note ${n.number}: ${n.url}`).join('\n')}`
          noTavilySystemPrompt = noTavilySystemPrompt.replace(noteBlockAB, '')
        }
      }

      // Start B before awaiting A so both Sonnet calls run concurrently.
      let tavilyABPromise = null
      if (runTavilyAB) {
        const abStartedAt = Date.now()
        tavilyABPromise = streamClaude(
          'claude-sonnet-4-5',
          noTavilySystemPrompt,
          validMessages,
          () => {},
          useContainer ? 6144 : 4096,
          { enableWebSearch: process.env.WANI_DISABLE_SEARCH !== 'true' }
        ).then(result => ({ result, ms: Date.now() - abStartedAt }))
         .catch(error => ({ error, ms: Date.now() - abStartedAt }))
      }

'''
chat = replace_once(chat, needle, insert + needle, 'AB pre-call block')

# 4) Finish B after A's stream has flushed. Reuse existing dual-answer UI.
finish_anchor = "      debugLog.rawClaudeAnswer = fullAnswer\n      debugLog.rawMergedAnswer = fullAnswer\n      debugLog.rawGptAnswer    = ''"
finish_code = r'''      if (tavilyABPromise) {
        const ab = await tavilyABPromise
        if (ab?.result?.text) {
          const withoutRaw = ab.result.text
          const withoutContainer = useContainer ? parseAnswerContainer(withoutRaw) : null
          const withoutClean = useContainer ? withoutContainer.cleanText : withoutRaw
          const withoutQuick = useContainer ? (withoutContainer.quickAnswer || '') : ''
          const withoutUsage = ab.result.usage || null
          const withoutNativeSearches = ab.result.webSearchCount || 0

          send({ type: 'dual_start', label: 'B — WITHOUT Tavily' })
          send({ type: 'dual_chunk', text: withoutClean })
          send({ type: 'dual_done' })

          const withoutDebugDoc = [
            '═══════════════════════════════════════════════════════════',
            'WANI TAVILY A/B DEBUG — WITHOUT TAVILY',
            `Generated: ${new Date().toISOString()}`,
            `Variant model time: ${ab.ms || 0}ms`,
            '═══════════════════════════════════════════════════════════',
            '',
            '0. CONTROLLED EXPERIMENT',
            '─────────────────────────────────────────────────────────',
            'Variant: WITHOUT TAVILY',
            'Same inputs as control: question, conversation history, Wani base prompt, Findings/KB, reranked books, model, max tokens, native Sonnet web_search availability.',
            'Only changed variable: every known Tavily-derived prompt block was removed before this Sonnet call.',
            `Control Tavily general snippets available: ${(tavilyFiltered || []).length}`,
            `Control Tavily community references available: ${(tavilyNotesFiltered || []).length}`,
            'Tavily snippets/references injected into THIS variant: 0',
            '',
            '1. QUESTION',
            '─────────────────────────────────────────────────────────',
            lastMsg,
            '',
            '2. CLASSIFICATION',
            '─────────────────────────────────────────────────────────',
            `Intent: ${intent} (confidence: ${debugLog.confidence})`,
            `Module detected: ${debugLog.detectedModule || 'none'}`,
            `needsSearch: ${needsSearch}`,
            'Routing: sonnet-direct A/B — WITHOUT Tavily',
            '',
            '3. BOOK RAG — SAME AS CONTROL',
            '─────────────────────────────────────────────────────────',
            `Pgvector candidates retrieved: ${debugLog.bookRerank?.candidates ?? debugLog.bookChunks ?? 0}`,
            `Exact duplicates removed before mini: ${debugLog.bookRerank?.exactRemoved ?? 0}`,
            `Chunks transferred to Sonnet: ${(bookChunks || []).length}`,
            ...(bookChunks || []).map((c, i) => `[${i+1}] ${c.source_book}, p.${c.page_number}\n    Title: ${c.lesson_title || 'n/a'}\n    Content: ${c.content?.slice(0, 300) || ''}`),
            '',
            '3b. CONSULTANT KNOWLEDGE BASE — SAME AS CONTROL',
            '─────────────────────────────────────────────────────────',
            `Entries matched: ${(relevantKnowledge || []).length}`,
            ...(relevantKnowledge || []).map((k, i) => `[K${i+1}] ${k.module} > ${k.topic} > ${k.object}\n    Finding: ${k.finding}`),
            '',
            '4. TAVILY',
            '─────────────────────────────────────────────────────────',
            `Upstream general results retrieved for paired test: ${(tavilyFiltered || []).length}`,
            `Upstream community results retrieved for paired test: ${(tavilyNotesFiltered || []).length}`,
            'Injected into THIS prompt: 0',
            '',
            '4d. SONNET NATIVE SELF-VERIFICATION',
            '─────────────────────────────────────────────────────────',
            `Native verification searches used: ${withoutNativeSearches}`,
            '',
            '5. CLAUDE SONNET — WITHOUT TAVILY',
            '─────────────────────────────────────────────────────────',
            '← RAW ANSWER RECEIVED:',
            withoutRaw,
            '',
            '6. ANSWER STRUCTURE',
            '─────────────────────────────────────────────────────────',
            `Container format used: ${useContainer}`,
            useContainer ? `Container parseOk: ${withoutContainer.parseOk}` : null,
            useContainer ? `Quick answer: ${withoutQuick.slice(0, 300) || '(none)'}` : null,
            useContainer ? `References: ${withoutContainer.references.length}` : null,
            useContainer ? `Follow-ups: ${withoutContainer.followUps.length}` : null,
            '',
            '6c. COST — WITHOUT-TAVILY SONNET CALL ONLY',
            '─────────────────────────────────────────────────────────',
            withoutUsage ? 'model: claude-sonnet-4-5' : 'Token usage: not captured',
            withoutUsage ? `input_tokens: ${withoutUsage.inputTokens} | output_tokens: ${withoutUsage.outputTokens}` : null,
            withoutUsage ? `cache_creation_input_tokens: ${withoutUsage.cacheCreationTokens || 0} | cache_read_input_tokens: ${withoutUsage.cacheReadTokens || 0}` : null,
            withoutUsage ? `anthropic_cost_usd: $${withoutUsage.estimatedCostUsd.toFixed(6)}` : null,
            useContainer ? `hidden_json_chars: ${withoutContainer.hiddenJsonChars || 0} (~${Math.round((withoutContainer.hiddenJsonChars || 0) / 4)} est. tokens)` : null,
            '',
            '7. FINAL OUTPUT — WITHOUT TAVILY',
            '─────────────────────────────────────────────────────────',
            withoutClean,
            '',
            '═══════════════════════════════════════════════════════════',
            'END OF WITHOUT-TAVILY DEBUG',
            '═══════════════════════════════════════════════════════════',
          ].filter(Boolean).join('\n')

          debugLog.tavilyAB = {
            enabled: true,
            withoutTavilyAnswer: withoutClean,
            withoutTavilyQuickAnswer: withoutQuick,
            withoutTavilyDebugDoc: withoutDebugDoc,
            withoutTavilyUsage: withoutUsage,
            withoutTavilyNativeSearches: withoutNativeSearches,
            withoutTavilyMs: ab.ms || 0,
          }
        } else {
          debugLog.tavilyAB = {
            enabled: true,
            error: ab?.error?.message || 'WITHOUT-Tavily Sonnet call failed',
            withoutTavilyMs: ab?.ms || 0,
          }
          send({ type: 'dual_start', label: 'B — WITHOUT Tavily (failed)' })
          send({ type: 'dual_chunk', text: `A/B test error: ${debugLog.tavilyAB.error}` })
          send({ type: 'dual_done' })
        }
      }

'''
chat = replace_once(chat, finish_anchor, finish_code + finish_anchor, 'AB finish block')

# 5) Return the secondary debug file in the final done event.
chat = replace_once(
    chat,
    "      debugDoc,\n      sourceInfo: {",
    "      ...(debugLog.tavilyAB ? { tavilyAB: debugLog.tavilyAB } : {}),\n      debugDoc,\n      sourceInfo: {",
    'done payload',
)

chat_path.write_text(chat)


# ───────────────────────────── FRONTEND ─────────────────────────────
brain_path = Path('src/pages/Brain.jsx')
brain = brain_path.read_text()

brain = replace_once(
    brain,
    "  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email || '')\n\n  // Document upload state",
    "  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email || '')\n  // Private admin experiment; OFF by default to avoid accidental double Sonnet spend.\n  const [tavilyABMode, setTavilyABMode] = useState(false)\n\n  // Document upload state",
    'AB state',
)

brain = replace_once(
    brain,
    "    let localDebugDoc = null\n    let localQuickAnswer = null",
    "    let localDebugDoc = null\n    let localABDebugDocWithoutTavily = null\n    let localQuickAnswer = null",
    'local AB debug',
)

brain = replace_once(
    brain,
    "body: JSON.stringify({ messages:leanMsgs, module:currentMod, topic:currentTopic, userName:profile?.name||null, userRole:profile?.role||null, userModules:profile?.modules||[], documentChunks:docChunks, documentName:uploadedDoc?.name||null, documentType:uploadedDoc?.docType||null, docWizardStage, docIntent:docWizardIntent }),",
    "body: JSON.stringify({ messages:leanMsgs, module:currentMod, topic:currentTopic, userName:profile?.name||null, userRole:profile?.role||null, userModules:profile?.modules||[], documentChunks:docChunks, documentName:uploadedDoc?.name||null, documentType:uploadedDoc?.docType||null, docWizardStage, docIntent:docWizardIntent, tavilyABTest: isAdmin && tavilyABMode }),",
    'request flag',
)

brain = replace_once(
    brain,
    "              if (evt.debugDoc)    localDebugDoc   = evt.debugDoc\n              if (evt.containerMode) {",
    "              if (evt.debugDoc)    localDebugDoc   = evt.debugDoc\n              if (evt.tavilyAB?.withoutTavilyDebugDoc) localABDebugDocWithoutTavily = evt.tavilyAB.withoutTavilyDebugDoc\n              if (evt.containerMode) {",
    'receive AB debug',
)

brain = replace_once(
    brain,
    "        ...(localDebugDoc ? { _debugDoc: localDebugDoc } : {}),\n        ...(localContainerMode ? {",
    "        ...(localDebugDoc ? { _debugDoc: localDebugDoc } : {}),\n        ...(localABDebugDocWithoutTavily ? { _abDebugDocWithoutTavily: localABDebugDocWithoutTavily } : {}),\n        ...(localContainerMode ? {",
    'persist AB debug',
)

brain = replace_once(
    brain,
    "                a.download = `wani-debug-${Date.now()}.txt`",
    "                a.download = msg._abDebugDocWithoutTavily ? `wani-debug-WITH-tavily-${Date.now()}.txt` : `wani-debug-${Date.now()}.txt`",
    'primary debug filename',
)

brain = replace_once(
    brain,
    "              📄 Download Debug Doc",
    "              {msg._abDebugDocWithoutTavily ? '📄 Debug — WITH Tavily' : '📄 Download Debug Doc'}",
    'primary debug label',
)

secondary_button = r'''        {!isStreaming && msg._abDebugDocWithoutTavily && (
          <div style={{ marginTop:6 }}>
            <button
              onClick={() => {
                const blob = new Blob([msg._abDebugDocWithoutTavily], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `wani-debug-WITHOUT-tavily-${Date.now()}.txt`
                a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${dark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
                borderRadius: 8,
                padding: '3px 10px',
                fontSize: 11,
                color: '#D97706',
                cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}
            >
              📄 Debug — WITHOUT Tavily
            </button>
          </div>
        )}
'''
brain = replace_once(
    brain,
    "        {/* Fallback download button for FS documents */}",
    secondary_button + "        {/* Fallback download button for FS documents */}",
    'secondary debug button',
)

# Make the primary A/B label visible on the saved answer.
brain = replace_once(
    brain,
    "        <div style={{ fontSize:16,lineHeight:1.8,wordBreak:'break-word' }}>",
    "        {msg._primaryLabel && <div style={{ fontSize:10, color:'#0A6ED1', opacity:0.75, marginBottom:6, fontFamily:\"'Inter',sans-serif\" }}>{msg._primaryLabel}</div>}\n        <div style={{ fontSize:16,lineHeight:1.8,wordBreak:'break-word' }}>",
    'primary label UI',
)

# Admin-only toggle above the input.
toggle_ui = r'''            {isAdmin && (
              <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'6px 12px', background:t.topbar, borderTop:`1px solid ${t.border}` }}>
                <button
                  onClick={()=>setTavilyABMode(v=>!v)}
                  disabled={isLoading || isStreaming}
                  title="Private controlled test: same question twice, only Tavily injection differs"
                  style={{ border:`1px solid ${tavilyABMode?'#D97706':t.border}`, background:tavilyABMode?'rgba(217,119,6,0.12)':'transparent', color:tavilyABMode?'#D97706':t.text4, borderRadius:20, padding:'4px 11px', fontSize:11, fontWeight:600, cursor:(isLoading||isStreaming)?'default':'pointer', fontFamily:"'Inter',sans-serif" }}
                >
                  Tavily A/B: {tavilyABMode ? 'ON' : 'OFF'}
                </button>
                {tavilyABMode && <span style={{ fontSize:10, color:t.text4 }}>Admin test · 2 Sonnet calls · same books/Findings/history</span>}
              </div>
            )}

'''
brain = replace_once(brain, "            {/* Input */}", toggle_ui + "            {/* Input */}", 'AB toggle UI')

brain_path.write_text(brain)

print('Tavily A/B patch applied')
