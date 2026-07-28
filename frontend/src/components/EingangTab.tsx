import { useEffect, useMemo, useState } from 'react'
import { UploadPanel } from './UploadPanel'
import { RejectTriageDialog } from './RejectTriageDialog'
import {
  acceptTriageSource,
  fetchTriageRejections,
  fetchTriageSources,
  rejectTriageSource,
  type TriageRejection,
  type TriageSource,
} from '../lib/triage'

const RECOMMENDATION_LABEL: Record<string, string> = {
  aufnehmen: '✅ aufnehmen',
  grenzwertig: '🟡 grenzwertig',
  verwerfen: '🔴 verwerfen',
}

function filenameOf(source: TriageSource): string {
  return source.storage_path?.split('/').pop() ?? source.title
}

export function EingangTab() {
  const [sources, setSources] = useState<TriageSource[]>([])
  const [rejections, setRejections] = useState<TriageRejection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRejected, setShowRejected] = useState(false)
  const [rejectedSearch, setRejectedSearch] = useState('')
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<TriageSource | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([fetchTriageSources(), fetchTriageRejections()])
      .then(([s, r]) => {
        setSources(s)
        setRejections(r)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAccept(source: TriageSource) {
    setAcceptingId(source.id)
    setActionError(null)
    try {
      await acceptTriageSource(source.id)
      load()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setAcceptingId(null)
    }
  }

  async function handleReject(reason: string) {
    if (!rejectTarget) return
    setRejecting(true)
    setActionError(null)
    try {
      await rejectTriageSource(rejectTarget, reason)
      setRejectTarget(null)
      load()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setRejecting(false)
    }
  }

  const visibleRejections = useMemo(() => {
    if (!rejectedSearch.trim()) return rejections
    const q = rejectedSearch.trim().toLowerCase()
    return rejections.filter((r) => r.title.toLowerCase().includes(q) || r.filename.toLowerCase().includes(q))
  }, [rejections, rejectedSearch])

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Neue Quellen zunächst hier hochladen: nur PDF + Dateiname, keine Voll-Verarbeitung. Erst nach „Übernehmen"
        läuft die normale Erfassung (Metadaten, Volltext, Embeddings) an.
      </p>

      <UploadPanel onUploaded={load} toTriage buttonLabel="⬆ Kandidaten hochladen" />

      {loading && <p className="text-sm text-slate-400">Lädt …</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}
      {actionError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {actionError}</p>}

      {!loading && !error && sources.length === 0 && (
        <p className="text-sm text-slate-400">Keine Kandidaten im Eingang.</p>
      )}

      <ul className="flex flex-col gap-3">
        {sources.map((s) => (
          <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800 dark:text-slate-100">{s.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{filenameOf(s)}</p>
              </div>
              {s.triage_recommendation && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {RECOMMENDATION_LABEL[s.triage_recommendation] ?? s.triage_recommendation}
                </span>
              )}
            </div>

            {s.duplicate_of_rejection_id && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                ⚠️ DOI stimmt mit einer früher verworfenen Quelle überein.
              </p>
            )}

            {!s.triage_recommendation && (
              <p className="mt-2 text-xs text-slate-400">
                Noch nicht eingeschätzt – nächster Worker-Lauf (<code>littool-worker triage-assess</code>) holt das
                nach.
              </p>
            )}

            {s.triage_reasoning && (
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                <p>{s.triage_reasoning.overall}</p>
                {s.triage_reasoning.per_question.length > 0 && (
                  <ul className="mt-1 list-inside list-disc">
                    {s.triage_reasoning.per_question.map((q) => (
                      <li key={q.research_question_id}>
                        <span className="font-medium">{q.code}:</span> {q.reasoning}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={acceptingId === s.id}
                onClick={() => handleAccept(s)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
              >
                {acceptingId === s.id ? 'Übernimmt …' : 'Übernehmen'}
              </button>
              <button
                type="button"
                onClick={() => setRejectTarget(s)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Verwerfen
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setShowRejected((v) => !v)}
          className="text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {showRejected ? '▾' : '▸'} Verworfen ({rejections.length})
        </button>

        {showRejected && (
          <div className="mt-3">
            <input
              type="search"
              placeholder="Suche in Verworfenen …"
              value={rejectedSearch}
              onChange={(e) => setRejectedSearch(e.target.value)}
              className="mb-3 w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {visibleRejections.length === 0 && <p className="text-sm text-slate-400">Nichts gefunden.</p>}
            <ul className="flex flex-col gap-2">
              {visibleRejections.map((r) => (
                <li key={r.id} className="rounded-md border border-slate-200 p-2 text-xs dark:border-slate-800">
                  <p className="font-medium text-slate-700 dark:text-slate-300">{r.title}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {r.filename} · {new Date(r.rejected_at).toLocaleDateString('de-DE')}
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{r.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {rejectTarget && (
        <RejectTriageDialog
          title={rejectTarget.title}
          defaultReason={rejectTarget.triage_reasoning?.overall ?? ''}
          busy={rejecting}
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}
