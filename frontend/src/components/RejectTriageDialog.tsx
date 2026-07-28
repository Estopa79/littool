import { useState } from 'react'

type RejectTriageDialogProps = {
  title: string
  defaultReason: string
  busy?: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

// Eigener, kleiner Dialog statt des generischen ConfirmDialog: die
// Ablehnungs-Begruendung muss editierbar sein, nicht nur ein fester
// Hinweistext - vorbefuellt mit der KI-Einschaetzung (passt meistens direkt,
// wenn Claude ohnehin "verwerfen" empfohlen hatte), aber frei ueberschreibbar
// fuer den Fall, dass der Autor gegen eine "aufnehmen"-Empfehlung entscheidet
// und einen eigenen Grund braucht.
export function RejectTriageDialog({ title, defaultReason, busy, onConfirm, onCancel }: RejectTriageDialogProps) {
  const [reason, setReason] = useState(defaultReason)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          „{title}" verwerfen?
        </h2>
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
          Das PDF wird gelöscht. Ein Merkeintrag (Titel, Datei-Hash, Begründung) bleibt erhalten, damit ein
          erneuter Upload derselben Quelle erkannt wird.
        </p>
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Ablehnungs-Begründung
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mb-4 w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim() || 'Kein Grund angegeben')}
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Verwirft …' : 'Verwerfen'}
          </button>
        </div>
      </div>
    </div>
  )
}
