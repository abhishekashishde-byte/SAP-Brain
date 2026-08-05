const PDF_INPUT_SELECTOR = 'input[type="file"][accept*=".pdf"]'
const PDF_VERSION = '3.11.174'
const LOAD_TIMEOUT_MS = 12000

const PDF_SOURCES = [
  {
    script: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VERSION}/pdf.min.js`,
    worker: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VERSION}/pdf.worker.min.js`,
  },
  {
    script: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDF_VERSION}/build/pdf.min.js`,
    worker: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDF_VERSION}/build/pdf.worker.min.js`,
  },
]

let installed = false
let loadingPdfJs = null
let toastTimer = null

function isPdf(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')
}

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
    width: 'min(340px, calc(100vw - 32px))',
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
    zIndex: '1000',
    pointerEvents: 'none',
  })
  document.body.appendChild(toast)
  toastTimer = setTimeout(() => toast.remove(), tone === 'error' ? 6500 : 3200)
}

function configureWorker(workerUrl) {
  if (!window.pdfjsLib?.GlobalWorkerOptions) return false
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
  return true
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === url)
    if (existing && window.pdfjsLib) return resolve()

    const script = existing || document.createElement('script')
    let settled = false
    const finish = callback => value => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      script.onload = null
      script.onerror = null
      callback(value)
    }
    const succeed = finish(resolve)
    const fail = finish(reject)
    const timeout = setTimeout(() => fail(new Error('PDF reader timed out')), LOAD_TIMEOUT_MS)

    script.onload = succeed
    script.onerror = () => fail(new Error('PDF reader could not be loaded'))
    if (!existing) {
      script.src = url
      script.crossOrigin = 'anonymous'
      script.dataset.waniPdfLoader = 'true'
      document.head.appendChild(script)
    }
  })
}

async function ensurePdfJs() {
  if (window.pdfjsLib) {
    const knownWorker = window.pdfjsLib.GlobalWorkerOptions?.workerSrc
    if (knownWorker) return
    configureWorker(PDF_SOURCES[0].worker)
    return
  }

  if (loadingPdfJs) return loadingPdfJs
  loadingPdfJs = (async () => {
    let lastError = null
    for (const source of PDF_SOURCES) {
      try {
        await loadScript(source.script)
        if (!window.pdfjsLib) throw new Error('PDF reader loaded without its API')
        configureWorker(source.worker)
        return
      } catch (error) {
        lastError = error
        document.querySelector(`script[src="${source.script}"]`)?.remove()
      }
    }
    throw lastError || new Error('PDF reader unavailable')
  })().finally(() => { loadingPdfJs = null })

  return loadingPdfJs
}

function normalizePdfMime(input, file) {
  if (file.type === 'application/pdf') return file
  if (typeof DataTransfer === 'undefined' || typeof File === 'undefined') {
    throw new Error('This browser did not identify the selected file as a PDF')
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

async function preparePdfSelection(event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.matches(PDF_INPUT_SELECTOR)) return

  if (input.dataset.waniPdfPrepared === 'true') {
    delete input.dataset.waniPdfPrepared
    return
  }

  const file = input.files?.[0]
  if (!isPdf(file)) return

  const needsMimeFix = file.type !== 'application/pdf'
  const needsReader = !window.pdfjsLib
  if (!needsMimeFix && !needsReader) {
    configureWorker(window.pdfjsLib.GlobalWorkerOptions?.workerSrc || PDF_SOURCES[0].worker)
    return
  }

  // Stop React's upload handler until the Android file metadata and PDF parser
  // are ready. Then replay the same change event so Brain.jsx continues normally.
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()

  showToast('Preparing the selected PDF…')
  try {
    normalizePdfMime(input, file)
    await ensurePdfJs()
    input.dataset.waniPdfPrepared = 'true'
    input.dispatchEvent(new Event('change', { bubbles: true }))
  } catch (error) {
    console.error('[document-upload] PDF preparation failed:', error.message)
    input.value = ''
    showToast('The PDF reader could not start. Check your connection, then select the file again.', 'error')
  }
}

export function installDocumentUploadGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('change', preparePdfSelection, true)
}

export function uninstallDocumentUploadGuard() {
  if (!installed || typeof document === 'undefined') return
  document.removeEventListener('change', preparePdfSelection, true)
  installed = false
}
