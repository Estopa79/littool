function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Kopiert eine Tabelle sowohl als HTML (landet in Word als echte Tabelle,
// nicht als Text) als auch als Tab-getrennter Text (Fallback fuer Ziele ohne
// HTML-Clipboard-Unterstuetzung) - gleiches Zwei-Format-Muster wie
// views/Protokolle.tsx::copyAsTable.
export async function copyTableToClipboard(columns: string[], rows: string[][]): Promise<boolean> {
  const html = `<table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
  const text = [columns.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}

export function downloadCsv(columns: string[], rows: string[][], filename: string): void {
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
  const csv = [columns, ...rows].map((line) => line.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
