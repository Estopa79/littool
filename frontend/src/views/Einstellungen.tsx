import { useEffect, useState, type FormEvent } from 'react'
import {
  createResearchQuestion,
  createTopic,
  deleteResearchQuestion,
  deleteTopic,
  fetchAppSettings,
  fetchResearchQuestions,
  fetchTopics,
  updateAppSettings,
  updateResearchQuestion,
  updateTopic,
  type ResearchQuestion,
  type Topic,
} from '../lib/settings'
import { createPersona, deletePersona, fetchPersonas, updatePersona, type Persona } from '../lib/personas'

const inputClass =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
      {children}
    </section>
  )
}

function ThemaCard() {
  const [theme, setTheme] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchAppSettings()
      .then((s) => setTheme(s.dissertation_theme ?? ''))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateAppSettings({ dissertation_theme: theme || null })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card title="Dissertationsthema">Lädt …</Card>

  return (
    <Card title="Dissertationsthema">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value)
            setSaved(false)
          }}
          rows={3}
          className={inputClass}
          placeholder="Titel/Thema der Dissertation"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {saving ? 'Speichert …' : 'Speichern'}
          </button>
          {saved && <span className="text-sm text-green-600 dark:text-green-400">Gespeichert.</span>}
        </div>
      </form>
    </Card>
  )
}

function ForschungsfragenCard() {
  const [rqs, setRqs] = useState<ResearchQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [newCode, setNewCode] = useState('')
  const [newQuestion, setNewQuestion] = useState('')

  function load() {
    return fetchResearchQuestions().then(setRqs)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newCode.trim() || !newQuestion.trim()) return
    const sortOrder = rqs.length > 0 ? Math.max(...rqs.map((r) => r.sort_order)) + 1 : 1
    await createResearchQuestion({ code: newCode.trim(), question: newQuestion.trim(), sort_order: sortOrder })
    setNewCode('')
    setNewQuestion('')
    await load()
  }

  async function handleFieldChange(rq: ResearchQuestion, patch: Partial<ResearchQuestion>) {
    setRqs((prev) => prev.map((r) => (r.id === rq.id ? { ...r, ...patch } : r)))
  }

  async function handleBlurSave(rq: ResearchQuestion) {
    await updateResearchQuestion(rq.id, { code: rq.code, question: rq.question })
  }

  async function handleMove(rq: ResearchQuestion, direction: -1 | 1) {
    const sorted = [...rqs].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((r) => r.id === rq.id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= sorted.length) return
    const other = sorted[swapIndex]
    await Promise.all([
      updateResearchQuestion(rq.id, { sort_order: other.sort_order }),
      updateResearchQuestion(other.id, { sort_order: rq.sort_order }),
    ])
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Forschungsfrage wirklich löschen?')) return
    await deleteResearchQuestion(id)
    await load()
  }

  if (loading) return <Card title="Forschungsfragen">Lädt …</Card>

  return (
    <Card title="Forschungsfragen">
      <div className="flex flex-col gap-2">
        {rqs.map((rq, i) => (
          <div key={rq.id} className="flex items-start gap-2">
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => handleMove(rq, -1)}
                disabled={i === 0}
                className="text-slate-400 hover:text-slate-800 disabled:opacity-30 dark:hover:text-slate-100"
                aria-label="Nach oben"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => handleMove(rq, 1)}
                disabled={i === rqs.length - 1}
                className="text-slate-400 hover:text-slate-800 disabled:opacity-30 dark:hover:text-slate-100"
                aria-label="Nach unten"
              >
                ▼
              </button>
            </div>
            <input
              type="text"
              value={rq.code}
              onChange={(e) => handleFieldChange(rq, { code: e.target.value })}
              onBlur={() => handleBlurSave(rq)}
              className={`${inputClass} w-24 shrink-0 font-medium`}
            />
            <textarea
              value={rq.question}
              onChange={(e) => handleFieldChange(rq, { question: e.target.value })}
              onBlur={() => handleBlurSave(rq)}
              rows={2}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => handleDelete(rq.id)}
              className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
              aria-label="Löschen"
            >
              ✕
            </button>
          </div>
        ))}

        <form onSubmit={handleAdd} className="mt-2 flex items-start gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <input
            type="text"
            placeholder="Kürzel, z. B. FF1"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className={`${inputClass} w-24 shrink-0`}
          />
          <input
            type="text"
            placeholder="Forschungsfrage"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            + Hinzufügen
          </button>
        </form>
      </div>
    </Card>
  )
}

function ThemenfelderCard() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  function load() {
    return fetchTopics().then(setTopics)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const sortOrder = topics.length > 0 ? Math.max(...topics.map((t) => t.sort_order)) + 1 : 0
    await createTopic({ name: newName.trim(), description: newDescription.trim() || null, sort_order: sortOrder })
    setNewName('')
    setNewDescription('')
    await load()
  }

  function handleFieldChange(topic: Topic, patch: Partial<Topic>) {
    setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, ...patch } : t)))
  }

  async function handleBlurSave(topic: Topic) {
    await updateTopic(topic.id, { name: topic.name, description: topic.description })
  }

  // Gleiches ▲/▼-Tauschmuster wie ForschungsfragenCard (kein Drag&Drop -
  // CLAUDE.md "schlank bleiben", Praezedenzfall auch bei den Abschnitten in
  // der Schreibwerkstatt, Paket 2).
  async function handleMove(topic: Topic, direction: -1 | 1) {
    const sorted = [...topics].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === topic.id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= sorted.length) return
    const other = sorted[swapIndex]
    await Promise.all([
      updateTopic(topic.id, { sort_order: other.sort_order }),
      updateTopic(other.id, { sort_order: topic.sort_order }),
    ])
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Themenfeld wirklich löschen?')) return
    await deleteTopic(id)
    await load()
  }

  if (loading) return <Card title="Themenfelder">Lädt …</Card>

  return (
    <Card title="Themenfelder">
      <div className="flex flex-col gap-2">
        {topics.map((topic, i) => (
          <div key={topic.id} className="flex items-start gap-2">
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => handleMove(topic, -1)}
                disabled={i === 0}
                className="text-slate-400 hover:text-slate-800 disabled:opacity-30 dark:hover:text-slate-100"
                aria-label="Nach oben"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => handleMove(topic, 1)}
                disabled={i === topics.length - 1}
                className="text-slate-400 hover:text-slate-800 disabled:opacity-30 dark:hover:text-slate-100"
                aria-label="Nach unten"
              >
                ▼
              </button>
            </div>
            <input
              type="text"
              value={topic.name}
              onChange={(e) => handleFieldChange(topic, { name: e.target.value })}
              onBlur={() => handleBlurSave(topic)}
              className={`${inputClass} w-48 shrink-0 font-medium`}
            />
            <input
              type="text"
              value={topic.description ?? ''}
              onChange={(e) => handleFieldChange(topic, { description: e.target.value })}
              onBlur={() => handleBlurSave(topic)}
              placeholder="Kurzbeschreibung"
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => handleDelete(topic.id)}
              className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
              aria-label="Löschen"
            >
              ✕
            </button>
          </div>
        ))}

        <form onSubmit={handleAdd} className="mt-2 flex items-start gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={`${inputClass} w-48 shrink-0`}
          />
          <input
            type="text"
            placeholder="Kurzbeschreibung"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            + Hinzufügen
          </button>
        </form>
      </div>
    </Card>
  )
}

function PersonasCard() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newStance, setNewStance] = useState('')
  const [newSystemPrompt, setNewSystemPrompt] = useState('')

  function load() {
    return fetchPersonas().then(setPersonas)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newRole.trim() || !newSystemPrompt.trim()) return
    await createPersona({
      name: newName.trim(),
      role: newRole.trim(),
      stance: newStance.trim() || null,
      system_prompt: newSystemPrompt.trim(),
      active: true,
    })
    setNewName('')
    setNewRole('')
    setNewStance('')
    setNewSystemPrompt('')
    await load()
  }

  function handleFieldChange(persona: Persona, patch: Partial<Persona>) {
    setPersonas((prev) => prev.map((p) => (p.id === persona.id ? { ...p, ...patch } : p)))
  }

  async function handleBlurSave(persona: Persona) {
    await updatePersona(persona.id, {
      name: persona.name,
      role: persona.role,
      stance: persona.stance,
      system_prompt: persona.system_prompt,
    })
  }

  async function handleToggleActive(persona: Persona) {
    const next = !persona.active
    handleFieldChange(persona, { active: next })
    await updatePersona(persona.id, { active: next })
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        'Persona wirklich löschen? Geht nur, solange sie noch keine Entwürfe/Diskussionsbeiträge erzeugt hat - sonst besser deaktivieren.',
      )
    )
      return
    try {
      await deletePersona(id)
      await load()
    } catch (err) {
      alert(`Löschen fehlgeschlagen: ${(err as Error).message}`)
    }
  }

  if (loading) return <Card title="Personas">Lädt …</Card>

  return (
    <Card title="Personas">
      <div className="flex flex-col gap-3">
        {personas.map((persona) => {
          const expanded = expandedId === persona.id
          return (
            <div key={persona.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={persona.name}
                      onChange={(e) => handleFieldChange(persona, { name: e.target.value })}
                      onBlur={() => handleBlurSave(persona)}
                      placeholder="Name"
                      className={`${inputClass} w-48 font-medium`}
                    />
                    <input
                      type="text"
                      value={persona.role}
                      onChange={(e) => handleFieldChange(persona, { role: e.target.value })}
                      onBlur={() => handleBlurSave(persona)}
                      placeholder="Rolle"
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                  <input
                    type="text"
                    value={persona.stance ?? ''}
                    onChange={(e) => handleFieldChange(persona, { stance: e.target.value })}
                    onBlur={() => handleBlurSave(persona)}
                    placeholder="Haltung/Kritikstil"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : persona.id)}
                    className="self-start text-xs text-slate-500 hover:underline dark:text-slate-400"
                  >
                    {expanded ? '– Systemprompt ausblenden' : '+ Systemprompt bearbeiten'}
                  </button>
                  {expanded && (
                    <textarea
                      value={persona.system_prompt}
                      onChange={(e) => handleFieldChange(persona, { system_prompt: e.target.value })}
                      onBlur={() => handleBlurSave(persona)}
                      rows={8}
                      className={`${inputClass} font-mono text-xs`}
                    />
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <input type="checkbox" checked={persona.active} onChange={() => handleToggleActive(persona)} />
                    aktiv
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDelete(persona.id)}
                    className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    aria-label="Löschen"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        <form onSubmit={handleAdd} className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={`${inputClass} w-48`}
            />
            <input
              type="text"
              placeholder="Rolle"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className={`${inputClass} flex-1`}
            />
          </div>
          <input
            type="text"
            placeholder="Haltung/Kritikstil"
            value={newStance}
            onChange={(e) => setNewStance(e.target.value)}
            className={inputClass}
          />
          <textarea
            placeholder="Systemprompt (inkl. Belegpflicht)"
            value={newSystemPrompt}
            onChange={(e) => setNewSystemPrompt(e.target.value)}
            rows={4}
            className={`${inputClass} font-mono text-xs`}
          />
          <button
            type="submit"
            className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            + Persona hinzufügen
          </button>
        </form>
      </div>
    </Card>
  )
}

export function Einstellungen() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Einstellungen</h1>
      <ThemaCard />
      <ForschungsfragenCard />
      <ThemenfelderCard />
      <PersonasCard />
    </div>
  )
}
