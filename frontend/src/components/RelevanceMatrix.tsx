import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAuthorYear } from '../lib/sourceFormat'
import { STUDY_TYPE_LABEL, type StudyType } from '../lib/methodProfiles'
import { fetchMatrixData, fetchCellReasoning, type MatrixRow, type MatrixRq } from '../lib/matrix'
import { fetchConfirmedPassagesForCell, type Passage } from '../lib/citations'

const RELEVANCE_DOTS: Record<number, string> = { 1: '•', 2: '••', 3: '•••' }

function relevanceCsvCell(value: number | undefined): string {
  if (!value) return ''
  return RELEVANCE_DOTS[value] ?? String(value)
}

function toCsv(rqs: MatrixRq[], rows: MatrixRow[]): string {
  const header = ['Autor/Jahr', 'Titel', 'Ranking', 'Studientyp', ...rqs.map((r) => r.code)]
  const lines = rows.map((row) => {
    const ranking = row.ranking_system ? `${row.ranking_system} ${row.ranking_value ?? ''}`.trim() : ''
    const studyType = row.study_type ? STUDY_TYPE_LABEL[row.study_type] : ''
    const cells = rqs.map((rq) => relevanceCsvCell(row.relevance[rq.id]))
    return [formatAuthorYear(row), row.title, ranking, studyType, ...cells]
  })
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
  return [header, ...lines].map((line) => line.map(escape).join(',')).join('\n')
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
  const [sortBy, setSortBy] = useState<'title' | 'relevance'>('title')
  const [cell, setCell] = useState<{ sourceId: string; sourceTitle: string; rqId: string; rqCode: string } | null>(null)

  useEffect(() => {
    fetchMatrixData()
      .then(({ rqs: r, rows: rw }) => {
        setRqs(r)
        setRows(rw)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => {
    let result = rows
    if (filterRanking === 'kein Ranking') result = result.filter((r) => !r.ranking_system)
    else if (filterRanking) result = result.filter((r) => r.ranking_system === filterRanking)
    if (filterStudyType) result = result.filter((r) => r.study_type === filterStudyType)

    result = [...result].sort((a, b) => {
      if (sortBy === 'relevance') {
        const maxA = Math.max(0, ...Object.values(a.relevance))
        const maxB = Math.max(0, ...Object.values(b.relevance))
        return maxB - maxA
      }
      return formatAuthorYear(a).localeCompare(formatAuthorYear(b))
    })
    return result
  }, [rows, filterRanking, filterStudyType, sortBy])

  function exportCsv() {
    const csv = toCsv(rqs, visible)
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'title' | 'relevance')}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="title">Titel (A–Z)</option>
          <option value="relevance">Höchste Relevanz</option>
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
              <th className="py-2 pr-3 font-medium">Autor/Jahr</th>
              <th className="py-2 pr-3 font-medium">Titel</th>
              <th className="py-2 pr-3 font-medium">Ranking</th>
              <th className="py-2 pr-3 font-medium">Studientyp</th>
              {rqs.map((rq) => (
                <th key={rq.id} className="py-2 pr-3 text-center font-medium">
                  {rq.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.source_id} className="border-b border-slate-100 dark:border-slate-900">
                <td className="whitespace-nowrap py-2 pr-3 text-slate-700 dark:text-slate-300">
                  {formatAuthorYear(row)}
                </td>
                <td className="max-w-xs truncate py-2 pr-3 text-slate-800 dark:text-slate-100">
                  <Link to={`/bibliothek/${row.source_id}`} className="hover:underline">
                    {row.title}
                  </Link>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-slate-600 dark:text-slate-400">
                  {row.ranking_system ? `${row.ranking_system} ${row.ranking_value}` : '–'}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-slate-600 dark:text-slate-400">
                  {row.study_type ? STUDY_TYPE_LABEL[row.study_type] : '–'}
                </td>
                {rqs.map((rq) => {
                  const value = row.relevance[rq.id] ?? 0
                  return (
                    <td key={rq.id} className="py-2 pr-3 text-center">
                      {value > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCell({ sourceId: row.source_id, sourceTitle: row.title, rqId: rq.id, rqCode: rq.code })
                          }
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
