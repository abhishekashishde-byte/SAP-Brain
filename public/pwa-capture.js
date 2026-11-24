// Capture the PWA install prompt before React loads (kept out of index.html so the
// Content Security Policy can forbid inline scripts).
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  window.dispatchEvent(new Event('pwaPromptReady'));
});
