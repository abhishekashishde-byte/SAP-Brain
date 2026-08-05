const FILE_INPUT_SELECTOR = 'input[type="file"][accept*=".pdf"]'
const PICKER_MARKER = 'wani-upload-picker-opened-at'
const INTRO_SEEN_KEY = 'wani-intro-seen-v1'
const INTRO_STYLE_ID = 'wani-intro-replay-guard-style'
const INTRO_SUPPRESSED_CLASS = 'wani-intro-suppressed'

let installed = false
let observer = null
let pdfReaderPromise = null
let toastTimer = null
let suppressIntroOnThisLoad = false

function showToast(message, tone = 'info') {
  document.getElementById('wani-upload-toast')?.remove()
  if (toastTimer) clearTimeout(toastTimer)

  const toast = document.createElement('div')
  toast.id = 'wani-upload-toast'
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status')
  toast.textContent = message
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '104px',
    transform: 'translateX(-50%)',
    width: 'min(350px, calc(100vw - 32px))',
    boxSizing: 'border-box',
    padding: '11px 14px',
    borderRadius: '12px',
    border: tone === 'error'
      ? '1px solid rgba(248,113,113,.62)'
      : '1px solid rgba(109,93,251,.58)',
    background: tone === 'error'
      ? 'rgba(52,16,24,.97)'
      : 'rgba(20,17,38,.97)',
    color: '#F8F7FF',
    boxShadow: '0 14px 38px rgba(0,0,0,.42)',
    font: "600 13px/1.4 'Inter','DM Sans',sans-serif",
    textAlign: 'center',
    zIndex: '2147483647',
    pointerEvents: 'none',
  })
  document.body.appendChild(toast)
  toastTimer = setTimeout(() => toast.remove(), tone === 'error' ? 7000 : 2800)
}

function hasSeenIntro() {
  try { return localStorage.getItem(INTRO_SEEN_KEY) === '1' } catch { return false }
}

function markIntroSeen() {
  try { localStorage.setItem(INTRO_SEEN_KEY, '1') } catch {}
}

function installIntroReplayStyles() {
  if (document.getElementById(INTRO_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = INTRO_STYLE_ID
  style.textContent = `
    .${INTRO_SUPPRESSED_CLASS} {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: 60vh !important;
      background: #000 !important;
    }
    .${INTRO_SUPPRESSED_CLASS} > * {
      display: none !important;
    }
    .${INTRO_SUPPRESSED_CLASS}::after {
      content: 'Loading Wani…';
      display: block;
      color: #a5b4fc;
      font: 600 13px/1.4 'Inter','DM Sans',sans-serif;
      letter-spacing: .2px;
    }
  `
  document.head.appendChild(style)
}

function isIntroVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return false
  if ((video.currentSrc || '').includes('/wani-intro.mp4')) return true
  return [...video.querySelectorAll('source')]
    .some(source => (source.getAttribute('src') || '').includes('/wani-intro.mp4'))
}

function findCommonAncestor(elements) {
  if (!elements.length) return null
  let candidate = elements[0]
  while (candidate && !elements.every(element => candidate.contains(element))) {
    candidate = candidate.parentElement
  }
  return candidate
}

function manageIntroReplay() {
  const videos = [...document.querySelectorAll('video')].filter(isIntroVideo)
  if (!videos.length) return

  // The intro may play once on a browser where it has never appeared before.
  // Every later React remount or full browser reload uses a tiny loader instead.
  if (!suppressIntroOnThisLoad) {
    markIntroSeen()
    return
  }

  const shell = findCommonAncestor(videos)
  if (shell instanceof HTMLElement) shell.classList.add(INTRO_SUPPRESSED_CLASS)

  // Stop download/decoding as well as playback. This reduces memory pressure
  // precisely when Android is returning from its external file chooser.
  videos.forEach(video => {
    try {
      video.pause()
      video.removeAttribute('autoplay')
      video.removeAttribute('src')
      video.querySelectorAll('source').forEach(source => source.removeAttribute('src'))
      video.load()
    } catch {}
  })
}

async function ensurePdfReader() {
  if (window.pdfjsLib?.getDocument) return window.pdfjsLib
  if (pdfReaderPromise) return pdfReaderPromise

  pdfReaderPromise = Promise.all([
    import('pdfjs-dist/build/pdf.js'),
    import('pdfjs-dist/build/pdf.worker.min.js?url'),
  ]).then(([pdfModule, workerModule]) => {
    const pdfjsLib = pdfModule?.default?.getDocument ? pdfModule.default : pdfModule
    const workerUrl = workerModule?.default || workerModule
    if (!pdfjsLib?.getDocument || !pdfjsLib?.GlobalWorkerOptions) {
      throw new Error('Bundled PDF reader did not expose its browser API')
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
    window.pdfjsLib = pdfjsLib
    return pdfjsLib
  }).catch(error => {
    pdfReaderPromise = null
    console.error('[document-upload] Bundled PDF reader failed:', error)
    throw error
  })

  return pdfReaderPromise
}

function getUploadParts() {
  const input = document.querySelector(FILE_INPUT_SELECTOR)
  const button = input?.previousElementSibling
  if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
    return { input: null, button: null }
  }
  return { input, button }
}

function syncUploadButton() {
  const { button } = getUploadParts()
  if (!button) return

  // A button without an explicit type can submit an ancestor form in some
  // embedded/mobile browser shells. Keep the paperclip as a plain control.
  button.type = 'button'
  button.dataset.waniUploadButton = 'true'
}

function isPdf(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')
}

function normalizePdfMime(input, file) {
  if (!isPdf(file) || file.type === 'application/pdf') return file

  if (typeof DataTransfer === 'undefined' || typeof File === 'undefined') {
    throw new Error('This browser did not expose file metadata APIs')
  }

  const typedFile = new File([file], file.name || 'document.pdf', {
    type: 'application/pdf',
    lastModified: file.lastModified || Date.now(),
  })
  const transfer = new DataTransfer()
  transfer.items.add(typedFile)
  input.files = transfer.files
  return typedFile
}

function markPickerOpened() {
  // A picker-triggered browser remount must never replay the intro.
  markIntroSeen()
  try { sessionStorage.setItem(PICKER_MARKER, String(Date.now())) } catch {}
}

function clearPickerMarker() {
  try { sessionStorage.removeItem(PICKER_MARKER) } catch {}
}

function onClickCapture(event) {
  if (!(event.target instanceof Element)) return
  const targetButton = event.target.closest('button[data-wani-upload-button="true"]')
  if (!targetButton) return

  const { input, button } = getUploadParts()
  if (!input || !button || targetButton !== button) return

  // Stop React's old input.click() handler so the picker is opened exactly
  // once. No PDF code is loaded while Android is opening the chooser.
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()

  if (button.disabled || input.disabled) {
    clearPickerMarker()
    return
  }

  input.value = ''
  markPickerOpened()

  try {
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.click()
  } catch (error) {
    console.error('[document-upload] Native picker failed:', error)
    try {
      input.click()
    } catch (fallbackError) {
      clearPickerMarker()
      console.error('[document-upload] Picker fallback failed:', fallbackError)
      showToast('The browser blocked the file picker. Open Wani in Chrome and try the paperclip again.', 'error')
    }
  }
}

function onChangeCapture(event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.matches(FILE_INPUT_SELECTOR)) return

  const selected = input.files?.[0]
  if (!selected) {
    clearPickerMarker()
    return
  }

  let file = selected
  try {
    file = normalizePdfMime(input, selected)
  } catch (error) {
    console.error('[document-upload] Could not normalize selected PDF:', error)
    showToast('This browser returned the PDF in an unreadable format. Select it from Files rather than Recent files.', 'error')
  }

  clearPickerMarker()
  // Load the parser only after Android has returned with a selected file.
  void ensurePdfReader().catch(() => {})
  showToast(`Selected ${file?.name || selected.name} · extracting text…`)
  // Keep the original trusted change event untouched so React receives it.
}

function reportInterruptedPicker() {
  let openedAt = 0
  try { openedAt = Number(sessionStorage.getItem(PICKER_MARKER) || 0) } catch {}
  if (!openedAt || Date.now() - openedAt > 120000) return

  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  if (navigation?.type === 'reload') {
    clearPickerMarker()
    console.warn('[document-upload] Browser reloaded while the file chooser was open; intro replay was suppressed.')
  }
}

export function installDocumentUploadGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true

  suppressIntroOnThisLoad = hasSeenIntro()
  installIntroReplayStyles()

  observer = new MutationObserver(() => {
    syncUploadButton()
    manageIntroReplay()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('click', onClickCapture, true)
  document.addEventListener('change', onChangeCapture, true)

  syncUploadButton()
  manageIntroReplay()
  reportInterruptedPicker()
}

export function uninstallDocumentUploadGuard() {
  if (!installed || typeof window === 'undefined') return
  installed = false
  observer?.disconnect()
  observer = null
  document.removeEventListener('click', onClickCapture, true)
  document.removeEventListener('change', onChangeCapture, true)
  document.getElementById(INTRO_STYLE_ID)?.remove()
}
