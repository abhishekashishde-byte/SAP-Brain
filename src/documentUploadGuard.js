const FILE_INPUT_SELECTOR = 'input[type="file"][accept*=".pdf"]'
const PICKER_MARKER = 'wani-upload-picker-opened-at'

let installed = false
let observer = null
let pdfReaderPromise = null
let toastTimer = null

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

async function ensurePdfReader() {
  if (window.pdfjsLib?.getDocument) return window.pdfjsLib
  if (pdfReaderPromise) return pdfReaderPromise

  // Start loading on the user's initial press. The picker opens synchronously,
  // while the bundled parser continues loading as the user chooses a file.
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
  try { sessionStorage.setItem(PICKER_MARKER, String(Date.now())) } catch {}
}

function clearPickerMarker() {
  try { sessionStorage.removeItem(PICKER_MARKER) } catch {}
}

function onPointerDownCapture(event) {
  if (!(event.target instanceof Element)) return
  const targetButton = event.target.closest('button[data-wani-upload-button="true"]')
  if (!targetButton) return

  markPickerOpened()
  // Do not await this. Awaiting before opening a picker loses the browser's
  // trusted user activation and Android refuses to show the chooser.
  void ensurePdfReader().catch(() => {})
}

function onClickCapture(event) {
  if (!(event.target instanceof Element)) return
  const targetButton = event.target.closest('button[data-wani-upload-button="true"]')
  if (!targetButton) return

  const { input, button } = getUploadParts()
  if (!input || !button || targetButton !== button) return

  // Stop React's old input.click() handler so the picker is opened exactly
  // once. showPicker() is the browser-native API and keeps the user gesture.
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
    setTimeout(() => {
      showToast('Chrome reloaded while opening files. The paperclip is now using the browser picker directly—tap it once more.', 'error')
    }, 500)
  }
}

export function installDocumentUploadGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true

  observer = new MutationObserver(syncUploadButton)
  observer.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('pointerdown', onPointerDownCapture, true)
  document.addEventListener('click', onClickCapture, true)
  document.addEventListener('change', onChangeCapture, true)

  syncUploadButton()
  reportInterruptedPicker()
}

export function uninstallDocumentUploadGuard() {
  if (!installed || typeof window === 'undefined') return
  installed = false
  observer?.disconnect()
  observer = null
  document.removeEventListener('pointerdown', onPointerDownCapture, true)
  document.removeEventListener('click', onClickCapture, true)
  document.removeEventListener('change', onChangeCapture, true)
}
