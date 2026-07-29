import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteSource, fetchSource, getSignedPdfUrl, updateSource, type Author, type SourceDetail } from '../lib/sources'
import { STATUS_ICON, STATUS_LABEL, TYPE_LABEL } from '../lib/sourceFormat'
import {
  fetchSourceFunctions,
  fetchWorkFunctions,
  setSourceFunction,
  type WorkFunction,
} from '../lib/functions'
import {
  addTopic,
  fetchAllTopics,
  fetchSourceRelevance,
  fetchSourceTopics,
  removeTopic,
  saveRelevance,
  type ReviewRelevance,
  type ReviewTopic,
  type TopicOption,
} from '../lib/qsReview'
import { generateTopicRelevance } from '../lib/topicRelevance'
import { fetchResearchQuestions, type ResearchQuestion } from '../lib/settings'
import {
  addManualCitation,
  fetchPassagesForSource,
  generateCitations,
  type GenerateCitationsResult,
  type Passage,
} from '../lib/citations'
import { CitationReviewDialog } from '../components/CitationReviewDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  confirmMethodProfile,
  fetchMethodProfile,
  STUDY_TYPE_LABEL,
  type MethodProfile,
} from '../lib/methodProfiles'
import { generateParaphrase } from '../lib/paraphrase'
import { fetchCrossrefMetadata } from '../lib/crossref'
import { UsedCitationCheckbox } from '../components/UsedCitationCheckbox'
import { CitationCopyButtons } from '../components/CitationCopyButtons'
import { fetchPassageTagsForPassages, togglePassageFunction, togglePassageTopic } from '../lib/passageTags'

type FormState = {
  type: string
  title: string
  authors: Author[]
  year: string
  venue: string
  volume: string
  issue: string
  pages: string
  page_offset: string
  issn: string
  doi: string
  abstract: string
  citation_count: string
  url: string
  ranking_system: string
  ranking_value: string
}

function toForm(s: SourceDetail): FormState {
  return {
    type: s.type ?? '',
    title: s.title,
    authors: s.authors && s.authors.length > 0 ? s.authors : [{ given: '', family: '' }],
    year: s.year?.toString() ?? '',
    venue: s.venue ?? '',
    volume: s.volume ?? '',
    issue: s.issue ?? '',
    pages: s.pages ?? '',
    page_offset: s.page_offset?.toString() ?? '0',
    issn: s.issn ?? '',
    doi: s.doi ?? '',
    abstract: s.abstract ?? '',
    citation_count: s.citation_count?.toString() ?? '',
    url: s.url ?? '',
    ranking_system: s.ranking_system ?? '',
    ranking_value: s.ranking_value ?? '',
  }
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

export function QuellenDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialPage = Number(searchParams.get('page')) || 1
  const [source, setSource] = useState<SourceDetail | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pageInput, setPageInput] = useState(String(initialPage))
  const [pageJump, setPageJump] = useState(initialPage)
  const [workFunctions, setWorkFunctions] = useState<WorkFunction[]>([])
  const [activeFunctionIds, setActiveFunctionIds] = useState<Set<string>>(new Set())
  const [researchQuestions, setResearchQuestions] = useState<ResearchQuestion[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [reviewResult, setReviewResult] = useState<GenerateCitationsResult | null>(null)
  const [manualRqId, setManualRqId] = useState('')
  const [manualPage, setManualPage] = useState('')
  const [manualOriginal, setManualOriginal] = useState('')
  const [manualTranslation, setManualTranslation] = useState('')
  const [manualRelevance, setManualRelevance] = useState('2')
  const [manualParaphrase, setManualParaphrase] = useState('')
  const [manualParaphrasing, setManualParaphrasing] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [methodProfile, setMethodProfile] = useState<MethodProfile | null>(null)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [sourceTopics, setSourceTopics] = useState<ReviewTopic[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichNote, setEnrichNote] = useState<string | null>(null)
  const [relevanceOpen, setRelevanceOpen] = useState(false)
  const [sourceRelevance, setSourceRelevance] = useState<ReviewRelevance[]>([])
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [passageTopicsByPassage, setPassageTopicsByPassage] = useState<Map<string, Set<string>>>(new Map())
  const [passageFunctionsByPassage, setPassageFunctionsByPassage] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetchSource(id)
      .then((s) => {
        setSource(s)
        setForm(toForm(s))
        if (s.storage_path) {
          getSignedPdfUrl(s.storage_path)
            .then(setPdfUrl)
            .catch((e: Error) => setError(e.message))
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))

    fetchWorkFunctions().then(setWorkFunctions)
    fetchSourceFunctions(id).then((rows) => setActiveFunctionIds(new Set(rows.map((r) => r.function_id))))
    fetchResearchQuestions().then((rows) => {
      setResearchQuestions(rows)
      setManualRqId((prev) => prev || rows[0]?.id || '')
    })
    fetchPassagesForSource(id).then(setPassages)
    fetchMethodProfile(id).then(setMethodProfile)
    fetchAllTopics().then(setAllTopics)
    fetchSourceTopics(id).then(setSourceTopics)
    fetchSourceRelevance(id).then(setSourceRelevance)
  }, [id])

  async function handleConfirmMethodProfile() {
    if (!id) return
    await confirmMethodProfile(id)
    setMethodProfile((prev) => (prev ? { ...prev, confirmed: true } : prev))
  }

  const activeTopicIds = new Set(sourceTopics.map((t) => t.topic_id))

  async function handleClassify() {
    if (!id) return
    setClassifying(true)
    setClassifyError(null)
    try {
      await generateTopicRelevance(id)
      const [refreshedSource, refreshedTopics, refreshedRelevance] = await Promise.all([
        fetchSource(id),
        fetchSourceTopics(id),
        fetchSourceRelevance(id),
      ])
      setSource(refreshedSource)
      setSourceTopics(refreshedTopics)
      setSourceRelevance(refreshedRelevance)
      setRelevanceOpen(true)
    } catch (err) {
      setClassifyError((err as Error).message)
    } finally {
      setClassifying(false)
    }
  }

  async function handleSaveRelevance(rqId: string, value: number) {
    if (!id) return
    await saveRelevance(id, rqId, value)
    setSourceRelevance((prev) =>
      prev.map((r) => (r.research_question_id === rqId ? { ...r, relevance: value, confirmed: true } : r)),
    )
  }

  async function toggleTopic(topicId: string) {
    if (!id) return
    if (activeTopicIds.has(topicId)) {
      await removeTopic(id, topicId)
      setSourceTopics((prev) => prev.filter((t) => t.topic_id !== topicId))
    } else {
      await addTopic(id, topicId)
      const topic = allTopics.find((t) => t.id === topicId)
      if (topic) {
        setSourceTopics((prev) => [
          ...prev,
          { source_id: id, topic_id: topicId, topic_name: topic.name, confirmed: true },
        ])
      }
    }
  }

  async function handleDelete() {
    if (!id || !source) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSource(id, source.storage_path)
      navigate('/bibliothek')
    } catch (err) {
      setDeleteError((err as Error).message)
      setDeleting(false)
    }
  }

  function reloadPassages() {
    if (id) fetchPassagesForSource(id).then(setPassages)
  }

  // Themenfeld-/Funktion-Chips je Textabschnitt (Autorenwunsch): laedt neu,
  // sobald sich die Passagenliste aendert (neues Zitat, Bestaetigung, ...),
  // getrennt vom Laden der Passagen selbst, damit jeder Aufrufer von
  // setPassages (Initial-Load, reloadPassages) automatisch profitiert.
  useEffect(() => {
    const confirmedIds = passages.filter((p) => p.confirmed).map((p) => p.id)
    fetchPassageTagsForPassages(confirmedIds).then(({ topicsByPassage, functionsByPassage }) => {
      setPassageTopicsByPassage(topicsByPassage)
      setPassageFunctionsByPassage(functionsByPassage)
    })
  }, [passages])

  async function handleTogglePassageTopic(passageId: string, topicId: string) {
    const linked = passageTopicsByPassage.get(passageId)?.has(topicId) ?? false
    await togglePassageTopic(passageId, topicId, linked)
    setPassageTopicsByPassage((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(passageId) ?? [])
      if (linked) set.delete(topicId)
      else set.add(topicId)
      next.set(passageId, set)
      return next
    })
  }

  async function handleTogglePassageFunction(passageId: string, functionId: string) {
    const linked = passageFunctionsByPassage.get(passageId)?.has(functionId) ?? false
    await togglePassageFunction(passageId, functionId, linked)
    setPassageFunctionsByPassage((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(passageId) ?? [])
      if (linked) set.delete(functionId)
      else set.add(functionId)
      next.set(passageId, set)
      return next
    })
  }

  async function handleGenerate() {
    if (!id || !source) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const data = await generateCitations(id)
      setReviewResult(data)
    } catch (err) {
      setGenerateError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id || !source) return
    const page = parseInt(manualPage, 10)
    if (!manualRqId || Number.isNaN(page) || page <= 0 || !manualOriginal.trim()) {
      setManualError('Forschungsfrage, Seite und Originaltext sind Pflicht.')
      return
    }
    setManualSaving(true)
    setManualError(null)
    try {
      await addManualCitation({
        sourceId: id,
        researchQuestionId: manualRqId,
        page,
        original: manualOriginal.trim(),
        translation: manualTranslation.trim() || null,
        paraphrase: manualParaphrase.trim() || null,
        relevance: Number(manualRelevance),
        authors: source.authors,
        year: source.year,
        pageOffset: source.page_offset,
      })
      setManualPage('')
      setManualOriginal('')
      setManualTranslation('')
      setManualParaphrase('')
      reloadPassages()
    } catch (err) {
      setManualError((err as Error).message)
    } finally {
      setManualSaving(false)
    }
  }

  async function toggleFunction(functionId: string) {
    if (!id) return
    const enabled = !activeFunctionIds.has(functionId)
    setActiveFunctionIds((prev) => {
      const next = new Set(prev)
      if (enabled) next.add(functionId)
      else next.delete(functionId)
      return next
    })
    await setSourceFunction(id, functionId, enabled)
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  function updateAuthor(index: number, key: keyof Author, value: string) {
    setForm((prev) => {
      if (!prev) return prev
      const authors = prev.authors.map((a, i) => (i === index ? { ...a, [key]: value } : a))
      return { ...prev, authors }
    })
    setSaved(false)
  }

  function addAuthor() {
    setForm((prev) => (prev ? { ...prev, authors: [...prev.authors, { given: '', family: '' }] } : prev))
  }

  function removeAuthor(index: number) {
    setForm((prev) => {
      if (!prev) return prev
      const authors = prev.authors.filter((_, i) => i !== index)
      return { ...prev, authors: authors.length > 0 ? authors : [{ given: '', family: '' }] }
    })
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id || !form) return
    setSaving(true)
    setError(null)
    setEnrichNote(null)
    try {
      let working = form
      const doiChanged = form.doi.trim() && form.doi.trim() !== (source?.doi ?? '')
      if (doiChanged) {
        setEnriching(true)
        try {
          const crossref = await fetchCrossrefMetadata(form.doi.trim())
          if (crossref) {
            const hasAuthors = working.authors.some((a) => a.given.trim() || a.family.trim())
            working = {
              ...working,
              title: working.title.trim() ? working.title : crossref.title ?? working.title,
              authors: hasAuthors && crossref.authors ? working.authors : crossref.authors ?? working.authors,
              year: working.year.trim() ? working.year : crossref.year?.toString() ?? working.year,
              venue: working.venue.trim() ? working.venue : crossref.venue ?? working.venue,
              volume: working.volume.trim() ? working.volume : crossref.volume ?? working.volume,
              issue: working.issue.trim() ? working.issue : crossref.issue ?? working.issue,
              pages: working.pages.trim() ? working.pages : crossref.pages ?? working.pages,
              issn: working.issn.trim() ? working.issn : crossref.issn ?? working.issn,
              type: working.type.trim() ? working.type : crossref.type ?? working.type,
            }
            setForm(working)
            setEnrichNote('Fehlende Felder aus Crossref ergänzt.')
          } else {
            setEnrichNote('Crossref: keine Daten zu dieser DOI gefunden.')
          }
        } catch (enrichErr) {
          setEnrichNote(`Crossref-Abfrage fehlgeschlagen: ${(enrichErr as Error).message}`)
        } finally {
          setEnriching(false)
        }
      }

      const cleanedAuthors = working.authors.filter((a) => a.given.trim() || a.family.trim())

      // Ranking gilt als handisch korrigiert (Paket F), sobald Autor eines der
      // beiden Ranking-Felder gegenueber dem geladenen Stand tatsaechlich
      // aendert - nur dann darf eine spaetere Venue-Aenderung dieses Ranking
      // nicht mehr automatisch zuruecksetzen (Trigger, Migration 0039).
      // Unveraendert mitgesendete Ranking-Werte loesen ranking_manual bewusst
      // nicht aus, sonst wuerde jedes Speichern (auch nur Venue-Tippfehler-
      // Korrekturen) das Ranking faelschlich als "manuell" einfrieren.
      const rankingTouched =
        working.ranking_system !== (source?.ranking_system ?? '') ||
        working.ranking_value !== (source?.ranking_value ?? '')

      await updateSource(id, {
        type: working.type || null,
        title: working.title,
        authors: cleanedAuthors.length > 0 ? cleanedAuthors : null,
        year: working.year ? Number(working.year) : null,
        venue: working.venue || null,
        volume: working.volume || null,
        issue: working.issue || null,
        pages: working.pages || null,
        page_offset: working.page_offset ? Number(working.page_offset) : 0,
        issn: working.issn || null,
        doi: working.doi || null,
        abstract: working.abstract || null,
        citation_count: working.citation_count ? Number(working.citation_count) : null,
        url: working.url || null,
        ranking_system: working.ranking_system || null,
        ranking_value: working.ranking_value || null,
        ...(rankingTouched ? { ranking_manual: true } : {}),
        status: 'complete',
        status_hint: null,
      })
      const refreshed = await fetchSource(id)
      setSource(refreshed)
      setForm(toForm(refreshed))
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleManualParaphrase() {
    if (!id || !manualOriginal.trim()) return
    setManualParaphrasing(true)
    try {
      const text = await generateParaphrase({ text: manualOriginal.trim(), sourceId: id })
      setManualParaphrase(text)
    } catch (err) {
      setManualError((err as Error).message)
    } finally {
      setManualParaphrasing(false)
    }
  }

  function jumpToPage() {
    const n = parseInt(pageInput, 10)
    if (!Number.isNaN(n) && n > 0) setPageJump(n)
  }

  function jumpToSpecificPage(page: number) {
    setPageInput(String(page))
    setPageJump(page)
  }

  const rqCode = (rqId: string) => researchQuestions.find((r) => r.id === rqId)?.code ?? '?'

  if (loading) return <div className="p-6 text-sm text-slate-400">Lädt …</div>
  if (error && !form) {
    return <div className="p-6 text-sm text-red-600 dark:text-red-400">Fehler: {error}</div>
  }
  if (!source || !form) return null

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/bibliothek" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          ← Zurück zur Bibliothek
        </Link>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-800 dark:hover:text-red-400"
        >
          🗑 Quelle löschen
        </button>
      </div>

      <div className="mb-4 mt-2 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{source.title}</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {STATUS_ICON[source.status]} {STATUS_LABEL[source.status]}
        </span>
        {source.analysis_status === 'complete' && (
          <span
            className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
            title="Themen und Relevanz je Forschungsfrage wurden von der KI eingeschätzt"
          >
            🤖 KI-eingeordnet
          </span>
        )}
        {source.analysis_status === 'failed' && (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            title={source.analysis_hint ?? undefined}
          >
            ⚠️ KI-Einordnung fehlgeschlagen
          </span>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Funktion:</span>
        {workFunctions.map((f) => {
          const active = activeFunctionIds.has(f.id)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFunction(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {f.name}
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Themenfelder:</span>
        {allTopics.map((t) => {
          const active = activeTopicIds.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTopic(t.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {t.name}
            </button>
          )
        })}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setRelevanceOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          <span>
            {relevanceOpen ? '▾' : '▸'} Themen &amp; Relevanz je Forschungsfrage {relevanceOpen ? 'verbergen' : 'anzeigen'}
          </span>
          <span className="text-xs font-normal text-slate-400">
            {source.analysis_status === 'complete' ? '🤖 KI-eingeordnet' : 'noch nicht eingeordnet'}
          </span>
        </button>

        {relevanceOpen && (
          <div className="border-t border-slate-100 p-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ordnet die Quelle Themenfeldern zu und schätzt je Forschungsfrage ein, wie relevant sie ist (0 = nicht,
                3 = zentral) - samt Ein-Satz-Begründung. Läuft nur, wenn du es hier anstößt, nicht automatisch beim
                Hochladen. Werte lassen sich unten auch von Hand ändern.
              </p>
              <button
                type="button"
                disabled={classifying}
                onClick={handleClassify}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {classifying ? 'Ordnet ein …' : source.analysis_status === 'complete' ? 'Neu einordnen' : 'KI-Einordnung starten'}
              </button>
            </div>
            {classifyError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {classifyError}</p>}

            {sourceRelevance.length === 0 ? (
              <p className="text-sm text-slate-400">Noch keine Relevanz-Einschätzung vorhanden.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sourceRelevance.map((r) => (
                  <li key={r.research_question_id} className="rounded-md border border-slate-100 p-2 text-sm dark:border-slate-800">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {r.rq_code}
                      </span>
                      <div className="flex items-center gap-2">
                        {r.confirmed && <span className="text-xs text-green-600 dark:text-green-400">✔️ bestätigt</span>}
                        <select
                          value={r.relevance}
                          onChange={(e) => handleSaveRelevance(r.research_question_id, Number(e.target.value))}
                          className="rounded-md border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value={0}>0 – nicht relevant</option>
                          <option value={1}>1 – am Rande</option>
                          <option value={2}>2 – relevant</option>
                          <option value={3}>3 – zentral</option>
                        </select>
                      </div>
                    </div>
                    {r.reasoning && (
                      <p className="text-slate-600 dark:text-slate-400">
                        <span className="font-medium">KI-Einschätzung:</span> {r.reasoning}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setMetadataOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          <span>{metadataOpen ? '▾' : '▸'} Metadaten {metadataOpen ? 'verbergen' : 'anzeigen/bearbeiten'}</span>
          <span className="text-xs font-normal text-slate-400">
            {form.authors[0]?.family || '–'} {form.year || ''} · {TYPE_LABEL[form.type] ?? (form.type || 'Typ unbekannt')}
          </span>
        </button>

        {metadataOpen && (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 border-t border-slate-100 p-4 dark:border-slate-800"
          >
            <Field label="Typ">
              <select value={form.type} onChange={(e) => updateField('type', e.target.value)} className={inputClass}>
                <option value="">– unbekannt –</option>
                <option value="journal">Journal</option>
                <option value="konferenz">Konferenz</option>
                <option value="buch">Buch</option>
                <option value="grau">Graue Literatur</option>
                <option value="dissertation">Doktorarbeit/wissenschaftliche Arbeit</option>
              </select>
            </Field>

            <Field label="Titel">
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                className={inputClass}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Autoren</span>
              {form.authors.map((author, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Vorname"
                    value={author.given}
                    onChange={(e) => updateAuthor(i, 'given', e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    type="text"
                    placeholder="Nachname"
                    value={author.family}
                    onChange={(e) => updateAuthor(i, 'family', e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeAuthor(i)}
                    className="shrink-0 text-sm text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    aria-label="Autor entfernen"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addAuthor}
                className="self-start text-sm text-slate-500 hover:underline dark:text-slate-400"
              >
                + Autor hinzufügen
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Jahr">
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => updateField('year', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Venue">
                <input
                  type="text"
                  value={form.venue}
                  onChange={(e) => updateField('venue', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Band">
                <input
                  type="text"
                  value={form.volume}
                  onChange={(e) => updateField('volume', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Heft">
                <input
                  type="text"
                  value={form.issue}
                  onChange={(e) => updateField('issue', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Seiten">
                <input
                  type="text"
                  value={form.pages}
                  onChange={(e) => updateField('pages', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Seiten-Offset (PDF-Seite → Zitationsseite)">
                <input
                  type="number"
                  value={form.page_offset}
                  onChange={(e) => updateField('page_offset', e.target.value)}
                  className={inputClass}
                />
                <span className="text-xs text-slate-400">
                  PDF-Seite 1 = zitiert als S. {1 + (Number(form.page_offset) || 0)}
                </span>
              </Field>
              <Field label="ISSN">
                <input
                  type="text"
                  value={form.issn}
                  onChange={(e) => updateField('issn', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="DOI">
                <input
                  type="text"
                  value={form.doi}
                  onChange={(e) => updateField('doi', e.target.value)}
                  className={inputClass}
                />
                <span className="text-xs text-slate-400">
                  Beim Speichern werden fehlende Felder automatisch aus Crossref ergänzt.
                </span>
              </Field>
              <Field label="Zitationszahl">
                <input
                  type="number"
                  value={form.citation_count}
                  onChange={(e) => updateField('citation_count', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="URL (v. a. graue Literatur)">
              <input
                type="text"
                value={form.url}
                onChange={(e) => updateField('url', e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Abstract">
              <textarea
                value={form.abstract}
                onChange={(e) => updateField('abstract', e.target.value)}
                rows={5}
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Ranking-Herkunft">
                <select
                  value={form.ranking_system}
                  onChange={(e) => updateField('ranking_system', e.target.value)}
                  className={inputClass}
                >
                  <option value="">– kein Ranking –</option>
                  <option value="VHB">VHB</option>
                  <option value="SJR">SJR</option>
                  <option value="CORE">CORE</option>
                </select>
              </Field>
              <Field label="Ranking-Wert">
                <input
                  type="text"
                  placeholder="z. B. A, Q1"
                  value={form.ranking_value}
                  onChange={(e) => updateField('ranking_value', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {saving ? (enriching ? 'Crossref wird abgefragt …' : 'Speichert …') : 'Speichern (setzt Status auf vollständig)'}
              </button>
              {saved && <span className="text-sm text-green-600 dark:text-green-400">Gespeichert.</span>}
            </div>
            {enrichNote && <p className="text-sm text-slate-500 dark:text-slate-400">{enrichNote}</p>}
            {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}
          </form>
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">PDF</h2>
        {source.extraction_status === 'extraction_failed' && (
          <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <p className="font-medium">📄⚠️ Volltext nicht nutzbar</p>
            {source.extraction_hint && <p className="mt-1">{source.extraction_hint}</p>}
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">
              Diese Quelle ist nicht durchsuchbar und liefert keine belegbaren Zitate. Datei ggf. ersetzen.
            </p>
          </div>
        )}
        {source.storage_path && pdfUrl ? (
          <>
            <div className="mb-2 flex items-center gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-400" htmlFor="page-jump">
                Seite
              </label>
              <input
                id="page-jump"
                type="number"
                min={1}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                className={`${inputClass} w-20`}
              />
              <button
                type="button"
                onClick={jumpToPage}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Springen
              </button>
            </div>
            <iframe
              key={pageJump}
              src={`${pdfUrl}#page=${pageJump}`}
              title="PDF-Viewer"
              className="h-[85vh] w-full rounded-md border border-slate-200 dark:border-slate-800"
            />
          </>
        ) : (
          <p className="text-sm text-slate-400">Kein PDF hinterlegt.</p>
        )}
      </div>

      {methodProfile && (
        <div className="mb-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Methodenprofil</h2>
            {methodProfile.confirmed ? (
              <span className="text-xs text-green-600 dark:text-green-400">✔️ Bestätigt</span>
            ) : (
              <button
                type="button"
                onClick={handleConfirmMethodProfile}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Bestätigen
              </button>
            )}
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-medium">{STUDY_TYPE_LABEL[methodProfile.study_type]}</span>
            {methodProfile.method && <> · {methodProfile.method}</>}
          </p>
          {methodProfile.data_basis && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Datengrundlage: {methodProfile.data_basis}</p>
          )}
          {methodProfile.analysis_method && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Auswertung: {methodProfile.analysis_method}
            </p>
          )}
          {methodProfile.page_hint && (
            <button
              type="button"
              onClick={() => jumpToSpecificPage(methodProfile.page_hint!)}
              className="mt-1 text-xs text-slate-500 hover:underline dark:text-slate-400"
            >
              Methodenteil: PDF S. {methodProfile.page_hint} →
            </button>
          )}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Zitate</h2>
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {generating ? 'Erzeugt …' : 'Zitate erzeugen'}
          </button>
        </div>
        {generateError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {generateError}</p>}

        {passages.filter((p) => p.confirmed).length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine bestätigten Zitate.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passages
              .filter((p) => p.confirmed)
              .map((p) => (
                <li key={p.id} className="rounded-md border border-slate-100 p-2 text-sm dark:border-slate-800">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {rqCode(p.research_question_id)}
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpToSpecificPage(p.page)}
                      className="text-xs text-slate-500 hover:underline dark:text-slate-400"
                    >
                      PDF S. {p.page} →
                    </button>
                  </div>
                  <p className="italic text-slate-700 dark:text-slate-300">„{p.original}"</p>
                  {p.translation && <p className="mt-1 text-slate-600 dark:text-slate-400">{p.translation}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-slate-500 dark:text-slate-500">{p.citation}</span>
                    <CitationCopyButtons
                      original={p.original}
                      translation={p.translation}
                      paraphrase={p.paraphrase}
                      citation={p.citation}
                    />
                    <UsedCitationCheckbox passageId={p.id} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {allTopics.map((t) => {
                      const active = passageTopicsByPassage.get(p.id)?.has(t.id) ?? false
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleTogglePassageTopic(p.id, t.id)}
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            active
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                          }`}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {workFunctions.map((f) => {
                      const active = passageFunctionsByPassage.get(p.id)?.has(f.id) ?? false
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleTogglePassageFunction(p.id, f.id)}
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            active
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                          }`}
                        >
                          {f.name}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
          </ul>
        )}

        <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Zitat manuell hinzufügen (Text im PDF markieren, kopieren, hier einfügen)
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select value={manualRqId} onChange={(e) => setManualRqId(e.target.value)} className={inputClass}>
              {researchQuestions.map((rq) => (
                <option key={rq.id} value={rq.id}>
                  {rq.code}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="Seite"
              value={manualPage}
              onChange={(e) => setManualPage(e.target.value)}
              className={inputClass}
            />
            <select value={manualRelevance} onChange={(e) => setManualRelevance(e.target.value)} className={inputClass}>
              <option value="1">Relevanz 1</option>
              <option value="2">Relevanz 2</option>
              <option value="3">Relevanz 3</option>
            </select>
          </div>
          <textarea
            placeholder="Originaltext (wörtlich)"
            value={manualOriginal}
            onChange={(e) => setManualOriginal(e.target.value)}
            rows={2}
            className={inputClass}
          />
          <textarea
            placeholder="Übersetzung (optional)"
            value={manualTranslation}
            onChange={(e) => setManualTranslation(e.target.value)}
            rows={2}
            className={inputClass}
          />
          <div className="flex items-start gap-2">
            <textarea
              placeholder="Paraphrase (optional)"
              value={manualParaphrase}
              onChange={(e) => setManualParaphrase(e.target.value)}
              rows={2}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              disabled={manualParaphrasing || !manualOriginal.trim()}
              onClick={handleManualParaphrase}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Paraphrase aus dem Originaltext erzeugen"
            >
              {manualParaphrasing ? '¶ …' : '¶ erzeugen'}
            </button>
          </div>
          {manualError && <p className="text-sm text-red-600 dark:text-red-400">{manualError}</p>}
          <button
            type="submit"
            disabled={manualSaving}
            className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {manualSaving ? 'Speichert …' : '+ Zitat hinzufügen'}
          </button>
        </form>
      </div>

      {reviewResult && (
        <CitationReviewDialog
          sourceTitle={source.title}
          candidates={reviewResult.results}
          errors={reviewResult.errors}
          discarded={reviewResult.discarded}
          message={reviewResult.message}
          onClose={() => setReviewResult(null)}
          onPageJump={jumpToSpecificPage}
          onChange={reloadPassages}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Quelle löschen"
          message={`"${source.title}" wirklich löschen? Das entfernt auch alle Zitate, Bewertungen und das PDF dieser Quelle unwiderruflich.`}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {deleteError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Fehler: {deleteError}</p>}
    </div>
  )
}
