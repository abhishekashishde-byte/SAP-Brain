// src/components/visuals/AnswerVisual.jsx
// Drop this wherever the chat message bubble renders its `done` payload —
// alongside where fsComplete/pptComplete are already handled in the UI.
import ProcessFlow from './ProcessFlow.jsx'
import OptionsComparison from './OptionsComparison.jsx'
import Troubleshooting from './Troubleshooting.jsx'
import ConceptExplainer from './ConceptExplainer.jsx'

const RENDERERS = {
  process_flow: ProcessFlow,
  options_comparison: OptionsComparison,
  troubleshooting: Troubleshooting,
  concept_explainer: ConceptExplainer,
}

// visualFormat / visualData come straight off the `done` SSE event, unchanged.
export default function AnswerVisual({ visualFormat, visualData }) {
  if (!visualFormat || !visualData) return null
  const Renderer = RENDERERS[visualFormat]
  if (!Renderer) return null // unknown format — fail closed, show nothing
  return (
    <div style={{ margin: '12px 0' }}>
      <Renderer data={visualData} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION DIFF
// ─────────────────────────────────────────────────────────────────────────────
//
// 1) api/_shared.js — append at the bottom of the file (after BASE_SYSTEM_PROMPT,
//    TONE_ADDITIONS, callOpenAISearch — whatever is already exported there):
//
//    export const VISUAL_MARKER_START = 'WANI_VISUAL_START'
//    export const VISUAL_MARKER_END   = 'WANI_VISUAL_END'
//    export const VISUAL_FORMATS = ['process_flow','options_comparison','troubleshooting','concept_explainer']
//    export const VISUAL_ROUTING_PROMPT = `...`   // full text from wani-visual-schema.js
//    export function extractVisualBlock(fullAnswer) { ... }  // full function from wani-visual-schema.js
//
// 2) api/chat.js — import line at the top, alongside the existing _shared import:
//
//    import {
//      BASE_SYSTEM_PROMPT, TONE_ADDITIONS, callOpenAISearch,
//      VISUAL_ROUTING_PROMPT, extractVisualBlock,          // ADD
//    } from './_shared.js'
//
// 3) api/chat.js — where SHORT_INTENTS gets the AUDIENCE AND TONE block appended
//    (search for `if (SHORT_INTENTS.has(intent))`), add right after it:
//
//    if (SHORT_INTENTS.has(intent)) systemPrompt += VISUAL_ROUTING_PROMPT
//
//    Deliberately NOT added to LONG_INTENTS (deliverables) or CODE_ANALYSIS/
//    ERROR_ANALYSIS — those keep their existing output contracts untouched.
//
// 4) api/chat.js — STEP 10, where fsComplete/pptComplete/cleanAnswer are
//    computed, add:
//
//    const { cleanText, visualFormat, visualData } = extractVisualBlock(fullAnswer)
//
//    ...then use `cleanText` wherever `cleanAnswer`/`fullAnswer` currently
//    feeds into `chatAnswer` for the plain SAP_QA/PROCESS_QA path (fsComplete
//    and pptComplete branches are untouched — visuals don't apply there).
//
//    debugLog.visualFormat = visualFormat || 'plain_text'   // for the routing
//                                                            // instrumentation
// 5) api/chat.js — both `send({ type: 'done', ... })` payloads (the early
//    sendDone() helper AND the final STEP 14 send()), add:
//
//    visualFormat: visualFormat || null,
//    visualData:   visualData   || null,
//
// 6) Frontend message renderer — wherever the `done` event is consumed and
//    fsComplete/pptComplete are read off it today, also read visualFormat/
//    visualData and render <AnswerVisual visualFormat={...} visualData={...} />
//    under the answer text.
//
// 7) Streaming caveat (already noted in wani-visual-schema.js): the marker
//    JSON streams to the client as raw text before STEP 10 strips it
//    server-side. The `chunk` handler should stop appending to the visible
//    message body once it sees `WANI_VISUAL_START` in the incoming text —
//    buffer everything from that point until `done` arrives, then discard it
//    (the parsed version comes from visualData, not from the buffered chunks).
