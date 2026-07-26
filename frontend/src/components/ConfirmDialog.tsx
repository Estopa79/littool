export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Löschen',
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">{title}</h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>
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
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Löscht …' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
