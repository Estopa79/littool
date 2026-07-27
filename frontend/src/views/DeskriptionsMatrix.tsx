import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSources, type Source } from '../lib/sources'
import { formatAuthorYear } from '../lib/sourceFormat'
import {
  fetchAllDescriptiveEntries,
  generateDescriptiveEntry,
  saveDescriptiveField,
  setIncluded,
  type DescriptiveEntry,
} from '../lib/descriptiveMatrix'

type Row = Source & DescriptiveEntry

const EMPTY_ENTRY: Omit<DescriptiveEntry, 'source_id'> = {
  included: false,
  einordnung: null,
  theoretische_fundierung: null,
  stichprobe: null,
  analysemethode: null,
  erkenntnisse: null,
  confirmed: false,
}

const cellClass =
  'w-full min-w-[10rem] resize-y rounded-md border border-slate-200 bg-white p-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

function EditableCell({
  value,
  onSave,
}: {
  value: string | null
  onSave: (value: string) => void
}) {
  const [text, setText] = useState(value ?? '')

  useEffect(() => {
    setText(value ?? '')
  }, [value])

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== (value ?? '')) onSave(text)
      }}
      rows={2}
      className={cellClass}
    />
  )
}

export function DeskriptionsMatrix() {
  const [sources, setSources] = useState<Source[]>([])
  const [entries, setEntries] = useState<Map<string, DescriptiveEntry>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onlyIncluded, setOnlyIncluded] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSources(), fetchAllDescriptiveEntries()])
      .then(([srcs, entryRows]) => {
        setSources(srcs)
        setEntries(new Map(entryRows.map((e) => [e.source_id, e])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const rows: Row[] = useMemo(
    () =>
      sources.map((s) => ({
        ...s,
        ...(entries.get(s.id) ?? { ...EMPTY_ENTRY, source_id: s.id }),
      })),
    [sources, entries],
  )

  const visible = useMemo(() => {
    const result = onlyIncluded ? rows.filter((r) => r.included) : rows
    return [...result].sort((a, b) => formatAuthorYear(a).localeCompare(formatAuthorYear(b)))
  }, [rows, onlyIncluded])

  const includedCount = rows.filter((r) => r.included).length

  function updateLocalEntry(sourceId: string, patch: Partial<DescriptiveEntry>) {
    setEntries((prev) => {
      const next = new Map(prev)
      const current = next.get(sourceId) ?? { ...EMPTY_ENTRY, source_id: sourceId }
      next.set(sourceId, { ...current, ...patch })
      return next
    })
  }

  async function handleToggleIncluded(sourceId: string, checked: boolean) {
    updateLocalEntry(sourceId, { included: checked })
    await setIncluded(sourceId, checked)
  }

  async function handleSaveField(
    sourceId: string,
    field: 'einordnung' | 'theoretische_fundierung' | 'stichprobe' | 'analysemethode' | 'erkenntnisse',
    value: string,
  ) {
    updateLocalEntry(sourceId, { [field]: value || null, confirmed: true })
    await saveDescriptiveField(sourceId, field, value)
  }

  async function handleGenerate(sourceId: string) {
    setGeneratingId(sourceId)
    setGenerateError(null)
    try {
      const data = await generateDescriptiveEntry(sourceId)
      updateLocalEntry(sourceId, { ...data, confirmed: false })
    } catch (err) {
      setGenerateError((err as Error).message)
    } finally {
      setGeneratingId(null)
    }
  }

  if (loading) return <p className="p-4 text-sm text-slate-400">Lädt …</p>
  if (error) return <p className="p-4 text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Deskriptionsmatrix</h1>
        <Link to="/forschungsfragen" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          ← Zur FF-Ansicht
        </Link>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Synthese-Übersicht als Vorstufe zur Evaluationsmatrix: pro Quelle Einordnung, theoretische Fundierung,
        Stichprobe, Analysemethode und wesentliche Erkenntnisse - von Hand ausfüllen oder per „KI-Einschätzung"
        vorschlagen lassen. Häkchen links legt fest, welche Quellen tatsächlich in die Matrix übernommen werden.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={onlyIncluded}
            onChange={(e) => setOnlyIncluded(e.target.checked)}
          />
          Nur ausgewählte anzeigen ({includedCount})
        </label>
        {generateError && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {generateError}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="w-10 py-2 pr-2 font-medium"></th>
              <th className="w-32 py-2 pr-3 font-medium">Autor/Jahr</th>
              <th className="w-48 py-2 pr-3 font-medium">Titel</th>
              <th className="w-40 py-2 pr-3 font-medium">Einordnung</th>
              <th className="w-40 py-2 pr-3 font-medium">Theoretische Fundierung</th>
              <th className="w-40 py-2 pr-3 font-medium">Art der Stichprobe</th>
              <th className="w-40 py-2 pr-3 font-medium">Analysemethode</th>
              <th className="w-56 py-2 pr-3 font-medium">Wesentliche Erkenntnisse</th>
              <th className="w-28 py-2 pr-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 align-top dark:border-slate-900">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(e) => handleToggleIncluded(row.id, e.target.checked)}
                  />
                </td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{formatAuthorYear(row)}</td>
                <td className="py-2 pr-3 text-slate-800 dark:text-slate-100">
                  <Link to={`/bibliothek/${row.id}`} className="hover:underline">
                    {row.title}
                  </Link>
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={row.einordnung} onSave={(v) => handleSaveField(row.id, 'einordnung', v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell
                    value={row.theoretische_fundierung}
                    onSave={(v) => handleSaveField(row.id, 'theoretische_fundierung', v)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={row.stichprobe} onSave={(v) => handleSaveField(row.id, 'stichprobe', v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell
                    value={row.analysemethode}
                    onSave={(v) => handleSaveField(row.id, 'analysemethode', v)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={row.erkenntnisse} onSave={(v) => handleSaveField(row.id, 'erkenntnisse', v)} />
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    disabled={generatingId === row.id}
                    onClick={() => handleGenerate(row.id)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {generatingId === row.id ? 'Schätzt …' : 'KI-Einschätzung'}
                  </button>
                  {row.confirmed && <p className="mt-1 text-xs text-green-600 dark:text-green-400">✔️ bestätigt</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
