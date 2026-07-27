import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSources, type Source } from '../lib/sources'
import { formatAuthorYear } from '../lib/sourceFormat'
import { fetchAllSourceTopics, fetchAllTopics, type TopicOption } from '../lib/qsReview'
import {
  fetchAllDescriptiveEntries,
  generateDescriptiveEntry,
  saveDescriptiveField,
  setIncluded,
  type DescriptiveEntry,
} from '../lib/descriptiveMatrix'

type Row = Source & DescriptiveEntry

type SortKey =
  | 'author_year'
  | 'title'
  | 'einordnung'
  | 'theoretische_fundierung'
  | 'stichprobe'
  | 'analysemethode'
  | 'erkenntnisse'
type SortDir = 'asc' | 'desc'

const TEXT_FIELDS: Array<{
  key: Extract<SortKey, 'einordnung' | 'theoretische_fundierung' | 'stichprobe' | 'analysemethode' | 'erkenntnisse'>
  label: string
  width: string
}> = [
  { key: 'einordnung', label: 'Einordnung', width: 'w-40' },
  { key: 'theoretische_fundierung', label: 'Theoretische Fundierung', width: 'w-40' },
  { key: 'stichprobe', label: 'Art der Stichprobe', width: 'w-40' },
  { key: 'analysemethode', label: 'Analysemethode', width: 'w-40' },
  { key: 'erkenntnisse', label: 'Wesentliche Erkenntnisse', width: 'w-56' },
]

function toCsv(rows: Row[]): string {
  const header = ['Ausgewählt', 'Autor/Jahr', 'Titel', ...TEXT_FIELDS.map((f) => f.label)]
  const lines = rows.map((r) => [
    r.included ? 'Ja' : 'Nein',
    formatAuthorYear(r),
    r.title,
    ...TEXT_FIELDS.map((f) => r[f.key] ?? ''),
  ])
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
  return [header, ...lines].map((line) => line.map(escape).join(',')).join('\n')
}

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
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [filterTopic, setFilterTopic] = useState('')
  const [sourceIdsByTopic, setSourceIdsByTopic] = useState<Map<string, Set<string>>>(new Map())
  const [sortKey, setSortKey] = useState<SortKey>('author_year')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    Promise.all([fetchSources(), fetchAllDescriptiveEntries()])
      .then(([srcs, entryRows]) => {
        setSources(srcs)
        setEntries(new Map(entryRows.map((e) => [e.source_id, e])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
    fetchAllTopics().then(setAllTopics)
    fetchAllSourceTopics().then((rows) => {
      const map = new Map<string, Set<string>>()
      for (const row of rows) {
        if (!map.has(row.topic_id)) map.set(row.topic_id, new Set())
        map.get(row.topic_id)!.add(row.source_id)
      }
      setSourceIdsByTopic(map)
    })
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const rows: Row[] = useMemo(
    () =>
      sources.map((s) => ({
        ...s,
        ...(entries.get(s.id) ?? { ...EMPTY_ENTRY, source_id: s.id }),
      })),
    [sources, entries],
  )

  const visible = useMemo(() => {
    let result = onlyIncluded ? rows.filter((r) => r.included) : rows
    if (filterTopic) {
      const ids = sourceIdsByTopic.get(filterTopic) ?? new Set()
      result = result.filter((r) => ids.has(r.id))
    }
    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'author_year') cmp = formatAuthorYear(a).localeCompare(formatAuthorYear(b))
      else if (sortKey === 'title') cmp = a.title.localeCompare(b.title)
      else cmp = (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, onlyIncluded, filterTopic, sourceIdsByTopic, sortKey, sortDir])

  const includedCount = rows.filter((r) => r.included).length

  function exportCsv() {
    const csv = toCsv(visible)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'deskriptionsmatrix.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={onlyIncluded}
            onChange={(e) => setOnlyIncluded(e.target.checked)}
          />
          Nur ausgewählte anzeigen ({includedCount})
        </label>
        <select
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Themenfelder</option>
          {allTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          CSV exportieren
        </button>
        {generateError && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {generateError}</p>}
      </div>
      <p className="mb-2 text-xs text-slate-400">Tabellenkopf anklicken zum Sortieren.</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="w-10 py-2 pr-2 font-medium"></th>
              <th className="w-32 py-2 pr-3 font-medium">
                <button type="button" className="select-none hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('author_year')}>
                  Autor/Jahr{sortIndicator('author_year')}
                </button>
              </th>
              <th className="w-48 py-2 pr-3 font-medium">
                <button type="button" className="select-none hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('title')}>
                  Titel{sortIndicator('title')}
                </button>
              </th>
              {TEXT_FIELDS.map((f) => (
                <th key={f.key} className={`${f.width} py-2 pr-3 font-medium`}>
                  <button type="button" className="select-none hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort(f.key)}>
                    {f.label}{sortIndicator(f.key)}
                  </button>
                </th>
              ))}
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
