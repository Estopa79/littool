import { useEffect, useMemo, useState } from 'react'
import { fetchAiLogEntries, monthKey, monthLabel, type AiLogTableRow } from '../lib/aiVerzeichnis'

type Tab = 'ki-verzeichnis' | 'aktivitaet'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const COLUMNS = ['Datum', 'KI-Instrument', 'Verwendung', 'Kritische Überprüfung', 'Betroffene Stelle'] as const

function rowValues(row: AiLogTableRow): string[] {
  return [row.datum, row.kiInstrument, row.verwendung, row.kritischePruefung, row.betroffeneStelle]
}

async function copyAsTable(rows: AiLogTableRow[]): Promise<boolean> {
  const html = `<table><thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${rowValues(r).map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
  const text = [COLUMNS.join('\t'), ...rows.map((r) => rowValues(r).join('\t'))].join('\n')

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

function KiVerzeichnisTab() {
  const [entries, setEntries] = useState<AiLogTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    fetchAiLogEntries()
      .then((rows) => {
        setEntries(rows)
        const months = [...new Set(rows.map((r) => monthKey(r.createdAt)))].sort()
        setSelectedMonth(months[months.length - 1] ?? null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const availableMonths = useMemo(() => [...new Set(entries.map((r) => monthKey(r.createdAt)))].sort(), [entries])
  const visible = useMemo(
    () => entries.filter((r) => monthKey(r.createdAt) === selectedMonth),
    [entries, selectedMonth],
  )

  async function handleCopy() {
    const ok = await copyAsTable(visible)
    setCopyState(ok ? 'copied' : 'error')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  if (loading) return <p className="p-4 text-sm text-slate-400 sm:p-6">Lädt …</p>
  if (error) return <p className="p-4 text-sm text-red-600 dark:text-red-400 sm:p-6">Fehler: {error}</p>

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Monat:</span>
          <select
            value={selectedMonth ?? ''}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={visible.length === 0}
          onClick={handleCopy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {copyState === 'copied' ? '✓ kopiert' : copyState === 'error' ? '✗ fehlgeschlagen' : 'Als Tabelle kopieren'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {visible.length} {visible.length === 1 ? 'Eintrag' : 'Einträge'}. Jede KI-Nutzung wird einzeln aufgeführt (gemäß
        KMU-Akademie-Vorgabe „jede Verwendung ist genauestens zu dokumentieren"), keine Zusammenfassung mehrerer
        Aktionen zu einer Zeile.
      </p>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Keine KI-Nutzung in diesem Monat.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">{row.datum}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-300">{row.kiInstrument}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.verwendung}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.kritischePruefung}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.betroffeneStelle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AktivitaetTab() {
  return (
    <p className="p-4 text-sm text-slate-500 dark:text-slate-400 sm:p-6">
      Aktivitätsübersicht kommt in Paket 7.
    </p>
  )
}

export function Protokolle() {
  const [tab, setTab] = useState<Tab>('ki-verzeichnis')

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 pt-4 sm:px-6 dark:border-slate-800">
        <h1 className="mr-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Protokolle</h1>
        <button
          type="button"
          onClick={() => setTab('ki-verzeichnis')}
          className={`rounded-t-md px-3 py-1.5 text-sm font-medium ${
            tab === 'ki-verzeichnis'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          KI-Verzeichnis
        </button>
        <button
          type="button"
          onClick={() => setTab('aktivitaet')}
          className={`rounded-t-md px-3 py-1.5 text-sm font-medium ${
            tab === 'aktivitaet'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Aktivität
        </button>
      </div>

      {tab === 'ki-verzeichnis' ? <KiVerzeichnisTab /> : <AktivitaetTab />}
    </div>
  )
}
