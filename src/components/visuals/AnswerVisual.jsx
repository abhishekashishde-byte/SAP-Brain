// src/components/visuals/AnswerVisual.jsx
// Pure renderer — picks the right template component for whatever format/
// data it's given. No longer wired to the main answer stream: visuals are
// on-demand only now. The call site is OnDemandVisual in Brain.jsx, which
// renders this once the reader clicks "View as visual" and the separate
// /api/chat (action: 'generate_visual') call returns a format+data pair.
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
