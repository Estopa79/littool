import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadPanel } from '../components/UploadPanel'
import { EingangTab } from '../components/EingangTab'
import { MethodentabelleTab } from '../components/MethodentabelleTab'
import { GreyLiteratureDialog } from '../components/GreyLiteratureDialog'
import { deleteSource, fetchSources, type Source } from '../lib/sources'
import { formatAuthorYear, formatRanking, STATUS_ICON, STATUS_LABEL, TYPE_LABEL } from '../lib/sourceFormat'
import { fetchAllSourceFunctions, fetchWorkFunctions, type WorkFunction } from '../lib/functions'
import { generateCitations, type GenerateCitationsResult } from '../lib/citations'
import { CitationReviewDialog } from '../components/CitationReviewDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fetchAllSourceTopics, fetchAllTopics, fetchReviewCounts, type TopicOption } from '../lib/qsReview'
import { generateTopicRelevance } from '../lib/topicRelevance'
import { buildBibtexFile, downloadBibtex, fetchAllSourcesForBibtex } from '../lib/bibtex'
import { useSessionState } from '../lib/useSessionState'
import { runIngestPipelineStep, type IngestPipelineResult } from '../lib/ingestPipeline'

type SortKey = 'author_year' | 'title' | 'venue' | 'ranking' | 'status'
type SortDir = 'asc' | 'desc'

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle Typen' },
  { value: 'journal', label: 'Journal' },
  { value: 'konferenz', label: 'Konferenz' },
  { value: 'buch', label: 'Buch' },
  { value: 'grau', label: 'Graue Literatur' },
  { value: 'dissertation', label: 'Doktorarbeit/wissenschaftliche Arbeit' },
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
  const [activeTab, setActiveTab] = useSessionState<'bestand' | 'eingang' | 'methodentabelle'>(
    'littool:bibliothek:activeTab',
    'bestand',
  )
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useSessionState('littool:bibliothek:search', '')
  const [filterType, setFilterType] = useSessionState('littool:bibliothek:filterType', '')
  const [filterRanking, setFilterRanking] = useSessionState('littool:bibliothek:filterRanking', '')
  const [filterStatus, setFilterStatus] = useSessionState('littool:bibliothek:filterStatus', '')
  const [onlyExtractionIssues, setOnlyExtractionIssues] = useSessionState(
    'littool:bibliothek:onlyExtractionIssues',
    false,
  )
  const [sortKey, setSortKey] = useSessionState<SortKey>('littool:bibliothek:sortKey', 'author_year')
  const [sortDir, setSortDir] = useSessionState<SortDir>('littool:bibliothek:sortDir', 'desc')
  const [showGreyDialog, setShowGreyDialog] = useState(false)
  const [workFunctions, setWorkFunctions] = useState<WorkFunction[]>([])
  const [filterFunction, setFilterFunction] = useSessionState('littool:bibliothek:filterFunction', '')
  const [sourceIdsByFunction, setSourceIdsByFunction] = useState<Map<string, Set<string>>>(new Map())
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [filterTopic, setFilterTopic] = useSessionState('littool:bibliothek:filterTopic', '')
  const [sourceIdsByTopic, setSourceIdsByTopic] = useState<Map<string, Set<string>>>(new Map())
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [reviewResult, setReviewResult] = useState<{ sourceTitle: string; data: GenerateCitationsResult } | null>(
    null,
  )
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [exportingBibtex, setExportingBibtex] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [unconfirmedTotal, setUnconfirmedTotal] = useState(0)
  const [classifyingId, setClassifyingId] = useState<string | null>(null)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [ingestRunning, setIngestRunning] = useState(false)
  const [ingestError, setIngestError] = useState<string | null>(null)
  const [ingestSummary, setIngestSummary] = useState<IngestPipelineResult | null>(null)
  const [ingestEmbeddedTotal, setIngestEmbeddedTotal] = useState(0)
  const ingestActiveRef = useRef(true)

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
    fetchAllTopics().then(setAllTopics)
    fetchAllSourceTopics().then((rows) => {
      const map = new Map<string, Set<string>>()
      for (const row of rows) {
        if (!map.has(row.topic_id)) map.set(row.topic_id, new Set())
        map.get(row.topic_id)!.add(row.source_id)
      }
      setSourceIdsByTopic(map)
    })
    fetchReviewCounts().then((counts) => setUnconfirmedTotal(counts.reduce((sum, c) => sum + c.count, 0)))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'author_year' ? 'desc' : 'asc')
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSource(deleteTarget.id, deleteTarget.storage_path)
      setDeleteTarget(null)
      load()
    } catch (err) {
      setDeleteError((err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

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

  useEffect(() => {
    // Effect-Body setzt den Ref explizit auf true (nicht nur der useRef-Startwert!) -
    // Reacts StrictMode-Dev-Doppelinvoke (mount -> cleanup -> erneutes mount)
    // wuerde sonst den Ref dauerhaft auf false stehen lassen, obwohl die
    // Komponente tatsaechlich gemountet bleibt, und den finally-Block in
    // handleRunIngestPipeline (State-Update nur "wenn noch aktiv") fuer immer blockieren.
    ingestActiveRef.current = true
    return () => {
      ingestActiveRef.current = false
    }
  }, [])

  // Voyage-Rate-Limit-Pacing wie im lokalen Worker (embeddings.py::MIN_SECONDS_BETWEEN_REQUESTS) -
  // ein Aufruf = ein Embedding-Batch, bei verbleibenden Chunks wird nach
  // Wartezeit erneut aufgerufen. Laeuft nur, solange die Seite offen ist -
  // beim Verlassen bricht die Schleife sauber ab (kein State-Update auf
  // unmounted Component), ein erneuter Klick spaeter setzt einfach dort fort,
  // wo embedding IS NULL noch zutrifft (idempotent, kein Doppel-Aufwand).
  const EMBED_PACE_MS = 21_000

  async function handleRunIngestPipeline() {
    setIngestRunning(true)
    setIngestError(null)
    setIngestSummary(null)
    setIngestEmbeddedTotal(0)
    let remaining = Infinity
    try {
      while (remaining > 0) {
        const result = await runIngestPipelineStep()
        if (!ingestActiveRef.current) return
        setIngestSummary(result)
        setIngestEmbeddedTotal((prev) => prev + result.embed.eingebettet)
        remaining = result.embed.remaining
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, EMBED_PACE_MS))
          if (!ingestActiveRef.current) return
        }
      }
      load()
    } catch (err) {
      if (ingestActiveRef.current) setIngestError((err as Error).message)
    } finally {
      if (ingestActiveRef.current) setIngestRunning(false)
    }
  }

  async function handleExportBibtex() {
    setExportingBibtex(true)
    setExportError(null)
    try {
      const bibtexSources = await fetchAllSourcesForBibtex()
      downloadBibtex(buildBibtexFile(bibtexSources), 'littool-bestand.bib')
    } catch (err) {
      setExportError((err as Error).message)
    } finally {
      setExportingBibtex(false)
    }
  }

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

  async function handleClassify(source: Source, e: MouseEvent) {
    e.stopPropagation()
    setClassifyingId(source.id)
    setClassifyError(null)
    try {
      await generateTopicRelevance(source.id)
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, analysis_status: 'complete' } : s)))
    } catch (err) {
      setClassifyError((err as Error).message)
    } finally {
      setClassifyingId(null)
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

  // "in Verarbeitung" ist kein automatischer Hintergrund-Fortschrittsbalken,
  // sondern wartet auf den naechsten manuellen Worker-Lauf (extract-doi,
  // enrich-metadata, extract-fulltext, chunk, embed) - ohne Hinweis nicht von
  // einem haengengebliebenen Fehler zu unterscheiden. Eigener Banner statt nur
  // Tooltip auf der Statuszelle, damit der Hinweis auch am Handy sichtbar ist
  // (Tooltips feuern dort nicht zuverlaessig).
  const processingCount = useMemo(
    () => sources.filter((s) => s.status === 'processing').length,
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
    if (filterTopic) {
      const ids = sourceIdsByTopic.get(filterTopic) ?? new Set()
      result = result.filter((s) => ids.has(s.id))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((s) => s.title.toLowerCase().includes(q))
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'author_year') {
        cmp = (a.year ?? 0) - (b.year ?? 0)
        if (cmp === 0) cmp = formatAuthorYear(a).localeCompare(formatAuthorYear(b))
      } else if (sortKey === 'title') {
        cmp = a.title.localeCompare(b.title)
      } else if (sortKey === 'venue') {
        cmp = (a.venue ?? '').localeCompare(b.venue ?? '')
      } else if (sortKey === 'ranking') {
        cmp = formatRanking(a).localeCompare(formatRanking(b))
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [
    sources,
    filterType,
    filterStatus,
    filterRanking,
    filterFunction,
    sourceIdsByFunction,
    filterTopic,
    sourceIdsByTopic,
    onlyExtractionIssues,
    search,
    sortKey,
    sortDir,
  ])

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-100">
        Bibliothek <span className="text-base font-normal text-slate-400 dark:text-slate-500">({sources.length})</span>
      </h1>

      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('bestand')}
          className={`px-3 py-1.5 text-sm font-medium ${
            activeTab === 'bestand'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Bestand
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('eingang')}
          className={`px-3 py-1.5 text-sm font-medium ${
            activeTab === 'eingang'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Eingang
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('methodentabelle')}
          className={`px-3 py-1.5 text-sm font-medium ${
            activeTab === 'methodentabelle'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Methodentabelle
        </button>
      </div>

      {activeTab === 'eingang' && <EingangTab />}
      {activeTab === 'methodentabelle' && <MethodentabelleTab />}

      {activeTab === 'bestand' && (
        <>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <UploadPanel onUploaded={load} />
        <button
          type="button"
          onClick={() => setShowGreyDialog(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Graue Literatur
        </button>
        <button
          type="button"
          onClick={handleExportBibtex}
          disabled={exportingBibtex}
          title="Gesamter Bestand als .bib-Datei - macht die Literatur portabel, kein Lock-in"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {exportingBibtex ? 'Exportiert …' : '⬇ BibTeX (gesamter Bestand)'}
        </button>
      </div>
      {exportError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {exportError}</p>}

      {showGreyDialog && (
        <GreyLiteratureDialog onClose={() => setShowGreyDialog(false)} onCreated={load} />
      )}

      {processingCount > 0 && (
        <div className="mb-4 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setFilterStatus('processing')}
            className="font-medium text-slate-700 hover:underline dark:text-slate-300"
          >
            ⏳ {processingCount} in Verarbeitung – kein Fehler
          </button>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Neue Quellen brauchen zuerst einen lokalen Schritt (PDF-Text, OCR-Fallback bei Scans) - danach
            übernimmt der Button hier den Rest automatisch:
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-400">
            <li>
              Lokal ausführen (einmalig pro neuer Quelle):{' '}
              <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">littool-worker extract-doi</code>
              {', dann '}
              <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">
                littool-worker extract-fulltext
              </code>
              {', dann '}
              <code className="rounded bg-slate-200 px-1 py-0.5 dark:bg-slate-700">littool-worker chunk</code>
            </li>
            <li>Danach hier klicken - Metadaten, Ranking, Duplikat-Prüfung und Embeddings laufen automatisch.</li>
          </ol>
          <button
            type="button"
            onClick={handleRunIngestPipeline}
            disabled={ingestRunning}
            className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {ingestRunning ? '⏳ Läuft …' : '▶ Verarbeitung fortsetzen'}
          </button>
          {ingestError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Fehler: {ingestError}</p>}
          {ingestSummary && (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Metadaten: {ingestSummary.enrich.complete} vollständig, {ingestSummary.enrich.needs_review} zu prüfen
              {ingestSummary.enrich.fehler > 0 ? `, ${ingestSummary.enrich.fehler} Fehler` : ''}. Ranking:{' '}
              {ingestSummary.ranking.gefunden} gefunden. Duplikate geprüft: {ingestSummary.duplicates.geprueft} (
              {ingestSummary.duplicates.dubletten_markiert} markiert). Embeddings: {ingestEmbeddedTotal} eingebettet
              {ingestSummary.embed.remaining > 0
                ? `, ${ingestSummary.embed.remaining} verbleiben (läuft weiter) …`
                : ' (fertig).'}
            </p>
          )}
        </div>
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
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Themenfelder</option>
          {allTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-2 text-xs text-slate-400">Tabellenkopf anklicken zum Sortieren.</p>

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
                <th className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    className="select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort('author_year')}
                  >
                    Autor/Jahr{sortIndicator('author_year')}
                  </button>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    className="select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort('title')}
                  >
                    Titel{sortIndicator('title')}
                  </button>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    className="select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort('venue')}
                  >
                    Venue{sortIndicator('venue')}
                  </button>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    className="select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort('ranking')}
                  >
                    Ranking{sortIndicator('ranking')}
                  </button>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    className="select-none hover:text-slate-700 dark:hover:text-slate-200"
                    onClick={() => toggleSort('status')}
                  >
                    Status{sortIndicator('status')}
                  </button>
                </th>
                <th className="py-2 pr-3 font-medium"></th>
                <th className="py-2 pr-3 font-medium"></th>
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
                    <span
                      title={
                        s.status === 'processing'
                          ? 'Wartet auf den nächsten manuellen Worker-Lauf - kein Fehler, kann eine Weile dauern.'
                          : undefined
                      }
                    >
                      {STATUS_ICON[s.status]} {STATUS_LABEL[s.status]}
                    </span>
                    {s.extraction_status === 'extraction_failed' && (
                      <span title={s.extraction_hint ?? undefined} className="ml-1">
                        📄⚠️
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {s.analysis_status === 'complete' ? (
                      <span
                        className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                        title="Themen und Relevanz je Forschungsfrage wurden von der KI eingeschätzt"
                      >
                        🤖 eingeordnet
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={classifyingId === s.id}
                        onClick={(e) => handleClassify(s, e)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        {classifyingId === s.id ? 'Ordnet ein …' : 'KI-Einordnung'}
                      </button>
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
                  <td className="whitespace-nowrap py-2 pr-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(s)
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-800 dark:hover:text-red-400"
                      aria-label="Quelle löschen"
                    >
                      🗑
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
                    <span
                      title={
                        s.status === 'processing'
                          ? 'Wartet auf den nächsten manuellen Worker-Lauf - kein Fehler, kann eine Weile dauern.'
                          : undefined
                      }
                    >
                      {STATUS_ICON[s.status]} {STATUS_LABEL[s.status]}
                    </span>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.analysis_status === 'complete' ? (
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                      🤖 eingeordnet
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={classifyingId === s.id}
                      onClick={(e) => handleClassify(s, e)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      {classifyingId === s.id ? 'Ordnet ein …' : 'KI-Einordnung'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={generatingId === s.id}
                    onClick={(e) => handleGenerate(s, e)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {generatingId === s.id ? 'Erzeugt …' : 'Zitate erzeugen'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(s)
                    }}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-800 dark:hover:text-red-400"
                    aria-label="Quelle löschen"
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {generateError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">Fehler: {generateError}</p>
      )}
      {classifyError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">Fehler: {classifyError}</p>
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

      {deleteTarget && (
        <ConfirmDialog
          title="Quelle löschen"
          message={`"${deleteTarget.title}" wirklich löschen? Das entfernt auch alle Zitate, Bewertungen und das PDF dieser Quelle unwiderruflich.`}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {deleteError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Fehler: {deleteError}</p>}
        </>
      )}
    </div>
  )
}
