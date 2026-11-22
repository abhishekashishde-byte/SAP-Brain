import { useEffect, useMemo, useState } from 'react'

// A long paste shown as a file (like a .txt attachment) instead of a wall of text.
// Click it to open a viewer with line numbers, copy and download.

export function pastedFileName(content, fallback = 'pasted_code') {
  const m = String(content || '').match(/^\s*(?:REPORT|PROGRAM|FUNCTION-POOL|FUNCTION|CLASS|INTERFACE)\s+([\w/]+)/im)
  const base = (m?.[1] || fallback).toLowerCase().replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '_')
  return `${base || fallback}.txt`
}

export function downloadText(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const FileIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><polyline points="14 3 14 8 19 8" />
    <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
  </svg>
)

export function FileViewer({ name, content, onClose }) {
  const [copied, setCopied] = useState(false)
  const lines = useMemo(() => String(content || '').split('\n'), [content])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }
  const btn = { border: '1px solid #34343a', background: '#17171a', color: '#ececef', font: "600 13px Inter,sans-serif", padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }
  const gutter = String(lines.length).length
  return (
    <div role="dialog" aria-modal="true" aria-label={name} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(12px,3vw)' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(1100px,100%)', height: 'min(86dvh,100%)', display: 'flex', flexDirection: 'column', background: '#0b0b0d', border: '1px solid #2a2a2f', borderRadius: 14, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #232326', color: '#ececef', flexWrap: 'wrap' }}>
          <FileIcon />
          <strong style={{ font: "600 14px Inter,sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: '1 1 160px' }}>{name}</strong>
          <span style={{ color: '#71717a', font: '12px Inter,sans-serif' }}>{lines.length} lines</span>
          <button style={btn} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <button style={btn} onClick={() => downloadText(name, content)}>Download .txt</button>
          <button style={{ ...btn, padding: '7px 10px' }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: '#070708' }}>
          <pre style={{ margin: 0, padding: '12px 0', font: "12.5px/1.6 'JetBrains Mono','Fira Code',ui-monospace,Menlo,monospace", color: '#e4e4e7', tabSize: 2, minWidth: 'max-content' }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex' }}>
                <span aria-hidden="true" style={{ flex: 'none', width: `${gutter + 2}ch`, textAlign: 'right', paddingRight: '1.5ch', color: '#52525b', userSelect: 'none' }}>{i + 1}</span>
                <span style={{ whiteSpace: 'pre', paddingRight: 16 }}>{l || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default function PastedFile({ content, name, label, onRemove, compact = false, light = false }) {
  const [open, setOpen] = useState(false)
  const fileName = name || pastedFileName(content)
  const lineCount = String(content || '').split('\n').length
  const kb = Math.max(1, Math.round(new Blob([content || '']).size / 1024))
  const c = light
    ? { bg: '#f4f4f5', border: '#e4e4e7', text: '#18181b', dim: '#71717a', icon: '#3f3f46', hover: '#a1a1aa' }
    : { bg: '#141417', border: '#2a2a2f', text: '#ececef', dim: '#8b8b93', icon: '#d4d4d8', hover: '#52525b' }
  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <button type="button" onClick={() => setOpen(true)} title="Open file"
          onMouseEnter={e => { e.currentTarget.parentElement.style.borderColor = c.hover }} onMouseLeave={e => { e.currentTarget.parentElement.style.borderColor = c.border }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, background: 'transparent', border: 0, color: c.text, cursor: 'pointer', padding: compact ? '7px 10px' : '9px 12px', textAlign: 'left' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: c.border, color: c.icon, flex: 'none' }}><FileIcon /></span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ font: "600 13px Inter,sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
            <span style={{ font: '12px Inter,sans-serif', color: c.dim }}>{[label, `${lineCount} lines`, `${kb} KB`].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${fileName}`} title="Remove"
            style={{ alignSelf: 'stretch', background: 'transparent', border: 0, borderLeft: `1px solid ${c.border}`, color: c.dim, cursor: 'pointer', padding: '0 12px', fontSize: 15 }}>✕</button>
        )}
      </div>
      {open && <FileViewer name={fileName} content={content} onClose={() => setOpen(false)} />}
    </>
  )
}
