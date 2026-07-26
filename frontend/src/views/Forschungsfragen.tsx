import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAuthorYear } from '../lib/sourceFormat'
import { fetchAllTopics, type TopicOption } from '../lib/qsReview'
import { fetchWorkFunctions, type WorkFunction } from '../lib/functions'
import {
  fetchConfirmedPassagesForRq,
  fetchRqWithCounts,
  STUDY_TYPE_LABEL,
  type FfPassage,
  type RqWithCount,
} from '../lib/ffView'
import { RelevanceMatrix } from '../components/RelevanceMatrix'

type SortOption = 'relevance' | 'source' | 'year'

const STUDY_TYPE_OPTIONS = Object.entries(STUDY_TYPE_LABEL) as Array<[string, string]>

function RelevanceStars({ value }: { value: number }) {
  return (
    <span className="text-amber-500" title={`Relevanz ${value}/3`}>
      {'★'.repeat(value)}
      {'☆'.repeat(3 - value)}
    </span>
  )
}

function PassageCard({ passage }: { passage: FfPassage }) {
  const [expanded, setExpanded] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(passage.citation)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 1500)
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {formatAuthorYear(passage)}, S. {passage.page}
        </span>
        <RelevanceStars value={passage.relevance} />
      </div>
      <div className="mb-2 flex flex-wrap gap-1 text-xs text-slate-500 dark:text-slate-400">
        {passage.ranking_system && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
            {passage.ranking_system} {passage.ranking_value}
          </span>
        )}
        {passage.study_type && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
            {STUDY_TYPE_LABEL[passage.study_type]}
          </span>
        )}
        {passage.topics.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
            {t}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left italic text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {expanded ? `„${passage.original}"` : `„${passage.original.slice(0, 90)}${passage.original.length > 90 ? ' …' : ''}"`}
      </button>
      {passage.translation && <p className="mt-1 text-slate-600 dark:text-slate-400">DE: {passage.translation}</p>}

      <div className="mt-2 flex items-center gap-3 text-xs">
        <span className="text-slate-500 dark:text-slate-500">{passage.citation}</span>
        <button type="button" onClick={copyCitation} className="text-slate-500 hover:underline dark:text-slate-400">
          {copyState === 'copied' ? '✓ kopiert' : copyState === 'error' ? '✗ fehlgeschlagen' : 'Zitation kopieren'}
        </button>
        <Link
          to={`/bibliothek/${passage.source_id}?page=${passage.page}`}
          className="text-slate-500 hover:underline dark:text-slate-400"
        >
          📄 PDF
        </Link>
        <span className="text-slate-300 dark:text-slate-700" title="Schreibwerkstatt-Diskussion – kommt in Phase 5">
          💬
        </span>
      </div>
    </li>
  )
}

export function Forschungsfragen() {
  const [mode, setMode] = useState<'liste' | 'matrix'>('liste')
  const [rqs, setRqs] = useState<RqWithCount[]>([])
  const [selectedRqId, setSelectedRqId] = useState<string | null>(null)
  const [passages, setPassages] = useState<FfPassage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingPassages, setLoadingPassages] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [workFunctions, setWorkFunctions] = useState<WorkFunction[]>([])
  const [sortBy, setSortBy] = useState<SortOption>('relevance')
  const [filterTopic, setFilterTopic] = useState('')
  const [filterRanking, setFilterRanking] = useState('')
  const [filterStudyType, setFilterStudyType] = useState('')
  const [filterFunction, setFilterFunction] = useState('')

  useEffect(() => {
    fetchRqWithCounts()
      .then((rows) => {
        setRqs(rows)
        if (rows.length > 0) setSelectedRqId(rows[0].id)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingList(false))
    fetchAllTopics().then(setAllTopics)
    fetchWorkFunctions().then(setWorkFunctions)
  }, [])

  useEffect(() => {
    if (!selectedRqId) return
    setLoadingPassages(true)
    fetchConfirmedPassagesForRq(selectedRqId)
      .then(setPassages)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingPassages(false))
  }, [selectedRqId])

  const selectedRq = rqs.find((r) => r.id === selectedRqId) ?? null

  const visible = useMemo(() => {
    let result = passages
    if (filterTopic) result = result.filter((p) => p.topics.includes(filterTopic))
    if (filterRanking === 'kein Ranking') result = result.filter((p) => !p.ranking_system)
    else if (filterRanking) result = result.filter((p) => p.ranking_system === filterRanking)
    if (filterStudyType) result = result.filter((p) => p.study_type === filterStudyType)
    if (filterFunction) result = result.filter((p) => p.function_name === filterFunction)

    result = [...result].sort((a, b) => {
      if (sortBy === 'relevance') return b.relevance - a.relevance
      if (sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0)
      return formatAuthorYear(a).localeCompare(formatAuthorYear(b))
    })
    return result
  }, [passages, filterTopic, filterRanking, filterStudyType, filterFunction, sortBy])

  if (mode === 'matrix') {
    return (
      <div>
        <div className="flex items-center justify-between p-4 pb-0 sm:p-6 sm:pb-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Relevanz-Matrix</h1>
          <button
            type="button"
            onClick={() => setMode('liste')}
            className="text-sm text-slate-500 hover:underline dark:text-slate-400"
          >
            ← Zur FF-Ansicht
          </button>
        </div>
        <RelevanceMatrix />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside
        className={`shrink-0 border-slate-200 p-4 dark:border-slate-800 md:w-56 md:border-r ${
          selectedRqId ? 'hidden md:block' : 'block'
        }`}
      >
        <h1 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Forschungsfragen</h1>
        {loadingList && <p className="text-sm text-slate-400">Lädt …</p>}
        <ul className="flex flex-col gap-1">
          {rqs.map((rq) => (
            <li key={rq.id}>
              <button
                type="button"
                onClick={() => setSelectedRqId(rq.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                  rq.id === selectedRqId
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span>{rq.code}</span>
                <span className="text-xs opacity-70">●{rq.count}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setMode('matrix')}
          className="mt-4 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          📊 Matrix
        </button>
      </aside>

      <section className={`flex-1 p-4 sm:p-6 ${selectedRqId ? 'block' : 'hidden md:block'}`}>
        <button
          type="button"
          onClick={() => setSelectedRqId(null)}
          className="mb-2 text-sm text-slate-500 hover:underline dark:text-slate-400 md:hidden"
        >
          ← Zur FF-Liste
        </button>

        {selectedRq && (
          <h2 className="mb-3 text-base font-medium text-slate-800 dark:text-slate-100">
            {selectedRq.code}: {selectedRq.question}
          </h2>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Alle Themen</option>
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
            {STUDY_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
              <option key={f.id} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="relevance">Relevanz</option>
            <option value="source">Quelle</option>
            <option value="year">Jahr</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}
        {loadingPassages && <p className="text-sm text-slate-400">Lädt …</p>}

        {!loadingPassages && visible.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Noch keine bestätigten Zitate für diese Forschungsfrage.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {visible.map((p) => (
            <PassageCard key={p.id} passage={p} />
          ))}
        </ul>
      </section>
    </div>
  )
}
