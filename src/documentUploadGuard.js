import * as pdfjsLib from 'pdfjs-dist/build/pdf.js'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

const PDF_INPUT_SELECTOR = 'input[type="file"][accept*=".pdf"]'

let installed = false
let toastTimer = null

// Brain.jsx already consumes window.pdfjsLib. Publish the package that is
// already installed in this app before React renders, so PDF extraction never
// depends on a runtime CDN request or a delayed file-event replay.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
if (typeof window !== 'undefined') window.pdfjsLib = pdfjsLib

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
  toastTimer = setTimeout(() => toast.remove(), tone === 'error' ? 6500 : 2600)
}

function normalizePdfSelection(event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.matches(PDF_INPUT_SELECTOR)) return

  const file = input.files?.[0]
  if (!isPdf(file)) return

  // Android file pickers sometimes return a real .pdf with an empty or generic
  // MIME type. Brain.jsx checks application/pdf, so replace only the File
  // metadata synchronously and let the ORIGINAL change event continue to React.
  // Do not stop, await, or replay the event: some Android Chrome builds discard
  // synthetic file-input change events for security reasons.
  if (file.type !== 'application/pdf') {
    try {
      if (typeof DataTransfer === 'undefined' || typeof File === 'undefined') {
        throw new Error('File metadata APIs unavailable')
      }
      const typedFile = new File([file], file.name || 'document.pdf', {
        type: 'application/pdf',
        lastModified: file.lastModified || Date.now(),
      })
      const transfer = new DataTransfer()
      transfer.items.add(typedFile)
      input.files = transfer.files
    } catch (error) {
      console.error('[document-upload] Could not normalize PDF type:', error.message)
      showToast('This browser could not read the selected PDF. Try a TXT file for this test.', 'error')
      return
    }
  }

  showToast(`Selected ${input.files?.[0]?.name || 'PDF'} · extracting text…`)
}

export function installDocumentUploadGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('change', normalizePdfSelection, true)
}

export function uninstallDocumentUploadGuard() {
  if (!installed || typeof document === 'undefined') return
  document.removeEventListener('change', normalizePdfSelection, true)
  installed = false
}
