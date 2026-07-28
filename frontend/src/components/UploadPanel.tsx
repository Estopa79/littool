import { useState } from 'react'
import { UploadDropzone } from './UploadDropzone'
import { uploadSource } from '../lib/uploadSource'
import type { TriageRejection } from '../lib/triage'

type UploadItemStatus = 'wartet' | 'lädt hoch' | 'fertig' | 'fehler' | 'blockiert'

type UploadItem = {
  key: string
  name: string
  status: UploadItemStatus
  error?: string
  rejection?: TriageRejection
}

type UploadPanelProps = {
  onUploaded: () => void
  toTriage?: boolean
  buttonLabel?: string
}

export function UploadPanel({ onUploaded, toTriage, buttonLabel }: UploadPanelProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [files, setFiles] = useState<Map<string, File>>(new Map())

  function runUpload(key: string, file: File, ignoreRejectionMatch: boolean) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: 'lädt hoch' } : i)))

    uploadSource(file, { toTriage, ignoreRejectionMatch }).then((result) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.key !== key) return i
          if (result.ok) return { ...i, status: 'fertig' }
          if ('blocked' in result) return { ...i, status: 'blockiert', rejection: result.rejection }
          return { ...i, status: 'fehler', error: result.error }
        }),
      )
      if (result.ok) onUploaded()
    })
  }

  function handleFiles(newFiles: File[]) {
    const batch = newFiles.map((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const key = crypto.randomUUID()
      const item: UploadItem = {
        key,
        name: file.name,
        status: isPdf ? 'wartet' : 'fehler',
        error: isPdf ? undefined : 'Keine PDF-Datei',
      }
      return { item, file, isPdf, key }
    })

    setItems((prev) => [...prev, ...batch.map((b) => b.item)])
    setFiles((prev) => {
      const next = new Map(prev)
      for (const { key, file } of batch) next.set(key, file)
      return next
    })

    for (const { key, file, isPdf } of batch) {
      if (!isPdf) continue
      runUpload(key, file, false)
    }
  }

  function handleForceUpload(key: string) {
    const file = files.get(key)
    if (!file) return
    runUpload(key, file, true)
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {open ? 'Upload schließen' : (buttonLabel ?? '⬆ PDFs hochladen')}
      </button>

      {open && (
        <div className="mt-3">
          <UploadDropzone onFiles={handleFiles} />

          {items.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {items.map((item) => (
                <li key={item.key} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-700 dark:text-slate-300">{item.name}</span>
                    <span
                      className={
                        item.status === 'fertig'
                          ? 'shrink-0 text-green-600 dark:text-green-400'
                          : item.status === 'fehler' || item.status === 'blockiert'
                            ? 'shrink-0 text-red-600 dark:text-red-400'
                            : 'shrink-0 text-slate-400'
                      }
                    >
                      {item.status === 'fehler' ? item.error : item.status === 'blockiert' ? 'bereits verworfen' : item.status}
                    </span>
                  </div>
                  {item.status === 'blockiert' && item.rejection && (
                    <div className="mt-1 rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                      <p>
                        Bereits am {new Date(item.rejection.rejected_at).toLocaleDateString('de-DE')} geprüft und
                        verworfen – Begründung: {item.rejection.reason}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleForceUpload(item.key)}
                        className="mt-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900"
                      >
                        Trotzdem erneut prüfen
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
