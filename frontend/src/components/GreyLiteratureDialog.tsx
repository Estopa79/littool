import { useState, type FormEvent } from 'react'
import { attachPdf, createSource, type Author } from '../lib/sources'

type GreyLiteratureDialogProps = {
  onClose: () => void
  onCreated: () => void
}

const inputClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

export function GreyLiteratureDialog({ onClose, onCreated }: GreyLiteratureDialogProps) {
  const [type, setType] = useState('grau')
  const [authors, setAuthors] = useState<Author[]>([{ given: '', family: '' }])
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [venue, setVenue] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateAuthor(index: number, key: keyof Author, value: string) {
    setAuthors((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)))
  }

  function addAuthor() {
    setAuthors((prev) => [...prev, { given: '', family: '' }])
  }

  function removeAuthor(index: number) {
    setAuthors((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length > 0 ? next : [{ given: '', family: '' }]
    })
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Titel ist erforderlich.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const cleanedAuthors = authors.filter((a) => a.given.trim() || a.family.trim())
      const id = await createSource({
        type,
        title: title.trim(),
        authors: cleanedAuthors.length > 0 ? cleanedAuthors : null,
        year: year ? Number(year) : null,
        venue: venue.trim() || null,
        url: url.trim() || null,
        status: 'complete',
      })

      if (file) {
        await attachPdf(id, file)
      }

      onCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
          Graue Literatur erfassen
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Typ</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              <option value="grau">Graue Literatur</option>
              <option value="journal">Journal</option>
              <option value="konferenz">Konferenz</option>
              <option value="buch">Buch</option>
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Autoren / Institution
            </span>
            {authors.map((author, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Vorname (optional bei Institution)"
                  value={author.given}
                  onChange={(e) => updateAuthor(i, 'given', e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <input
                  type="text"
                  placeholder="Nachname / Institution"
                  value={author.family}
                  onChange={(e) => updateAuthor(i, 'family', e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeAuthor(i)}
                  className="shrink-0 text-sm text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Entfernen"
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
              + hinzufügen
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Titel *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Jahr</span>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Herausgeber</span>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">URL</span>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">PDF (optional)</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {submitting ? 'Speichert …' : 'Erfassen'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-500 hover:underline dark:text-slate-400"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
