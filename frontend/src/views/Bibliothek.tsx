import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadPanel } from '../components/UploadPanel'
import { GreyLiteratureDialog } from '../components/GreyLiteratureDialog'
import { fetchSources, type Source } from '../lib/sources'
import { formatAuthorYear, formatRanking, STATUS_ICON, STATUS_LABEL, TYPE_LABEL } from '../lib/sourceFormat'
import { fetchAllSourceFunctions, fetchWorkFunctions, type WorkFunction } from '../lib/functions'
import { generateCitations, type GenerateCitationsResult } from '../lib/citations'
import { CitationReviewDialog } from '../components/CitationReviewDialog'
import { fetchReviewCounts } from '../lib/qsReview'

type SortOption = 'year_desc' | 'year_asc' | 'title_asc'

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Typen' },
  { value: 'journal', label: 'Journal' },
  { value: 'konferenz', label: 'Konferenz' },
  { value: 'buch', label: 'Buch' },
  { value: 'grau', label: 'Graue Literatur' },
]

const RANKING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Rankings' },
  { value: 'VHB', label: 'VHB' },
  { value: 'SJR', label: 'SJR' },
  { value: 'CORE', label: 'CORE' },
  { value: 'kein Ranking', label: 'Kein Ranking' },
]

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Status' },
  { value: 'processing', label: STATUS_LABEL.processing },
  { value: 'needs_review', label: STATUS_LABEL.needs_review },
  { value: 'complete', label: STATUS_LABEL.complete },
  { value: 'failed', label: STATUS_LABEL.failed },
]

export function Bibliothek() {
  const navigate = useNavigate()
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterRanking, setFilterRanking] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [onlyExtractionIssues, setOnlyExtractionIssues] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('year_desc')
  const [showGreyDialog, setShowGreyDialog] = useState(false)
  const [workFunctions, setWorkFunctions] = useState<WorkFunction[]>([])
  const [filterFunction, setFilterFunction] = useState('')
  const [sourceIdsByFunction, setSourceIdsByFunction] = useState<Map<string, Set<string>>>(new Map())
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [reviewResult, setReviewResult] = useState<{ sourceTitle: string; data: GenerateCitationsResult } | null>(
    null,
  )
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [unconfirmedTotal, setUnconfirmedTotal] = useState(0)

  useEffect(() => {
    fetchWorkFunctions().then(setWorkFunctions)
    fetchAllSourceFunctions().then((rows) => {
      const map = new Map<string, Set<string>>()
      for (const row of rows) {
        if (!map.has(row.function_id)) map.set(row.function_id, new Set())
        map.get(row.function_id)!.add(row.source_id)
      }
      setSourceIdsByFunction(map)
    })
    fetchReviewCounts().then((counts) => setUnconfirmedTotal(counts.reduce((sum, c) => sum + c.count, 0)))
  }, [])

  function load() {
    setLoading(true)
    fetchSources()
      .then((data) => {
        setSources(data)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleGenerate(source: Source, e: MouseEvent) {
    e.stopPropagation()
    setGeneratingId(source.id)
    setGenerateError(null)
    try {
      const data = await generateCitations(source.id)
      setReviewResult({ sourceTitle: source.title, data })
    } catch (err) {
      setGenerateError((err as Error).message)
    } finally {
      setGeneratingId(null)
    }
  }

  const needsReviewCount = useMemo(
    () => sources.filter((s) => s.status === 'needs_review').length,
    [sources],
  )

  const extractionFailedCount = useMemo(
    () => sources.filter((s) => s.extraction_status === 'extraction_failed').length,
    [sources],
  )

  const visible = useMemo(() => {
    let result = sources

    if (filterType) result = result.filter((s) => s.type === filterType)
    if (filterStatus) result = result.filter((s) => s.status === filterStatus)
    if (onlyExtractionIssues) result = result.filter((s) => s.extraction_status === 'extraction_failed')
    if (filterRanking === 'kein Ranking') {
      result = result.filter((s) => !s.ranking_system)
    } else if (filterRanking) {
      result = result.filter((s) => s.ranking_system === filterRanking)
    }
    if (filterFunction) {
      const ids = sourceIdsByFunction.get(filterFunction) ?? new Set()
      result = result.filter((s) => ids.has(s.id))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((s) => s.title.toLowerCase().includes(q))
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'title_asc') return a.title.localeCompare(b.title)
      const ay = a.year ?? 0
      const by = b.year ?? 0
      return sortBy === 'year_asc' ? ay - by : by - ay
    })

    return result
  }, [
    sources,
    filterType,
    filterStatus,
    filterRanking,
    filterFunction,
    sourceIdsByFunction,
    onlyExtractionIssues,
    search,
    sortBy,
  ])

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100">Bibliothek</h1>

      <div className="mb-4 flex flex-wrap items-start gap-2">
        <UploadPanel onUploaded={load} />
        <button
          type="button"
          onClick={() => setShowGreyDialog(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Graue Literatur
        </button>
      </div>

      {showGreyDialog && (
        <GreyLiteratureDialog onClose={() => setShowGreyDialog(false)} onCreated={load} />
      )}

      {needsReviewCount > 0 && (
        <button
          type="button"
          onClick={() => setFilterStatus('needs_review')}
          className="mb-4 mr-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          ⚠️ {needsReviewCount} zu prüfen
        </button>
      )}

      {unconfirmedTotal > 0 && (
        <button
          type="button"
          onClick={() => navigate('/pruefen')}
          className="mb-4 mr-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
        >
          🔍 {unconfirmedTotal} unbestätigte KI-Zuordnungen prüfen
        </button>
      )}

      {extractionFailedCount > 0 && (
        <button
          type="button"
          onClick={() => setOnlyExtractionIssues((v) => !v)}
          className={`mb-4 rounded-md border px-3 py-1.5 text-sm font-medium ${
            onlyExtractionIssues
              ? 'border-red-400 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-900 dark:text-red-200'
              : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900'
          }`}
        >
          📄⚠️ {extractionFailedCount} Extraktionsfehler
        </button>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Suche im Titel …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterRanking}
          onChange={(e) => setFilterRanking(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {RANKING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterFunction}
          onChange={(e) => setFilterFunction(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Funktionen</option>
          {workFunctions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="year_desc">Jahr (neu → alt)</option>
          <option value="year_asc">Jahr (alt → neu)</option>
          <option value="title_asc">Titel (A–Z)</option>
        </select>
      </div>

      {loading && <p className="text-sm text-slate-400">Lädt …</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-slate-400">Keine Quellen gefunden.</p>
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          {/* Desktop: Tabelle */}
          <table className="hidden w-full table-auto border-collapse text-sm md:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">Autor/Jahr</th>
                <th className="py-2 pr-3 font-medium">Titel</th>
                <th className="py-2 pr-3 font-medium">Venue</th>
                <th className="py-2 pr-3 font-medium">Ranking</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/bibliothek/${s.id}`)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900"
                  title={s.status === 'needs_review' ? (s.status_hint ?? undefined) : undefined}
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-700 dark:text-slate-300">
                    {formatAuthorYear(s)}
                  </td>
                  <td className="max-w-md truncate py-2 pr-3 text-slate-800 dark:text-slate-100">{s.title}</td>
                  <td className="max-w-xs truncate py-2 pr-3 text-slate-600 dark:text-slate-400">
                    {s.venue ?? '–'}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-600 dark:text-slate-400">
                    {formatRanking(s)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {STATUS_ICON[s.status]} {STATUS_LABEL[s.status]}
                    {s.extraction_status === 'extraction_failed' && (
                      <span title={s.extraction_hint ?? undefined} className="ml-1">
                        📄⚠️
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <button
                      type="button"
                      disabled={generatingId === s.id}
                      onClick={(e) => handleGenerate(s, e)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      {generatingId === s.id ? 'Erzeugt …' : 'Zitate erzeugen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobil: Karten */}
          <ul className="flex flex-col gap-3 md:hidden">
            {visible.map((s) => (
              <li
                key={s.id}
                onClick={() => navigate(`/bibliothek/${s.id}`)}
                className="cursor-pointer rounded-lg border border-slate-200 p-3 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-900"
                title={s.status === 'needs_review' ? (s.status_hint ?? undefined) : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {formatAuthorYear(s)}
                  </span>
                  <span className="shrink-0 text-sm">
                    {STATUS_ICON[s.status]} {STATUS_LABEL[s.status]}
                    {s.extraction_status === 'extraction_failed' && (
                      <span title={s.extraction_hint ?? undefined} className="ml-1">
                        📄⚠️
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{s.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {s.venue ?? '–'} · {formatRanking(s)}
                  {s.type ? ` · ${TYPE_LABEL[s.type] ?? s.type}` : ''}
                </p>
                <button
                  type="button"
                  disabled={generatingId === s.id}
                  onClick={(e) => handleGenerate(s, e)}
                  className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  {generatingId === s.id ? 'Erzeugt …' : 'Zitate erzeugen'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {generateError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">Fehler: {generateError}</p>
      )}

      {reviewResult && (
        <CitationReviewDialog
          sourceTitle={reviewResult.sourceTitle}
          candidates={reviewResult.data.results}
          errors={reviewResult.data.errors}
          discarded={reviewResult.data.discarded}
          message={reviewResult.data.message}
          onClose={() => setReviewResult(null)}
        />
      )}
    </div>
  )
}
