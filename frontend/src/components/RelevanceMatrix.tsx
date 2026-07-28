import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAuthorYear } from '../lib/sourceFormat'
import { STUDY_TYPE_LABEL, type StudyType } from '../lib/methodProfiles'
import { fetchMatrixData, fetchCellReasoning, type MatrixRow, type MatrixRq } from '../lib/matrix'
import { fetchConfirmedPassagesForCell, type Passage } from '../lib/citations'
import { fetchAllTopics, type TopicOption } from '../lib/qsReview'
import { VennDiagram } from './VennDiagram'

const RELEVANCE_DOTS: Record<number, string> = { 1: '•', 2: '••', 3: '•••' }

const COLUMN_ORDER_STORAGE_KEY = 'littool:relevanzmatrix:columnOrder'

type FixedColumnKey = 'author_year' | 'title' | 'ranking' | 'study_type'
const FIXED_COLUMNS: Array<{ key: FixedColumnKey; label: string }> = [
  { key: 'author_year', label: 'Autor/Jahr' },
  { key: 'title', label: 'Titel' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'study_type', label: 'Studientyp' },
]

function rqKey(rqId: string): string {
  return `rq:${rqId}`
}

function columnLabel(key: string, rqs: MatrixRq[]): string {
  const fixed = FIXED_COLUMNS.find((c) => c.key === key)
  if (fixed) return fixed.label
  return rqs.find((r) => rqKey(r.id) === key)?.code ?? '?'
}

// Behaelt bereits gemerkte Spalten in ihrer gespeicherten Reihenfolge bei,
// haengt neu hinzugekommene (z.B. eine neue Forschungsfrage) automatisch
// hinten an, statt sie zu verlieren oder die gespeicherte Reihenfolge zu
// verwerfen.
function mergeColumnOrder(persisted: string[] | null, defaultOrder: string[]): string[] {
  if (!persisted) return defaultOrder
  const filtered = persisted.filter((k) => defaultOrder.includes(k))
  const missing = defaultOrder.filter((k) => !filtered.includes(k))
  return [...filtered, ...missing]
}

function rankingSortValue(row: MatrixRow): string {
  return row.ranking_system ? `${row.ranking_system} ${row.ranking_value ?? ''}`.trim() : ''
}

function compareByColumn(key: string, a: MatrixRow, b: MatrixRow): number {
  if (key === 'author_year') return formatAuthorYear(a).localeCompare(formatAuthorYear(b))
  if (key === 'title') return a.title.localeCompare(b.title)
  if (key === 'ranking') return rankingSortValue(a).localeCompare(rankingSortValue(b))
  if (key === 'study_type') {
    const la = a.study_type ? STUDY_TYPE_LABEL[a.study_type] : ''
    const lb = b.study_type ? STUDY_TYPE_LABEL[b.study_type] : ''
    return la.localeCompare(lb)
  }
  if (key.startsWith('rq:')) {
    const rqId = key.slice(3)
    return (a.relevance[rqId] ?? 0) - (b.relevance[rqId] ?? 0)
  }
  return 0
}

function relevanceCsvCell(value: number | undefined): string {
  if (!value) return ''
  return RELEVANCE_DOTS[value] ?? String(value)
}

function toCsv(columnOrder: string[], rqs: MatrixRq[], rows: MatrixRow[]): string {
  const header = columnOrder.map((key) => columnLabel(key, rqs))
  const lines = rows.map((row) => columnOrder.map((key) => csvCell(key, row)))
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
  return [header, ...lines].map((line) => line.map(escape).join(',')).join('\n')
}

function csvCell(key: string, row: MatrixRow): string {
  if (key === 'author_year') return formatAuthorYear(row)
  if (key === 'title') return row.title
  if (key === 'ranking') return rankingSortValue(row)
  if (key === 'study_type') return row.study_type ? STUDY_TYPE_LABEL[row.study_type] : ''
  if (key.startsWith('rq:')) return relevanceCsvCell(row.relevance[key.slice(3)])
  return ''
}

function CellModal({
  sourceTitle,
  rqCode,
  sourceId,
  rqId,
  onClose,
}: {
  sourceTitle: string
  rqCode: string
  sourceId: string
  rqId: string
  onClose: () => void
}) {
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [passages, setPassages] = useState<Passage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchCellReasoning(sourceId, rqId), fetchConfirmedPassagesForCell(sourceId, rqId)])
      .then(([r, p]) => {
        setReasoning(r)
        setPassages(p)
      })
      .finally(() => setLoading(false))
  }, [sourceId, rqId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {sourceTitle} × {rqCode}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {loading && <p className="text-slate-400">Lädt …</p>}
          {!loading && reasoning && (
            <p className="mb-3 text-slate-600 dark:text-slate-400">
              <span className="font-medium">KI-Begründung:</span> {reasoning}
            </p>
          )}
          {!loading && passages.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400">Noch keine bestätigten Zitate für diese Kombination.</p>
          )}
          <ul className="flex flex-col gap-2">
            {passages.map((p) => (
              <li key={p.id} className="rounded-md border border-slate-200 p-2 dark:border-slate-800">
                <p className="italic text-slate-700 dark:text-slate-300">„{p.original}"</p>
                {p.translation && <p className="mt-1 text-slate-600 dark:text-slate-400">{p.translation}</p>}
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{p.citation}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function RelevanceMatrix() {
  const [rqs, setRqs] = useState<MatrixRq[]>([])
  const [rows, setRows] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterRanking, setFilterRanking] = useState('')
  const [filterStudyType, setFilterStudyType] = useState('')
  const [filterTopic, setFilterTopic] = useState('')
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [sortKey, setSortKey] = useState<string>('author_year')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [draggedKey, setDraggedKey] = useState<string | null>(null)
  const [cell, setCell] = useState<{ sourceId: string; sourceTitle: string; rqId: string; rqCode: string } | null>(null)

  useEffect(() => {
    fetchMatrixData()
      .then(({ rqs: r, rows: rw }) => {
        setRqs(r)
        setRows(rw)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
    fetchAllTopics().then(setAllTopics)
  }, [])

  // Spaltenreihenfolge (Paket: Ad-hoc-Wunsch des Autors) - gespeichert je
  // Browser, nicht in der DB (reine Anzeige-Praeferenz). Erst berechenbar,
  // sobald die Forschungsfragen geladen sind (bestimmen die dynamischen
  // Spalten); bereits gespeicherte Reihenfolge bleibt erhalten, neue FFs
  // werden automatisch hinten angehaengt.
  useEffect(() => {
    if (rqs.length === 0 && rows.length === 0) return
    const defaultOrder = [...FIXED_COLUMNS.map((c) => c.key as string), ...rqs.map((r) => rqKey(r.id))]
    let persisted: string[] | null = null
    try {
      const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY)
      persisted = raw ? JSON.parse(raw) : null
    } catch {
      // ungueltiger localStorage-Wert - Default greift
    }
    setColumnOrder(mergeColumnOrder(persisted, defaultOrder))
  }, [rqs, rows.length])

  useEffect(() => {
    if (columnOrder.length === 0) return
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder))
  }, [columnOrder])

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Relevanz-Spalten (rq:*) starten sinnvollerweise mit "hoechste zuerst".
      setSortDir(key.startsWith('rq:') ? 'desc' : 'asc')
    }
  }

  function handleDrop(targetKey: string) {
    if (!draggedKey || draggedKey === targetKey) {
      setDraggedKey(null)
      return
    }
    setColumnOrder((prev) => {
      const next = [...prev]
      const fromIdx = next.indexOf(draggedKey)
      const toIdx = next.indexOf(targetKey)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, draggedKey)
      return next
    })
    setDraggedKey(null)
  }

  const visible = useMemo(() => {
    let result = rows
    if (filterRanking === 'kein Ranking') result = result.filter((r) => !r.ranking_system)
    else if (filterRanking) result = result.filter((r) => r.ranking_system === filterRanking)
    if (filterStudyType) result = result.filter((r) => r.study_type === filterStudyType)
    if (filterTopic) result = result.filter((r) => r.topics.includes(filterTopic))

    result = [...result].sort((a, b) => {
      const cmp = compareByColumn(sortKey, a, b)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [rows, filterRanking, filterStudyType, filterTopic, sortKey, sortDir])

  function exportCsv() {
    const csv = toCsv(columnOrder, rqs, visible)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relevanz-matrix.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="p-4 text-sm text-slate-400">Lädt …</p>
  if (error) return <p className="p-4 text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>

  return (
    <div className="p-4 sm:p-6">
      <p className="mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Zeigt, wie stark die KI jede Quelle für jede Forschungsfrage einschätzt (Punkte = Relevanz 0–3). Hilft dir zu
        sehen, welche Quellen für eine Forschungsfrage am wichtigsten sind – und wo im Bestand noch Lücken liegen.
        Zelle anklicken für die Begründung und ggf. schon bestätigte Zitate. Spaltenköpfe ziehen zum Umsortieren,
        anklicken zum Sortieren.
      </p>

      <VennDiagram />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Themenfelder</option>
          {allTopics.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filterRanking}
          onChange={(e) => setFilterRanking(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Rankings</option>
          <option value="VHB">VHB</option>
          <option value="SJR">SJR</option>
          <option value="CORE">CORE</option>
          <option value="kein Ranking">Kein Ranking</option>
        </select>
        <select
          value={filterStudyType}
          onChange={(e) => setFilterStudyType(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Studientypen</option>
          {(Object.entries(STUDY_TYPE_LABEL) as Array<[StudyType, string]>).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          CSV exportieren
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {columnOrder.map((key) => (
                <th
                  key={key}
                  draggable
                  onDragStart={() => setDraggedKey(key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(key)}
                  className={`cursor-move py-2 pr-3 font-medium ${key.startsWith('rq:') ? 'text-center' : ''} ${
                    draggedKey === key ? 'opacity-40' : ''
                  }`}
                  title="Ziehen zum Umsortieren, klicken zum Sortieren"
                >
                  <button
                    type="button"
                    className="select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort(key)}
                  >
                    {columnLabel(key, rqs)}
                    {sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.source_id} className="border-b border-slate-100 dark:border-slate-900">
                {columnOrder.map((key) => {
                  if (key === 'author_year') {
                    return (
                      <td key={key} className="whitespace-nowrap py-2 pr-3 text-slate-700 dark:text-slate-300">
                        {formatAuthorYear(row)}
                      </td>
                    )
                  }
                  if (key === 'title') {
                    return (
                      <td key={key} className="max-w-xs truncate py-2 pr-3 text-slate-800 dark:text-slate-100">
                        <Link to={`/bibliothek/${row.source_id}`} className="hover:underline">
                          {row.title}
                        </Link>
                      </td>
                    )
                  }
                  if (key === 'ranking') {
                    return (
                      <td key={key} className="whitespace-nowrap py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {row.ranking_system ? `${row.ranking_system} ${row.ranking_value}` : '–'}
                      </td>
                    )
                  }
                  if (key === 'study_type') {
                    return (
                      <td key={key} className="whitespace-nowrap py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {row.study_type ? STUDY_TYPE_LABEL[row.study_type] : '–'}
                      </td>
                    )
                  }
                  const rqId = key.slice(3)
                  const rq = rqs.find((r) => r.id === rqId)
                  const value = row.relevance[rqId] ?? 0
                  return (
                    <td key={key} className="py-2 pr-3 text-center">
                      {value > 0 && rq ? (
                        <button
                          type="button"
                          onClick={() => setCell({ sourceId: row.source_id, sourceTitle: row.title, rqId, rqCode: rq.code })}
                          className="text-amber-600 hover:underline dark:text-amber-400"
                          title={`Relevanz ${value}/3`}
                        >
                          {RELEVANCE_DOTS[value]}
                        </button>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">–</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cell && (
        <CellModal
          sourceTitle={cell.sourceTitle}
          rqCode={cell.rqCode}
          sourceId={cell.sourceId}
          rqId={cell.rqId}
          onClose={() => setCell(null)}
        />
      )}
    </div>
  )
}
