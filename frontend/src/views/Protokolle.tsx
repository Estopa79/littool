import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { fetchAiLogEntries, monthKey, monthLabel, type AiLogTableRow } from '../lib/aiVerzeichnis'
import {
  fetchActiveDates,
  monthKeyOfDate,
  monthLabel as monthLabelFromKey,
  groupByWeek,
  buildCopyText,
  WEEKDAY_LABELS,
} from '../lib/aktivitaet'
import { useActiveDocument } from '../lib/ActiveDocumentContext'
import {
  deleteDocxReview,
  fetchDocxReviewFindings,
  fetchDocxReviews,
  uploadDocxForReview,
  type DocxReview,
  type DocxReviewFinding,
  type FindingSeverity,
} from '../lib/docxReview'

type Tab = 'ki-verzeichnis' | 'aktivitaet' | 'pruefbericht'

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
  const [dates, setDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    fetchActiveDates()
      .then((set) => {
        const sorted = [...set].sort()
        setDates(sorted)
        const months = [...new Set(sorted.map(monthKeyOfDate))].sort()
        setSelectedMonth(months[months.length - 1] ?? null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const availableMonths = useMemo(() => [...new Set(dates.map(monthKeyOfDate))].sort(), [dates])
  const datesInMonth = useMemo(
    () => dates.filter((d) => monthKeyOfDate(d) === selectedMonth),
    [dates, selectedMonth],
  )
  const weeks = useMemo(() => groupByWeek(datesInMonth), [datesInMonth])
  const total = datesInMonth.length

  async function handleCopy() {
    if (!selectedMonth) return
    const text = buildCopyText(monthLabelFromKey(selectedMonth), weeks, total)
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
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
                {monthLabelFromKey(m)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={weeks.length === 0}
          onClick={handleCopy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {copyState === 'copied' ? '✓ kopiert' : copyState === 'error' ? '✗ fehlgeschlagen' : 'Monatsübersicht kopieren'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Bewusst ohne Stunden – reine Gedächtnisstütze fürs händische Dissertationsprotokoll, welche Tage du am Tool
        gearbeitet hast (Uploads, KI-Aktionen, Häkchen, Bestätigungen).
      </p>

      {weeks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Keine Aktivität in diesem Monat.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {weeks.map((w) => (
              <li key={w.key} className="flex items-center gap-3 text-sm">
                <span className="w-14 shrink-0 font-medium text-slate-700 dark:text-slate-300">{w.label}:</span>
                <span className="flex flex-1 flex-wrap gap-2 text-slate-600 dark:text-slate-400">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <span key={label} className={w.weekdays[i] ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-300 dark:text-slate-700'}>
                      {label}
                      {w.weekdays[i] ? ' ▪' : ''}
                    </span>
                  ))}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  ({w.count} {w.count === 1 ? 'Tag' : 'Tage'})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            {selectedMonth && monthLabelFromKey(selectedMonth)} gesamt: {total} aktive {total === 1 ? 'Tag' : 'Tage'}
          </p>
        </>
      )}
    </div>
  )
}

const SEVERITY_LABEL: Record<FindingSeverity, string> = { fehler: '🔴 Fehler', warnung: '🟡 Warnung', hinweis: 'ℹ️ Hinweis' }
const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  fehler: 'border-red-200 dark:border-red-900',
  warnung: 'border-amber-200 dark:border-amber-900',
  hinweis: 'border-slate-200 dark:border-slate-800',
}
const REVIEW_POLL_INTERVAL_MS = 4000

function FindingCard({ finding }: { finding: DocxReviewFinding }) {
  return (
    <li className={`rounded-md border p-2 text-xs ${SEVERITY_CLASS[finding.severity]}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800 dark:text-slate-100">{SEVERITY_LABEL[finding.severity]}</span>
        {finding.doc_location && <span className="text-slate-400 dark:text-slate-500">{finding.doc_location}</span>}
      </div>
      <p className="text-slate-700 dark:text-slate-300">{finding.description}</p>
      {finding.context_snippet && (
        <p className="mt-1 italic text-slate-500 dark:text-slate-400">„…{finding.context_snippet}…"</p>
      )}
      {finding.suggestion && (
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          <span className="font-medium">Vorschlag:</span> {finding.suggestion}
        </p>
      )}
    </li>
  )
}

function ReviewCard({ review, onDeleted }: { review: DocxReview; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [findings, setFindings] = useState<DocxReviewFinding[] | null>(null)
  const [loadingFindings, setLoadingFindings] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleToggle() {
    if (!expanded && findings === null) {
      setLoadingFindings(true)
      try {
        setFindings(await fetchDocxReviewFindings(review.id))
      } finally {
        setLoadingFindings(false)
      }
    }
    setExpanded((v) => !v)
  }

  async function handleDelete() {
    if (!confirm(`„${review.filename}" wirklich aus dem Prüfbericht-Verlauf löschen?`)) return
    setDeleting(true)
    try {
      await deleteDocxReview(review)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{review.filename}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {new Date(review.created_at).toLocaleString('de-DE')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-slate-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
          aria-label="Löschen"
        >
          ✕
        </button>
      </div>

      {(review.status === 'pending' || review.status === 'running') && (
        <p className="mt-2 text-xs text-slate-400">
          {review.status === 'running' ? 'Wird gerade verarbeitet …' : 'Wartet auf Verarbeitung'} – nächster
          Worker-Lauf (
          <code>littool-worker docx-review --review-id {review.id}</code>) holt das nach.
        </p>
      )}

      {review.status === 'failed' && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">Fehlgeschlagen: {review.error}</p>
      )}

      {review.status === 'done' && review.summary && (
        <div className="mt-2">
          <button
            type="button"
            onClick={handleToggle}
            className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-300"
          >
            {expanded ? '– Bericht ausblenden' : '+ Bericht anzeigen'} ({review.summary.fehler} Fehler,{' '}
            {review.summary.warnung} Warnungen, {review.summary.hinweis} Hinweise · {review.summary.zitate_gefunden}{' '}
            Zitationen geprüft)
          </button>
          {expanded && (
            <div className="mt-2">
              {loadingFindings && <p className="text-xs text-slate-400">Lädt …</p>}
              {findings && findings.length === 0 && (
                <p className="text-xs text-slate-400">Keine Befunde – Zitationen und Literaturverzeichnis sauber.</p>
              )}
              {findings && findings.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {findings.map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function PruefberichtTab() {
  const { documents, activeDocumentId } = useActiveDocument()
  const [reviews, setReviews] = useState<DocxReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [targetDocumentId, setTargetDocumentId] = useState<string>('')

  function load() {
    return fetchDocxReviews()
      .then(setReviews)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setTargetDocumentId((prev) => prev || activeDocumentId || '')
  }, [activeDocumentId])

  // Solange mindestens eine Pruefung noch nicht fertig ist, alle paar
  // Sekunden neu laden - der eigentliche Worker-Lauf startet manuell (gleiches
  // Muster wie die Schnell-Einschaetzung im Eingang-Tab), das Polling holt
  // nur das Ergebnis nach, sobald es fertig ist.
  useEffect(() => {
    if (!reviews.some((r) => r.status === 'pending' || r.status === 'running')) return
    const interval = setInterval(load, REVIEW_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [reviews])

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setUploadError('Nur .docx-Dateien werden unterstützt.')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      await uploadDocxForReview(file, targetDocumentId || null)
      await load()
    } catch (err) {
      setUploadError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <p className="p-4 text-sm text-slate-400 sm:p-6">Lädt …</p>
  if (error) return <p className="p-4 text-sm text-red-600 dark:text-red-400 sm:p-6">Fehler: {error}</p>

  return (
    <div className="p-4 sm:p-6">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        .docx hochladen (ISP/Exposé/Diss-Entwurf) - prüft Zitationen im Text gegen den Bestand (Quelle vorhanden?
        Seite plausibel? wörtliches Zitat nachweisbar?) und den Abgleich mit dem Literaturverzeichnis. Ergebnis sind
        Korrektur-VORSCHLÄGE zum Übernehmen, kein automatisches Umschreiben der Datei.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={targetDocumentId}
          onChange={(e) => setTargetDocumentId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">(kein Dokument-Bezug)</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          {uploading ? 'Wird hochgeladen …' : '⬆ .docx hochladen'}
          <input type="file" accept=".docx" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
      </div>
      {uploadError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {uploadError}</p>}

      {reviews.length === 0 ? (
        <p className="text-sm text-slate-400">Noch keine Prüfungen.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} onDeleted={load} />
          ))}
        </ul>
      )}
    </div>
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
        <button
          type="button"
          onClick={() => setTab('pruefbericht')}
          className={`rounded-t-md px-3 py-1.5 text-sm font-medium ${
            tab === 'pruefbericht'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Prüfbericht
        </button>
      </div>

      {tab === 'ki-verzeichnis' && <KiVerzeichnisTab />}
      {tab === 'aktivitaet' && <AktivitaetTab />}
      {tab === 'pruefbericht' && <PruefberichtTab />}
    </div>
  )
}
