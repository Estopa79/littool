import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSources, type Source } from '../lib/sources'
import { fetchAllDescriptiveEntries } from '../lib/descriptiveMatrix'
import { formatAuthorYear } from '../lib/sourceFormat'
import {
  addCriterion,
  deleteCriterion,
  ensureDefaultCriterionSet,
  fetchAllSourceCriteria,
  fetchCriteria,
  generateCriteriaEvaluation,
  saveSourceCriterionValue,
  suggestCriteria,
  updateCriterion,
  type Criterion,
  type SourceCriterionValue,
} from '../lib/evaluationMatrix'

const VALUE_LABEL: Record<number, string> = { 0: '○ leer', 1: '◔ viertel', 2: '◑ halb', 3: '● voll' }

function CriterionRow({
  criterion,
  onSave,
  onDelete,
}: {
  criterion: Criterion
  onSave: (id: string, patch: { name?: string; derivation?: string | null }) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState(criterion.name)
  const [derivation, setDerivation] = useState(criterion.derivation ?? '')

  useEffect(() => {
    setName(criterion.name)
    setDerivation(criterion.derivation ?? '')
  }, [criterion.name, criterion.derivation])

  return (
    <li className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-2">
        {!criterion.confirmed && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            KI-Vorschlag
          </span>
        )}
        <button
          type="button"
          onClick={() => onDelete(criterion.id)}
          className="ml-auto text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400"
        >
          ✗ Entfernen
        </button>
      </div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Beschreibung</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== criterion.name && onSave(criterion.id, { name })}
        className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Herleitung</label>
      <textarea
        value={derivation}
        onChange={(e) => setDerivation(e.target.value)}
        onBlur={() => derivation !== (criterion.derivation ?? '') && onSave(criterion.id, { derivation })}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
    </li>
  )
}

export function EvaluationsMatrix() {
  const [sources, setSources] = useState<Source[]>([])
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set())
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [values, setValues] = useState<Map<string, SourceCriterionValue>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setId, setSetId] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDerivation, setNewDerivation] = useState('')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSources(), fetchAllDescriptiveEntries(), fetchCriteria(), fetchAllSourceCriteria(), ensureDefaultCriterionSet()])
      .then(([srcs, entries, crit, vals, defaultSetId]) => {
        setSources(srcs)
        setIncludedIds(new Set(entries.filter((e) => e.included).map((e) => e.source_id)))
        setCriteria(crit)
        setValues(new Map(vals.map((v) => [`${v.source_id}:${v.criterion_id}`, v])))
        setSetId(defaultSetId)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const includedSources = useMemo(
    () => sources.filter((s) => includedIds.has(s.id)).sort((a, b) => formatAuthorYear(a).localeCompare(formatAuthorYear(b))),
    [sources, includedIds],
  )

  async function handleSaveCriterion(id: string, patch: { name?: string; derivation?: string | null }) {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, confirmed: true } : c)))
    await updateCriterion(id, patch)
  }

  async function handleDeleteCriterion(id: string) {
    setCriteria((prev) => prev.filter((c) => c.id !== id))
    await deleteCriterion(id)
  }

  async function handleAddCriterion() {
    if (!setId || !newName.trim()) return
    const created = await addCriterion(setId, newName.trim(), newDerivation.trim())
    setCriteria((prev) => [...prev, created])
    setNewName('')
    setNewDerivation('')
    setShowAddForm(false)
  }

  async function handleSuggest() {
    setSuggesting(true)
    setSuggestError(null)
    try {
      const suggested = await suggestCriteria()
      setCriteria((prev) => [...prev, ...suggested])
    } catch (err) {
      setSuggestError((err as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSaveValue(sourceId: string, criterionId: string, value: number) {
    setValues((prev) => {
      const next = new Map(prev)
      next.set(`${sourceId}:${criterionId}`, { source_id: sourceId, criterion_id: criterionId, value, reasoning: null, confirmed: true })
      return next
    })
    await saveSourceCriterionValue(sourceId, criterionId, value)
  }

  async function handleGenerate(sourceId: string) {
    setGeneratingId(sourceId)
    setGenerateError(null)
    try {
      const evaluations = await generateCriteriaEvaluation(sourceId)
      setValues((prev) => {
        const next = new Map(prev)
        for (const e of evaluations) {
          next.set(`${sourceId}:${e.criterion_id}`, {
            source_id: sourceId,
            criterion_id: e.criterion_id,
            value: e.value,
            reasoning: e.reasoning,
            confirmed: false,
          })
        }
        return next
      })
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
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Evaluationsmatrix</h1>
        <Link to="/deskriptionsmatrix" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          ← Zur Deskriptionsmatrix
        </Link>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Bewertet die in der Deskriptionsmatrix ausgewählten Quellen gegen frei definierte Kriterien (0 = nicht bis 3 =
        voll abgedeckt). Kriterien unten manuell anlegen oder per KI vorschlagen lassen; Zellwerte manuell setzen oder
        per Knopf pro Zeile von der KI einschätzen lassen.
      </p>

      <section className="mb-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Evaluationskriterien</h2>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={suggesting}
              onClick={handleSuggest}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {suggesting ? 'Schlägt vor …' : 'KI-Vorschlag'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              + Kriterium
            </button>
          </div>
        </div>
        {suggestError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {suggestError}</p>}

        {showAddForm && (
          <div className="mb-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Beschreibung</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Kriterium"
            />
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Herleitung</label>
            <textarea
              value={newDerivation}
              onChange={(e) => setNewDerivation(e.target.value)}
              rows={2}
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Warum dieses Kriterium?"
            />
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={handleAddCriterion}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              Hinzufügen
            </button>
          </div>
        )}

        {criteria.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Kriterien angelegt.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {criteria.map((c) => (
              <CriterionRow key={c.id} criterion={c} onSave={handleSaveCriterion} onDelete={handleDeleteCriterion} />
            ))}
          </ul>
        )}
      </section>

      {generateError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Fehler: {generateError}</p>}

      {includedSources.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Noch keine Quellen ausgewählt — Häkchen in der{' '}
          <Link to="/deskriptionsmatrix" className="underline">
            Deskriptionsmatrix
          </Link>{' '}
          setzen.
        </p>
      ) : criteria.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Erst oben mindestens ein Kriterium anlegen.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-auto border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">Autor/Jahr</th>
                <th className="py-2 pr-3 font-medium">Titel</th>
                {criteria.map((c) => (
                  <th key={c.id} className="py-2 pr-3 font-medium" title={c.derivation ?? undefined}>
                    {c.short_name}
                  </th>
                ))}
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {includedSources.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-700 dark:text-slate-300">
                    {formatAuthorYear(s)}
                  </td>
                  <td className="max-w-xs truncate py-2 pr-3 text-slate-800 dark:text-slate-100">
                    <Link to={`/bibliothek/${s.id}`} className="hover:underline">
                      {s.title}
                    </Link>
                  </td>
                  {criteria.map((c) => {
                    const entry = values.get(`${s.id}:${c.id}`)
                    return (
                      <td key={c.id} className="py-2 pr-3" title={entry?.reasoning ?? undefined}>
                        <select
                          value={entry?.value ?? 0}
                          onChange={(e) => handleSaveValue(s.id, c.id, Number(e.target.value))}
                          className="rounded-md border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {[0, 1, 2, 3].map((v) => (
                            <option key={v} value={v}>
                              {VALUE_LABEL[v]}
                            </option>
                          ))}
                        </select>
                      </td>
                    )
                  })}
                  <td className="whitespace-nowrap py-2 pr-3">
                    <button
                      type="button"
                      disabled={generatingId === s.id}
                      onClick={() => handleGenerate(s.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      {generatingId === s.id ? 'Schätzt …' : 'KI-Einschätzung'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
