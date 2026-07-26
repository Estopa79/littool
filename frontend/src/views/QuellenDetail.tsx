import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { fetchSource, getSignedPdfUrl, updateSource, type Author, type SourceDetail } from '../lib/sources'
import { STATUS_ICON, STATUS_LABEL } from '../lib/sourceFormat'
import {
  fetchSourceFunctions,
  fetchWorkFunctions,
  setSourceFunction,
  type WorkFunction,
} from '../lib/functions'
import { fetchResearchQuestions, type ResearchQuestion } from '../lib/settings'
import {
  addManualCitation,
  fetchPassagesForSource,
  generateCitations,
  type GenerateCitationsResult,
  type Passage,
} from '../lib/citations'
import { CitationReviewDialog } from '../components/CitationReviewDialog'
import {
  confirmMethodProfile,
  fetchMethodProfile,
  STUDY_TYPE_LABEL,
  type MethodProfile,
} from '../lib/methodProfiles'
import { generateParaphrase } from '../lib/paraphrase'

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
  }, [id])

  async function handleConfirmMethodProfile() {
    if (!id) return
    await confirmMethodProfile(id)
    setMethodProfile((prev) => (prev ? { ...prev, confirmed: true } : prev))
  }

  function reloadPassages() {
    if (id) fetchPassagesForSource(id).then(setPassages)
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
    try {
      const cleanedAuthors = form.authors.filter((a) => a.given.trim() || a.family.trim())
      await updateSource(id, {
        type: form.type || null,
        title: form.title,
        authors: cleanedAuthors.length > 0 ? cleanedAuthors : null,
        year: form.year ? Number(form.year) : null,
        venue: form.venue || null,
        volume: form.volume || null,
        issue: form.issue || null,
        pages: form.pages || null,
        page_offset: form.page_offset ? Number(form.page_offset) : 0,
        issn: form.issn || null,
        doi: form.doi || null,
        abstract: form.abstract || null,
        citation_count: form.citation_count ? Number(form.citation_count) : null,
        url: form.url || null,
        ranking_system: form.ranking_system || null,
        ranking_value: form.ranking_value || null,
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
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/bibliothek" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
        ← Zurück zur Bibliothek
      </Link>

      <div className="mb-4 mt-2 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Quelle bearbeiten</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {STATUS_ICON[source.status]} {STATUS_LABEL[source.status]}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{p.citation}</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Typ">
            <select
              value={form.type}
              onChange={(e) => updateField('type', e.target.value)}
              className={inputClass}
            >
              <option value="">– unbekannt –</option>
              <option value="journal">Journal</option>
              <option value="konferenz">Konferenz</option>
              <option value="buch">Buch</option>
              <option value="grau">Graue Literatur</option>
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
              {saving ? 'Speichert …' : 'Speichern (setzt Status auf vollständig)'}
            </button>
            {saved && <span className="text-sm text-green-600 dark:text-green-400">Gespeichert.</span>}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}
        </form>

        <div>
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
                className="h-[70vh] w-full rounded-md border border-slate-200 dark:border-slate-800"
              />
            </>
          ) : (
            <p className="text-sm text-slate-400">Kein PDF hinterlegt.</p>
          )}
        </div>
      </div>
    </div>
  )
}
