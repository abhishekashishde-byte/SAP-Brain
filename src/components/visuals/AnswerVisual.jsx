// src/components/visuals/AnswerVisual.jsx
// Pure renderer — picks the right template component for whatever format/
// data it's given. Visuals are intentionally compact: the full answer remains
// available above, while this view shows only the key takeaway and decisions.
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

function compactText(value, maxWords) {
  if (typeof value !== 'string') return value
  const clean = value.replace(/\s+/g, ' ').trim()
  const words = clean.split(' ')
  if (words.length <= maxWords) return clean
  return `${words.slice(0, maxWords).join(' ').replace(/[,:;–—-]+$/, '')}…`
}

function compactList(items, maxItems = 2, maxWords = 8) {
  if (!Array.isArray(items)) return []
  return items.slice(0, maxItems).map(item => compactText(item, maxWords))
}

function compactVisualData(format, data) {
  const title = compactText(data?.title, 11)

  switch (format) {
    case 'process_flow':
      return {
        ...data,
        title,
        steps: (data.steps || []).slice(0, 5).map(step => ({
          ...step,
          title: compactText(step.title, 6),
          description: compactText(step.description, 18),
        })),
      }

    case 'options_comparison':
      return {
        ...data,
        title,
        recommendation: data.recommendation ? {
          ...data.recommendation,
          preferredOption: compactText(data.recommendation.preferredOption, 5),
          reason: compactText(data.recommendation.reason, 18),
        } : data.recommendation,
        options: (data.options || []).slice(0, 3).map(option => ({
          ...option,
          name: compactText(option.name, 6),
          bestWhen: compactText(option.bestWhen, 13),
          pros: compactList(option.pros),
          cons: compactList(option.cons),
        })),
      }

    case 'troubleshooting':
      return {
        ...data,
        title,
        issueSummary: compactText(data.issueSummary, 20),
        checkFirst: compactText(data.checkFirst, 16),
        causes: (data.causes || []).slice(0, 4).map(cause => ({
          ...cause,
          title: compactText(cause.title, 6),
          description: compactText(cause.description, 16),
          check: compactText(cause.check, 13),
        })),
      }

    case 'concept_explainer':
      return {
        ...data,
        title,
        coreConcept: compactText(data.coreConcept, 24),
        concepts: (data.concepts || []).slice(0, 3).map(concept => ({
          ...concept,
          title: compactText(concept.title, 6),
          description: compactText(concept.description, 18),
        })),
      }

    default:
      return data
  }
}

export default function AnswerVisual({ visualFormat, visualData }) {
  if (!visualFormat || !visualData) return null
  const Renderer = RENDERERS[visualFormat]
  if (!Renderer) return null // unknown format — fail closed, show nothing
  const compactData = compactVisualData(visualFormat, visualData)

  return (
    <div style={{ margin: '12px 0' }}>
      <Renderer data={compactData} />
    </div>
  )
}
