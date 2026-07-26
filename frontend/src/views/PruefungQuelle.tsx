import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchSource } from '../lib/sources'
import {
  addTopic,
  confirmTopic,
  fetchAllTopics,
  fetchSourceRelevance,
  fetchSourceTopics,
  removeTopic,
  saveRelevance,
  type ReviewRelevance,
  type ReviewTopic,
  type TopicOption,
} from '../lib/qsReview'
import { discardPassage, fetchPassagesForSource, updateAndConfirmPassage, type Passage } from '../lib/citations'
import { confirmMethodProfile, fetchMethodProfile, STUDY_TYPE_LABEL, type MethodProfile } from '../lib/methodProfiles'
import {
  fetchSourceFunctions,
  fetchWorkFunctions,
  setSourceFunction,
  type SourceFunction,
  type WorkFunction,
} from '../lib/functions'

const inputClass =
  'w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

function RelevanceCard({
  item,
  onSaved,
}: {
  item: ReviewRelevance
  onSaved: (rqId: string) => void
}) {
  const [value, setValue] = useState(item.relevance)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await saveRelevance(item.source_id, item.research_question_id, value)
      onSaved(item.research_question_id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {item.rq_code}
        </span>
        <select
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value={0}>0 – nicht relevant</option>
          <option value={1}>1 – am Rande</option>
          <option value={2}>2 – relevant</option>
          <option value={3}>3 – zentral</option>
        </select>
      </div>
      {item.reasoning && (
        <p className="text-slate-600 dark:text-slate-400">
          <span className="font-medium">KI-Einschätzung:</span> {item.reasoning}
        </p>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-2 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
      >
        ✓ Bestätigen
      </button>
    </li>
  )
}

function PassageCard({ passage, onDone }: { passage: Passage; onDone: (id: string) => void }) {
  const [original, setOriginal] = useState(passage.original)
  const [translation, setTranslation] = useState(passage.translation ?? '')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await updateAndConfirmPassage(passage.id, { original, translation: translation || null })
      onDone(passage.id)
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    setBusy(true)
    try {
      await discardPassage(passage.id)
      onDone(passage.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>PDF S. {passage.page}</span>
        <span>{passage.citation}</span>
      </div>
      <textarea value={original} onChange={(e) => setOriginal(e.target.value)} rows={2} className={inputClass} />
      <textarea
        value={translation}
        onChange={(e) => setTranslation(e.target.value)}
        rows={2}
        className={`${inputClass} mt-2`}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
        >
          ✓ Bestätigen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={discard}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ✗ Löschen
        </button>
      </div>
    </li>
  )
}

export function PruefungQuelle() {
  const { sourceId } = useParams<{ sourceId: string }>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [topics, setTopics] = useState<ReviewTopic[]>([])
  const [assignedTopicIds, setAssignedTopicIds] = useState<Set<string>>(new Set())
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [addTopicId, setAddTopicId] = useState('')

  const [relevance, setRelevance] = useState<ReviewRelevance[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [methodProfile, setMethodProfile] = useState<MethodProfile | null>(null)
  const [workFunctions, setWorkFunctions] = useState<WorkFunction[]>([])
  const [sourceFunctions, setSourceFunctions] = useState<SourceFunction[]>([])

  useEffect(() => {
    if (!sourceId) return
    setLoading(true)
    Promise.all([
      fetchSource(sourceId),
      fetchSourceTopics(sourceId),
      fetchAllTopics(),
      fetchSourceRelevance(sourceId),
      fetchPassagesForSource(sourceId),
      fetchMethodProfile(sourceId),
      fetchWorkFunctions(),
      fetchSourceFunctions(sourceId),
    ])
      .then(([source, t, at, rel, pass, mp, wf, sf]) => {
        setTitle(source.title)
        setTopics(t.filter((x) => !x.confirmed))
        setAssignedTopicIds(new Set(t.map((x) => x.topic_id)))
        setAllTopics(at)
        setRelevance(rel.filter((x) => !x.confirmed))
        setPassages(pass.filter((x) => !x.confirmed))
        setMethodProfile(mp && !mp.confirmed ? mp : null)
        setWorkFunctions(wf)
        setSourceFunctions(sf.filter((x) => !x.confirmed))
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [sourceId])

  const availableTopicsToAdd = useMemo(
    () => allTopics.filter((t) => !assignedTopicIds.has(t.id)),
    [allTopics, assignedTopicIds],
  )

  const totalOpen = topics.length + relevance.length + passages.length + (methodProfile ? 1 : 0) + sourceFunctions.length

  async function handleConfirmTopic(topicId: string) {
    if (!sourceId) return
    await confirmTopic(sourceId, topicId)
    setTopics((prev) => prev.filter((t) => t.topic_id !== topicId))
  }

  async function handleRemoveTopic(topicId: string) {
    if (!sourceId) return
    await removeTopic(sourceId, topicId)
    setTopics((prev) => prev.filter((t) => t.topic_id !== topicId))
    setAssignedTopicIds((prev) => {
      const next = new Set(prev)
      next.delete(topicId)
      return next
    })
  }

  async function handleAddTopic() {
    if (!sourceId || !addTopicId) return
    await addTopic(sourceId, addTopicId)
    setAssignedTopicIds((prev) => new Set(prev).add(addTopicId))
    setAddTopicId('')
  }

  async function handleConfirmFunction(functionId: string) {
    if (!sourceId) return
    await setSourceFunction(sourceId, functionId, true)
    setSourceFunctions((prev) => prev.filter((f) => f.function_id !== functionId))
  }

  async function handleConfirmMethodProfile() {
    if (!sourceId) return
    await confirmMethodProfile(sourceId)
    setMethodProfile(null)
  }

  if (loading) return <div className="p-6 text-sm text-slate-400">Lädt …</div>
  if (error) return <div className="p-6 text-sm text-red-600 dark:text-red-400">Fehler: {error}</div>

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link to="/pruefen" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
        ← Zurück zur Prüfliste
      </Link>
      <div className="mb-4 mt-2 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h1>
        <Link to={`/bibliothek/${sourceId}`} className="shrink-0 text-xs text-slate-500 hover:underline dark:text-slate-400">
          Zur Detailseite →
        </Link>
      </div>

      {totalOpen === 0 ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          ✔️ Diese Quelle ist vollständig geprüft.
          <button type="button" onClick={() => navigate('/pruefen')} className="ml-2 underline">
            Zurück zur Liste
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {topics.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Themenfelder</h2>
              <ul className="flex flex-col gap-2">
                {topics.map((t) => (
                  <li
                    key={t.topic_id}
                    className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
                  >
                    <span>{t.topic_name}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmTopic(t.topic_id)}
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                      >
                        ✓ Bestätigen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTopic(t.topic_id)}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        ✗ Entfernen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {availableTopicsToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <select value={addTopicId} onChange={(e) => setAddTopicId(e.target.value)} className={inputClass}>
                <option value="">Thema ergänzen …</option>
                {availableTopicsToAdd.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!addTopicId}
                onClick={handleAddTopic}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                + Hinzufügen
              </button>
            </div>
          )}

          {relevance.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Relevanz je Forschungsfrage</h2>
              <ul className="flex flex-col gap-2">
                {relevance.map((r) => (
                  <RelevanceCard
                    key={r.research_question_id}
                    item={r}
                    onSaved={(rqId) => setRelevance((prev) => prev.filter((x) => x.research_question_id !== rqId))}
                  />
                ))}
              </ul>
            </section>
          )}

          {passages.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Zitate</h2>
              <ul className="flex flex-col gap-2">
                {passages.map((p) => (
                  <PassageCard key={p.id} passage={p} onDone={(id) => setPassages((prev) => prev.filter((x) => x.id !== id))} />
                ))}
              </ul>
            </section>
          )}

          {methodProfile && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Methodenprofil</h2>
              <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                <p>
                  <span className="font-medium">{STUDY_TYPE_LABEL[methodProfile.study_type]}</span>
                  {methodProfile.method && <> · {methodProfile.method}</>}
                </p>
                {methodProfile.data_basis && (
                  <p className="mt-1 text-slate-600 dark:text-slate-400">Datengrundlage: {methodProfile.data_basis}</p>
                )}
                <button
                  type="button"
                  onClick={handleConfirmMethodProfile}
                  className="mt-2 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  ✓ Bestätigen
                </button>
              </div>
            </section>
          )}

          {sourceFunctions.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Funktion</h2>
              <ul className="flex flex-col gap-2">
                {sourceFunctions.map((sf) => {
                  const name = workFunctions.find((f) => f.id === sf.function_id)?.name ?? '?'
                  return (
                    <li
                      key={sf.function_id}
                      className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
                    >
                      <span>{name}</span>
                      <button
                        type="button"
                        onClick={() => handleConfirmFunction(sf.function_id)}
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                      >
                        ✓ Bestätigen
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
