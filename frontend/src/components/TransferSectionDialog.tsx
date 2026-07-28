import { useEffect, useState } from 'react'
import { useActiveDocument, type DocumentRow } from '../lib/ActiveDocumentContext'
import {
  fetchSectionUsedCitationsForTransfer,
  transferSectionToDocument,
  type TransferCitationOption,
} from '../lib/sectionTransfer'

// Phase 5, Paket 8: "Abschnitts-Uebernahme zwischen Dokumenten" (z. B.
// ISP -> Expose). Eigene Komponente statt Inline-JSX in Schreibwerkstatt.tsx -
// hat einen eigenen Datenfluss (Zitat-Liste laden, Checkbox-Auswahl,
// Submit), der die Hauptansicht sonst weiter aufblaehen wuerde.
export function TransferSectionDialog({
  section,
  onClose,
  onTransferred,
}: {
  section: { id: string; title: string }
  onClose: () => void
  onTransferred: () => void
}) {
  const { activeDocumentId, documents } = useActiveDocument()
  const [targetDocumentId, setTargetDocumentId] = useState('')
  const [citations, setCitations] = useState<TransferCitationOption[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeDocumentId) return
    fetchSectionUsedCitationsForTransfer(section.id, activeDocumentId).then((rows) => {
      setCitations(rows)
      setCheckedIds(new Set(rows.map((r) => r.passage_id)))
      setLoading(false)
    })
  }, [section.id, activeDocumentId])

  const targetOptions = documents.filter((d: DocumentRow) => d.id !== activeDocumentId)

  function toggleCitation(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!targetDocumentId) return
    setSubmitting(true)
    setError(null)
    try {
      await transferSectionToDocument({
        sectionId: section.id,
        targetDocumentId,
        citationsToCheck: Array.from(checkedIds),
      })
      onTransferred()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          „{section.title}" in anderes Dokument übernehmen
        </h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Kopiert den Abschnitt samt aller Entwurfsversionen (inkl. Belegmarkern) und FF-/Themen-Verknüpfungen als
          neuen Abschnitt im Zieldokument. Diskussionsbeiträge werden nicht mitkopiert.
        </p>

        <label className="mb-3 flex flex-col text-xs text-slate-500 dark:text-slate-400">
          Zieldokument
          <select
            value={targetDocumentId}
            onChange={(e) => setTargetDocumentId(e.target.value)}
            className="mt-0.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">— wählen —</option>
            {targetOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>

        {loading && <p className="mb-3 text-sm text-slate-400">Lädt …</p>}

        {!loading && citations.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Häkchen im Zieldokument mit übernehmen (abwählbar):
            </p>
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
              {citations.map((c) => (
                <li key={c.passage_id}>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={checkedIds.has(c.passage_id)} onChange={() => toggleCitation(c.passage_id)} />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!loading && citations.length === 0 && (
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Keine im aktiven Dokument angehakten Zitate zu diesem Abschnitt - es werden nur Struktur und Entwürfe
            kopiert.
          </p>
        )}

        {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">Fehler: {error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !targetDocumentId || loading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? 'Übernimmt …' : 'Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  )
}
