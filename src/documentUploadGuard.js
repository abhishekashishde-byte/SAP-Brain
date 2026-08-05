const FILE_INPUT_SELECTOR = 'input[type="file"][accept*=".pdf"]'
const STYLE_ID = 'wani-native-upload-style'
const PICKER_MARKER = 'wani-upload-picker-opened-at'

let installed = false
let observer = null
let syncFrame = 0
let syncTimer = null
let pdfReaderPromise = null
let toastTimer = null
let activeInput = null
let activeButton = null

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

function installStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    button[data-wani-upload-button="true"] {
      pointer-events: none !important;
    }
    input[data-wani-native-upload="true"] {
      display: block !important;
      position: fixed !important;
      left: var(--wani-upload-left, -100px) !important;
      top: var(--wani-upload-top, -100px) !important;
      width: var(--wani-upload-width, 1px) !important;
      height: var(--wani-upload-height, 1px) !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 8px !important;
      opacity: 0.001 !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      z-index: 2147483646 !important;
      font-size: 16px !important;
    }
  `
  document.head.appendChild(style)
}

async function ensurePdfReader() {
  if (window.pdfjsLib?.getDocument) return window.pdfjsLib
  if (pdfReaderPromise) return pdfReaderPromise

  // Load the local PDF library only after the user touches the attachment
  // control. Keeping the ~1 MB parser out of the initial mobile bundle reduces
  // the chance that Android discards and reloads the tab while its file picker
  // temporarily backgrounds Chrome.
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

function onNativePointerDown(event) {
  const input = event.currentTarget
  try {
    sessionStorage.setItem(PICKER_MARKER, String(Date.now()))
  } catch {}

  // Allow selecting the same file twice in succession.
  input.value = ''
  void ensurePdfReader().catch(() => {})
}

function onNativeChange(event) {
  const input = event.currentTarget
  const selected = input.files?.[0]
  if (!selected) {
    try { sessionStorage.removeItem(PICKER_MARKER) } catch {}
    return
  }

  let file = selected
  try {
    file = normalizePdfMime(input, selected)
  } catch (error) {
    console.error('[document-upload] Could not normalize selected PDF:', error)
    showToast('This browser returned the PDF in an unreadable format. Try selecting it from Files rather than Recent files.', 'error')
  }

  try { sessionStorage.removeItem(PICKER_MARKER) } catch {}
  void ensurePdfReader().catch(() => {})
  showToast(`Selected ${file?.name || selected.name} · extracting text…`)
  // Do not prevent, stop, await, or replay this event. It is the browser's
  // original trusted change event and continues directly to React's handler.
}

function bindInput(input) {
  if (input.dataset.waniNativeBound === 'true') return
  input.dataset.waniNativeBound = 'true'
  input.addEventListener('pointerdown', onNativePointerDown, { passive: true })
  input.addEventListener('change', onNativeChange, true)
}

function unbindInput(input) {
  if (!input || input.dataset.waniNativeBound !== 'true') return
  input.removeEventListener('pointerdown', onNativePointerDown)
  input.removeEventListener('change', onNativeChange, true)
  delete input.dataset.waniNativeBound
}

function hidePreviousOverlay() {
  if (activeInput && !document.contains(activeInput)) {
    unbindInput(activeInput)
    activeInput = null
  }
  if (activeButton && !document.contains(activeButton)) activeButton = null
}

function syncNativeOverlay() {
  syncFrame = 0
  hidePreviousOverlay()

  const input = document.querySelector(FILE_INPUT_SELECTOR)
  const button = input?.previousElementSibling
  if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return

  if (activeInput && activeInput !== input) unbindInput(activeInput)
  activeInput = input
  activeButton = button
  bindInput(input)

  // Explicitly prevent any implicit form submission. The visible button is now
  // presentation only; the real browser file input sits directly above it.
  button.type = 'button'
  button.dataset.waniUploadButton = 'true'

  input.dataset.waniNativeUpload = 'true'
  input.disabled = button.disabled
  input.title = button.title || 'Upload document (PDF, DOCX, TXT)'
  input.setAttribute('aria-label', input.title)

  const rect = button.getBoundingClientRect()
  const visible = rect.width > 0 && rect.height > 0 &&
    rect.bottom > 0 && rect.right > 0 &&
    rect.top < window.innerHeight && rect.left < window.innerWidth

  input.style.setProperty('--wani-upload-left', visible ? `${rect.left}px` : '-100px')
  input.style.setProperty('--wani-upload-top', visible ? `${rect.top}px` : '-100px')
  input.style.setProperty('--wani-upload-width', visible ? `${rect.width}px` : '1px')
  input.style.setProperty('--wani-upload-height', visible ? `${rect.height}px` : '1px')
}

function scheduleSync() {
  if (syncFrame) return
  syncFrame = requestAnimationFrame(syncNativeOverlay)
}

function reportInterruptedPicker() {
  let openedAt = 0
  try { openedAt = Number(sessionStorage.getItem(PICKER_MARKER) || 0) } catch {}
  if (!openedAt || Date.now() - openedAt > 120000) return

  const navigation = performance.getEntriesByType?.('navigation')?.[0]
  if (navigation?.type === 'reload') {
    try { sessionStorage.removeItem(PICKER_MARKER) } catch {}
    setTimeout(() => {
      showToast('Chrome reloaded the page while opening files. The attachment control is now using the native picker—tap it once more.', 'error')
    }, 500)
  }
}

export function installDocumentUploadGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true
  installStyles()

  observer = new MutationObserver(scheduleSync)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'title', 'style'],
  })

  window.addEventListener('resize', scheduleSync)
  window.addEventListener('scroll', scheduleSync, true)
  window.visualViewport?.addEventListener('resize', scheduleSync)
  window.visualViewport?.addEventListener('scroll', scheduleSync)

  // A small timer handles mobile keyboard and toolbar movements that do not
  // consistently emit a window resize event in every Android Chrome version.
  syncTimer = window.setInterval(scheduleSync, 600)
  scheduleSync()
  reportInterruptedPicker()
}

export function uninstallDocumentUploadGuard() {
  if (!installed || typeof window === 'undefined') return
  installed = false
  observer?.disconnect()
  observer = null
  if (syncFrame) cancelAnimationFrame(syncFrame)
  syncFrame = 0
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = null
  window.removeEventListener('resize', scheduleSync)
  window.removeEventListener('scroll', scheduleSync, true)
  window.visualViewport?.removeEventListener('resize', scheduleSync)
  window.visualViewport?.removeEventListener('scroll', scheduleSync)
  unbindInput(activeInput)
  activeInput = null
  activeButton = null
  document.getElementById(STYLE_ID)?.remove()
}
