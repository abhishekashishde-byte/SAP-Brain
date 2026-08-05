import { supabase } from './supabaseClient'

const PANEL_ID = 'wani-knowledge-center'
const TOAST_ID = 'wani-knowledge-center-toast'

let installed = false
let originalFetch = null
let state = {
  open: false,
  loading: false,
  isAdmin: false,
  tab: 'local',
  localEntries: [],
  globalEntries: [],
  reviewEntries: [],
}

export function installKnowledgeCenter() {
  if (installed || typeof window === 'undefined') return
  installed = true

  installCorrectionRedirect()
  installKnowledgeButtonInterceptor()
  installEscapeHandler()
  renameKnowledgeButtons()

  const observer = new MutationObserver(renameKnowledgeButtons)
  observer.observe(document.body, { childList: true, subtree: true })
}

function installCorrectionRedirect() {
  originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init = {}) => {
    try {
      const rawUrl = input instanceof Request ? input.url : String(input)
      const url = new URL(rawUrl, window.location.origin)
      const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()

      if (url.origin === window.location.origin && url.pathname === '/api/chat' && method === 'POST') {
        const rawBody = init.body
        if (typeof rawBody === 'string') {
          const parsed = JSON.parse(rawBody)
          if (parsed?.action === 'save_correction') {
            return originalFetch('/api/recall', {
              ...init,
              method: 'POST',
              headers: mergeHeaders(input, init, { 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                action: 'knowledge_save_correction_candidate',
                userMsg: parsed.userMsg,
                assistantMsg: parsed.assistantMsg,
              }),
            })
          }
        }
      }
    } catch (error) {
      console.error('[knowledge-center] correction redirect failed:', error.message)
    }

    return originalFetch(input, init)
  }
}

function mergeHeaders(input, init, additions) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value))
  Object.entries(additions).forEach(([key, value]) => headers.set(key, value))
  return headers
}

function installKnowledgeButtonInterceptor() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest('button[title="Knowledge Base"],button[title="Knowledge Center"]')
      : null
    if (!target || target.closest(`#${PANEL_ID}`)) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    void openKnowledgeCenter()
  }, true)
}

function installEscapeHandler() {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.open) closeKnowledgeCenter()
  })
}

function renameKnowledgeButtons() {
  document.querySelectorAll('button[title="Knowledge Base"],button[title="Knowledge Center"]').forEach(button => {
    if (!(button instanceof HTMLButtonElement) || button.closest(`#${PANEL_ID}`)) return
    button.title = 'Knowledge Center'
    button.setAttribute('aria-label', 'Knowledge Center')
  })
}

async function openKnowledgeCenter() {
  state.open = true
  state.loading = true
  state.tab = 'local'
  renderShell()

  try {
    const { data } = await supabase.auth.getSession()
    if (!data?.session) throw new Error('Please sign in again.')
    await refreshAll()
  } catch (error) {
    state.loading = false
    renderContent(error.message || 'Could not load knowledge.')
  }
}

function closeKnowledgeCenter() {
  state.open = false
  document.getElementById(PANEL_ID)?.remove()
}

async function refreshAll() {
  state.loading = true
  renderContent()

  const snapshot = await callKnowledgeApi('knowledge_snapshot')
  state.localEntries = Array.isArray(snapshot.localEntries) ? snapshot.localEntries : []
  state.globalEntries = Array.isArray(snapshot.globalEntries) ? snapshot.globalEntries : []

  try {
    const queue = await callKnowledgeApi('knowledge_review_queue')
    state.isAdmin = true
    state.reviewEntries = Array.isArray(queue.entries) ? queue.entries : []
  } catch (error) {
    if (error.status === 403) {
      state.isAdmin = false
      state.reviewEntries = []
      if (state.tab === 'review') state.tab = 'local'
    } else {
      throw error
    }
  }

  state.loading = false
  renderShell()
}

async function callKnowledgeApi(action, payload = {}) {
  const response = await fetch('/api/recall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Knowledge operation failed')
    error.status = response.status
    throw error
  }
  return data
}

function renderShell() {
  let overlay = document.getElementById(PANEL_ID)
  if (!overlay) {
    overlay = element('div', {
      id: PANEL_ID,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Knowledge Center',
    })
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      background: 'rgba(0,0,0,.68)', display: 'flex', justifyContent: 'flex-end',
      fontFamily: "'Inter','DM Sans',sans-serif",
    })
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeKnowledgeCenter()
    })
    document.body.appendChild(overlay)
  }

  overlay.replaceChildren(buildPanel())
}

function buildPanel() {
  const panel = element('section')
  Object.assign(panel.style, {
    width: 'min(620px, 100vw)', height: '100dvh', boxSizing: 'border-box',
    background: '#10101A', borderLeft: '1px solid #2A2440', color: '#F0EEF8',
    display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,.4)',
  })

  const header = element('div')
  Object.assign(header.style, {
    padding: '20px 20px 14px', borderBottom: '1px solid #2A2440', flexShrink: '0',
  })

  const titleRow = element('div')
  Object.assign(titleRow.style, { display: 'flex', alignItems: 'flex-start', gap: '12px' })

  const titleBlock = element('div')
  Object.assign(titleBlock.style, { flex: '1', minWidth: '0' })
  titleBlock.append(
    styledText('Knowledge Center', { fontSize: '20px', fontWeight: '750' }),
    styledText(
      state.isAdmin
        ? 'Review local consultant knowledge and promote verified entries globally.'
        : 'Your local knowledge and verified global knowledge used by Wani.',
      { fontSize: '12px', color: '#8A849E', marginTop: '5px', lineHeight: '1.5' },
    ),
  )

  const refresh = iconButton('↻', 'Refresh knowledge', () => void refreshAll())
  const close = iconButton('×', 'Close Knowledge Center', closeKnowledgeCenter)
  titleRow.append(titleBlock, refresh, close)

  const tabs = element('div')
  Object.assign(tabs.style, { display: 'flex', gap: '7px', marginTop: '16px', flexWrap: 'wrap' })
  tabs.append(
    tabButton('local', `My Local (${state.localEntries.length})`),
    tabButton('global', `Global (${state.globalEntries.length})`),
  )
  if (state.isAdmin) tabs.append(tabButton('review', `Review (${state.reviewEntries.length})`))

  header.append(titleRow, tabs)

  const content = element('div', { 'data-knowledge-content': 'true' })
  Object.assign(content.style, {
    flex: '1', overflowY: 'auto', padding: '18px 20px 28px', boxSizing: 'border-box',
  })

  panel.append(header, content)
  setTimeout(() => renderContent(), 0)
  return panel
}

function tabButton(key, label) {
  const active = state.tab === key
  const button = element('button', { type: 'button' }, label)
  Object.assign(button.style, {
    border: active ? '1px solid #6366F1' : '1px solid #302A49',
    background: active ? '#4F46E5' : '#191629',
    color: active ? '#FFF' : '#A9A3C0',
    borderRadius: '9px', padding: '8px 12px', cursor: 'pointer',
    font: "600 12px 'Inter','DM Sans',sans-serif",
  })
  button.addEventListener('click', () => {
    state.tab = key
    renderShell()
  })
  return button
}

function renderContent(errorMessage = '') {
  const content = document.querySelector(`#${PANEL_ID} [data-knowledge-content]`)
  if (!content) return
  content.replaceChildren()

  if (state.loading) {
    content.append(emptyState('Loading knowledge…', true))
    return
  }

  if (errorMessage) {
    content.append(emptyState(errorMessage))
    return
  }

  if (state.tab === 'global') renderGlobal(content)
  else if (state.tab === 'review' && state.isAdmin) renderReview(content)
  else renderLocal(content)
}

function renderLocal(content) {
  const intro = infoBox(
    'Local knowledge',
    'These entries are private to your account. Pending entries are visible to the administrator for global review. If kept local, the content stays unchanged and is not shown in the review queue again.',
  )
  content.append(intro)

  if (state.localEntries.length === 0) {
    content.append(emptyState('No local knowledge saved yet.'))
    return
  }

  state.localEntries.forEach(entry => {
    const status = entry.admin_review_status === 'rejected'
      ? { label: 'Local only · reviewed', background: 'rgba(148,163,184,.13)', color: '#B7B3C7' }
      : { label: 'Pending global review', background: 'rgba(245,158,11,.14)', color: '#FBBF24' }

    const card = knowledgeCard(entry, status)
    const actions = element('div')
    Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '12px' })
    actions.append(actionButton('Delete local', 'danger', async button => {
      if (!window.confirm('Delete this local knowledge entry?')) return
      await runButton(button, async () => {
        await callKnowledgeApi('knowledge_delete_local', { id: entry.id })
        state.localEntries = state.localEntries.filter(item => item.id !== entry.id)
        renderShell()
        showToast('Local knowledge deleted.')
      })
    }))
    card.append(actions)
    content.append(card)
  })
}

function renderGlobal(content) {
  const intro = infoBox(
    'Verified global knowledge',
    state.isAdmin
      ? 'All users can read and benefit from these entries. Normal users cannot modify or delete them; administrator actions are enforced server-side and at the database level.'
      : 'These entries are verified for every Wani user. They are read-only and cannot be modified or deleted from your account.',
  )
  content.append(intro)

  if (state.globalEntries.length === 0) {
    content.append(emptyState('No global knowledge has been approved yet.'))
    return
  }

  state.globalEntries.forEach(entry => {
    const label = entry.promoted_by_me ? 'Global · promoted from your knowledge' : 'Global · verified'
    const card = knowledgeCard(entry, {
      label,
      background: 'rgba(16,185,129,.14)',
      color: '#6EE7B7',
    })

    if (state.isAdmin) {
      const actions = element('div')
      Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' })
      actions.append(
        actionButton('Edit', 'secondary', button => openGlobalEditor(entry, button)),
        actionButton('Remove global', 'danger', async button => {
          if (!window.confirm('Remove this entry from global knowledge? It will no longer be used by Wani.')) return
          await runButton(button, async () => {
            await callKnowledgeApi('knowledge_archive_global', { id: entry.id })
            state.globalEntries = state.globalEntries.filter(item => item.id !== entry.id)
            renderShell()
            showToast('Global knowledge removed.')
          })
        }),
      )
      card.append(actions)
    }

    content.append(card)
  })
}

function renderReview(content) {
  const intro = infoBox(
    'Pending admin review',
    'Approve Global creates a protected global copy and deletes the original local entry. Keep Local leaves the user’s entry unchanged, marks it reviewed, and removes it permanently from this queue.',
  )
  content.append(intro)

  if (state.reviewEntries.length === 0) {
    content.append(emptyState('The review queue is clear.'))
    return
  }

  state.reviewEntries.forEach(entry => content.append(reviewCard(entry)))
}

function reviewCard(entry) {
  const card = element('article')
  styleCard(card)

  const meta = element('div')
  Object.assign(meta.style, { display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' })
  meta.append(
    styledText(entry.user_email || 'Unknown user', { fontSize: '12px', fontWeight: '700', color: '#C4B5FD' }),
    styledText(formatDate(entry.created_at), { fontSize: '11px', color: '#77718B' }),
  )

  const module = field('Module', entry.module || '')
  const topic = field('Topic', entry.topic || '')
  const object = field('SAP object', entry.object || '')
  const finding = textAreaField('Knowledge', entry.finding || '')
  const note = textAreaField('Admin note (optional)', '', 2)

  const grid = element('div')
  Object.assign(grid.style, {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: '9px',
  })
  grid.append(module.wrapper, topic.wrapper, object.wrapper)

  const actions = element('div')
  Object.assign(actions.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px', flexWrap: 'wrap' })

  actions.append(
    actionButton('Keep Local', 'secondary', async button => {
      await runButton(button, async () => {
        await callKnowledgeApi('knowledge_review', {
          id: entry.id,
          decision: 'reject',
          note: note.input.value,
        })
        removeReviewedEntry(entry.id)
        showToast('Entry kept local and removed from the review queue.')
      })
    }),
    actionButton('Approve Global', 'primary', async button => {
      const finalFinding = finding.input.value.trim()
      if (!finalFinding) {
        showToast('Knowledge text is required.', true)
        return
      }
      await runButton(button, async () => {
        await callKnowledgeApi('knowledge_review', {
          id: entry.id,
          decision: 'approve',
          module: module.input.value,
          topic: topic.input.value,
          object: object.input.value,
          finding: finalFinding,
          note: note.input.value,
        })
        removeReviewedEntry(entry.id)
        await reloadSnapshotOnly()
        showToast('Knowledge approved globally.')
      })
    }),
  )

  card.append(meta, grid, finding.wrapper, note.wrapper, actions)
  return card
}

function removeReviewedEntry(id) {
  state.reviewEntries = state.reviewEntries.filter(item => item.id !== id)
  renderShell()
}

async function reloadSnapshotOnly() {
  const snapshot = await callKnowledgeApi('knowledge_snapshot')
  state.localEntries = Array.isArray(snapshot.localEntries) ? snapshot.localEntries : []
  state.globalEntries = Array.isArray(snapshot.globalEntries) ? snapshot.globalEntries : []
}

function openGlobalEditor(entry, sourceButton) {
  const module = window.prompt('Module', entry.module || '')
  if (module === null) return
  const topic = window.prompt('Topic', entry.topic || '')
  if (topic === null) return
  const object = window.prompt('SAP object', entry.object || '')
  if (object === null) return
  const finding = window.prompt('Global knowledge', entry.finding || '')
  if (finding === null || !finding.trim()) return

  void runButton(sourceButton, async () => {
    await callKnowledgeApi('knowledge_update_global', {
      id: entry.id,
      module,
      topic,
      object,
      finding,
    })
    Object.assign(entry, { module, topic, object, finding: finding.trim() })
    renderShell()
    showToast('Global knowledge updated.')
  })
}

function knowledgeCard(entry, badge) {
  const card = element('article')
  styleCard(card)

  const top = element('div')
  Object.assign(top.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' })
  top.append(
    badgeElement(badge.label, badge.background, badge.color),
    styledText(formatDate(entry.approved_at || entry.created_at), { color: '#77718B', fontSize: '11px' }),
  )

  const path = [entry.module, entry.topic, entry.object].filter(Boolean).join(' › ')
  const pathText = styledText(path || 'General SAP knowledge', {
    color: '#A78BFA', fontSize: '11px', fontWeight: '650', marginTop: '12px',
  })
  const finding = styledText(entry.finding || '', {
    color: '#E7E5EF', fontSize: '13px', lineHeight: '1.62', marginTop: '8px', whiteSpace: 'pre-wrap',
  })

  card.append(top, pathText, finding)
  return card
}

function styleCard(card) {
  Object.assign(card.style, {
    background: '#171425', border: '1px solid #2D2842', borderRadius: '14px',
    padding: '15px', marginTop: '12px', boxShadow: '0 6px 18px rgba(0,0,0,.13)',
  })
}

function infoBox(title, text) {
  const box = element('div')
  Object.assign(box.style, {
    background: 'rgba(79,70,229,.09)', border: '1px solid rgba(99,102,241,.3)',
    borderRadius: '12px', padding: '13px 14px', marginBottom: '14px',
  })
  box.append(
    styledText(title, { color: '#C4B5FD', fontSize: '13px', fontWeight: '700' }),
    styledText(text, { color: '#9892AB', fontSize: '12px', lineHeight: '1.55', marginTop: '5px' }),
  )
  return box
}

function field(label, value) {
  const wrapper = element('label')
  const labelText = styledText(label, { color: '#817B94', fontSize: '10px', fontWeight: '700', marginBottom: '5px' })
  const input = element('input', { type: 'text', value })
  styleInput(input)
  wrapper.append(labelText, input)
  return { wrapper, input }
}

function textAreaField(label, value, rows = 4) {
  const wrapper = element('label')
  Object.assign(wrapper.style, { display: 'block', marginTop: '10px' })
  const labelText = styledText(label, { color: '#817B94', fontSize: '10px', fontWeight: '700', marginBottom: '5px' })
  const input = element('textarea', { rows: String(rows) })
  input.value = value
  styleInput(input)
  Object.assign(input.style, { resize: 'vertical', minHeight: rows > 2 ? '92px' : '54px', lineHeight: '1.5' })
  wrapper.append(labelText, input)
  return { wrapper, input }
}

function styleInput(input) {
  Object.assign(input.style, {
    width: '100%', boxSizing: 'border-box', border: '1px solid #38314F',
    borderRadius: '9px', background: '#0E0C17', color: '#EEEAF8', padding: '9px 10px',
    outline: 'none', font: "500 12px 'Inter','DM Sans',sans-serif",
  })
  input.addEventListener('focus', () => { input.style.borderColor = '#6366F1' })
  input.addEventListener('blur', () => { input.style.borderColor = '#38314F' })
}

function actionButton(label, variant, onClick) {
  const button = element('button', { type: 'button' }, label)
  const styles = {
    primary: { background: '#4F46E5', border: '#6366F1', color: '#FFF' },
    secondary: { background: '#242036', border: '#3B3550', color: '#C7C2D6' },
    danger: { background: 'rgba(220,38,38,.08)', border: 'rgba(239,68,68,.4)', color: '#FCA5A5' },
  }[variant] || {}
  Object.assign(button.style, {
    border: `1px solid ${styles.border}`, background: styles.background, color: styles.color,
    borderRadius: '9px', padding: '8px 11px', cursor: 'pointer',
    font: "650 11px 'Inter','DM Sans',sans-serif",
  })
  button.addEventListener('click', () => void onClick(button))
  return button
}

function iconButton(text, title, onClick) {
  const button = element('button', { type: 'button', title, 'aria-label': title }, text)
  Object.assign(button.style, {
    width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #302A49',
    background: '#191629', color: '#B7B2C7', cursor: 'pointer', fontSize: '20px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0',
  })
  button.addEventListener('click', onClick)
  return button
}

function badgeElement(label, background, color) {
  const badge = element('span', {}, label)
  Object.assign(badge.style, {
    display: 'inline-flex', borderRadius: '999px', padding: '4px 8px',
    background, color, fontSize: '10px', fontWeight: '750', lineHeight: '1.2',
  })
  return badge
}

function emptyState(text, spinning = false) {
  const box = element('div')
  Object.assign(box.style, {
    minHeight: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '12px', textAlign: 'center', color: '#8A849E',
    fontSize: '13px', lineHeight: '1.5', padding: '24px', boxSizing: 'border-box',
  })
  if (spinning) {
    const spinner = element('div')
    Object.assign(spinner.style, {
      width: '25px', height: '25px', borderRadius: '50%', border: '2px solid #302A49',
      borderTopColor: '#6366F1', animation: 'waniKnowledgeSpin .8s linear infinite',
    })
    ensureSpinnerStyle()
    box.append(spinner)
  }
  box.append(element('div', {}, text))
  return box
}

function ensureSpinnerStyle() {
  if (document.getElementById('wani-knowledge-spin-style')) return
  const style = element('style', { id: 'wani-knowledge-spin-style' })
  style.textContent = '@keyframes waniKnowledgeSpin{to{transform:rotate(360deg)}}'
  document.head.appendChild(style)
}

async function runButton(button, operation) {
  if (button.disabled) return
  const original = button.textContent
  button.disabled = true
  button.textContent = 'Working…'
  button.style.opacity = '.65'
  try {
    await operation()
  } catch (error) {
    showToast(error.message || 'Knowledge operation failed.', true)
  } finally {
    if (button.isConnected) {
      button.disabled = false
      button.textContent = original
      button.style.opacity = '1'
    }
  }
}

function showToast(message, isError = false) {
  document.getElementById(TOAST_ID)?.remove()
  const toast = element('div', { id: TOAST_ID, role: 'status' }, message)
  Object.assign(toast.style, {
    position: 'fixed', zIndex: '2147483647', left: '50%', bottom: '24px',
    transform: 'translateX(-50%)', maxWidth: 'min(440px,calc(100vw - 30px))',
    padding: '11px 15px', borderRadius: '10px', color: '#FFF', textAlign: 'center',
    background: isError ? 'rgba(127,29,29,.98)' : 'rgba(49,46,129,.98)',
    border: `1px solid ${isError ? 'rgba(248,113,113,.5)' : 'rgba(129,140,248,.5)'}`,
    boxShadow: '0 12px 30px rgba(0,0,0,.35)',
    font: "650 12px/1.45 'Inter','DM Sans',sans-serif",
  })
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4200)
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function styledText(text, styles) {
  const node = element('div', {}, text)
  Object.assign(node.style, styles)
  return node
}

function element(tag, attrs = {}, text = null) {
  const node = document.createElement(tag)
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') node.className = value
    else node.setAttribute(key, value)
  })
  if (text != null) node.textContent = text
  return node
}
