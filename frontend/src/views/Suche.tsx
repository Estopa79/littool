import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { runSearch, renderSnippetHtml, type SearchHit, type SearchMode } from '../lib/search'
import { formatAuthorYear, formatRanking } from '../lib/sourceFormat'

const MODE_OPTIONS: Array<{ value: SearchMode; label: string }> = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'fulltext', label: 'Nur Volltext' },
  { value: 'semantic', label: 'Semantisch' },
]

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
]

const inputClass =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

function FilterFields({
  filterType,
  setFilterType,
  filterRanking,
  setFilterRanking,
}: {
  filterType: string
  setFilterType: (v: string) => void
  filterRanking: string
  setFilterRanking: (v: string) => void
}) {
  return (
    <>
      <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={inputClass}>
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={filterRanking}
        onChange={(e) => setFilterRanking(e.target.value)}
        className={inputClass}
      >
        {RANKING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}

export function Suche() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [mode, setMode] = useState<SearchMode>('hybrid')
  const [filterType, setFilterType] = useState('')
  const [filterRanking, setFilterRanking] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runCurrentSearch(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const hits = await runSearch({
        query: q,
        mode,
        filterType: filterType || null,
        filterRankingSystem: filterRanking || null,
      })
      setResults(hits)
    } catch (err) {
      setError((err as Error).message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initial = searchParams.get('q')
    if (initial) void runCurrentSearch(initial)
    // Nur beim ersten Laden mit ?q=... aus der Schnellsuche automatisch starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void runCurrentSearch(query)
  }

  function jumpToSource(sourceId: string, page: number) {
    navigate(`/bibliothek/${sourceId}?page=${page}`)
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100">Suche</h1>

      <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
        <input
          type="search"
          placeholder="Suchbegriff oder Frage …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputClass} flex-1`}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {loading ? 'Sucht …' : 'Suchen'}
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          {MODE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="search-mode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>

        {/* Desktop: Filter inline */}
        <div className="hidden items-center gap-2 md:flex">
          <FilterFields
            filterType={filterType}
            setFilterType={setFilterType}
            filterRanking={filterRanking}
            setFilterRanking={setFilterRanking}
          />
        </div>

        {/* Mobil: Filter als Bottom-Sheet */}
        <button
          type="button"
          onClick={() => setShowMobileFilters(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 md:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Filter{filterType || filterRanking ? ' •' : ''}
        </button>
      </div>

      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 md:hidden">
          <div className="w-full rounded-t-lg bg-white p-4 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter</h2>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Fertig
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <FilterFields
                filterType={filterType}
                setFilterType={setFilterType}
                filterRanking={filterRanking}
                setFilterRanking={setFilterRanking}
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}

      {results !== null && results.length === 0 && !loading && (
        <p className="text-sm text-slate-400">Keine Treffer.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(results ?? []).map((hit) => (
          <li
            key={hit.chunk_id}
            className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {formatAuthorYear(hit)}
              </span>
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                {formatRanking(hit)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{hit.title}</p>
            <p
              className="mt-2 text-sm text-slate-600 [&_mark]:bg-amber-200 [&_mark]:text-slate-900 dark:text-slate-400 dark:[&_mark]:bg-amber-500/40 dark:[&_mark]:text-slate-100"
              dangerouslySetInnerHTML={{ __html: renderSnippetHtml(hit.snippet) }}
            />
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Seite {hit.page}</span>
              <button
                type="button"
                onClick={() => jumpToSource(hit.source_id, hit.page)}
                className="text-slate-600 hover:underline dark:text-slate-300"
              >
                Im PDF öffnen →
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
