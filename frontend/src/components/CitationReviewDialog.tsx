import { useState } from 'react'
import { confirmPassage, discardPassage, type GeneratedCandidate } from '../lib/citations'

const RELEVANCE_STARS: Record<number, string> = { 1: '★☆☆', 2: '★★☆', 3: '★★★' }

export function CitationReviewDialog({
  sourceTitle,
  candidates,
  errors,
  discarded,
  message,
  onClose,
  onPageJump,
  onChange,
}: {
  sourceTitle: string
  candidates: GeneratedCandidate[]
  errors: Array<{ research_question_code: string; message: string }>
  discarded: number
  message?: string
  onClose: () => void
  onPageJump?: (page: number) => void
  onChange?: () => void
}) {
  const [pending, setPending] = useState<GeneratedCandidate[]>(candidates)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleConfirm(candidate: GeneratedCandidate) {
    setBusyId(candidate.id)
    try {
      await confirmPassage(candidate.id)
      setPending((prev) => prev.filter((c) => c.id !== candidate.id))
      onChange?.()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDiscard(candidate: GeneratedCandidate) {
    setBusyId(candidate.id)
    try {
      await discardPassage(candidate.id)
      setPending((prev) => prev.filter((c) => c.id !== candidate.id))
      onChange?.()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Zitat-Kandidaten – {sourceTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {message && <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{message}</p>}

          {pending.length === 0 && !message && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Keine Kandidaten mehr offen – alle bestätigt oder verworfen.
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {pending.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {c.research_question_code}
                  </span>
                  <span className="text-xs text-slate-400" title={`Relevanz ${c.relevance}/3`}>
                    {RELEVANCE_STARS[c.relevance] ?? c.relevance}
                  </span>
                </div>
                <p className="italic text-slate-700 dark:text-slate-300">„{c.original}"</p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">{c.translation}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-500">{c.citation}</span>
                  {onPageJump && (
                    <button
                      type="button"
                      onClick={() => onPageJump(c.page)}
                      className="text-xs text-slate-500 hover:underline dark:text-slate-400"
                    >
                      PDF S. {c.page} →
                    </button>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => handleConfirm(c)}
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                  >
                    ✓ Übernehmen
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => handleDiscard(c)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    ✗ Verwerfen
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {(discarded > 0 || errors.length > 0) && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800">
              {discarded > 0 && <p>{discarded} Kandidat(en) automatisch verworfen (nicht im Text nachweisbar).</p>}
              {errors.map((e, i) => (
                <p key={i}>
                  {e.research_question_code}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
