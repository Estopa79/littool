import { useState } from 'react'
import { UploadDropzone } from './UploadDropzone'
import { uploadSource } from '../lib/uploadSource'

type UploadItemStatus = 'wartet' | 'lädt hoch' | 'fertig' | 'fehler'

type UploadItem = {
  key: string
  name: string
  status: UploadItemStatus
  error?: string
}

type UploadPanelProps = {
  onUploaded: () => void
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])

  function handleFiles(files: File[]) {
    const batch = files.map((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const item: UploadItem = {
        key: crypto.randomUUID(),
        name: file.name,
        status: isPdf ? 'wartet' : 'fehler',
        error: isPdf ? undefined : 'Keine PDF-Datei',
      }
      return { item, file, isPdf }
    })

    setItems((prev) => [...prev, ...batch.map((b) => b.item)])

    for (const { item, file, isPdf } of batch) {
      if (!isPdf) continue

      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'lädt hoch' } : i)))

      uploadSource(file).then((result) => {
        setItems((prev) =>
          prev.map((i) =>
            i.key === item.key
              ? result.ok
                ? { ...i, status: 'fertig' }
                : { ...i, status: 'fehler', error: result.error }
              : i,
          ),
        )
        onUploaded()
      })
    }
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {open ? 'Upload schließen' : '⬆ PDFs hochladen'}
      </button>

      {open && (
        <div className="mt-3">
          <UploadDropzone onFiles={handleFiles} />

          {items.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {items.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate text-slate-700 dark:text-slate-300">{item.name}</span>
                  <span
                    className={
                      item.status === 'fertig'
                        ? 'shrink-0 text-green-600 dark:text-green-400'
                        : item.status === 'fehler'
                          ? 'shrink-0 text-red-600 dark:text-red-400'
                          : 'shrink-0 text-slate-400'
                    }
                  >
                    {item.status === 'fehler' ? item.error : item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
