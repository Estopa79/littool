import { useEffect, useMemo, useState } from 'react'
import { useActiveDocument } from '../lib/ActiveDocumentContext'
import { fetchAllTopics, type TopicOption } from '../lib/qsReview'
import {
  buildTree,
  collectDescendantIds,
  createSection,
  createSectionsFromOutline,
  deleteSection,
  fetchAllResearchQuestions,
  fetchSectionLinks,
  fetchSections,
  moveSection,
  nextSiblingSortOrder,
  parseOutline,
  toggleSectionRq,
  toggleSectionTopic,
  updateSection,
  type Rq,
  type SectionNode,
  type SectionRow,
} from '../lib/sections'
import { ConfirmDialog } from '../components/ConfirmDialog'

function SectionRowItem({
  node,
  depth,
  selectedId,
  expanded,
  onToggleExpand,
  onSelect,
  onAddChild,
  onMove,
  siblingsCount,
  index,
}: {
  node: SectionNode
  depth: number
  selectedId: string | null
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (id: string) => void
  onAddChild: (parentId: string) => void
  onMove: (node: SectionNode, direction: 'up' | 'down') => void
  siblingsCount: number
  index: number
}) {
  const isExpanded = expanded.has(node.id)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm ${
          node.id === selectedId
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={`w-4 shrink-0 text-xs ${hasChildren ? '' : 'invisible'}`}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
        <button type="button" onClick={() => onSelect(node.id)} className="flex-1 truncate text-left">
          {node.number && <span className="mr-1 opacity-70">{node.number}</span>}
          {node.title}
        </button>
        <span className="hidden shrink-0 gap-0.5 group-hover:flex">
          <button
            type="button"
            title="Nach oben"
            disabled={index === 0}
            onClick={() => onMove(node, 'up')}
            className="px-1 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            title="Nach unten"
            disabled={index === siblingsCount - 1}
            onClick={() => onMove(node, 'down')}
            className="px-1 disabled:opacity-30"
          >
            ↓
          </button>
          <button type="button" title="Unterabschnitt hinzufügen" onClick={() => onAddChild(node.id)} className="px-1">
            +
          </button>
        </span>
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child, i) => (
            <SectionRowItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onMove={onMove}
              siblingsCount={node.children.length}
              index={i}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function Schreibwerkstatt() {
  const { activeDocumentId } = useActiveDocument()
  const [sections, setSections] = useState<SectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [allRqs, setAllRqs] = useState<Rq[]>([])
  const [allTopics, setAllTopics] = useState<TopicOption[]>([])
  const [links, setLinks] = useState<{ rqIds: Set<string>; topicIds: Set<string> }>({
    rqIds: new Set(),
    topicIds: new Set(),
  })

  const [numberDraft, setNumberDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')

  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [outlineText, setOutlineText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchAllResearchQuestions().then(setAllRqs)
    fetchAllTopics().then(setAllTopics)
  }, [])

  useEffect(() => {
    if (!activeDocumentId) return
    setLoading(true)
    setSelectedId(null)
    fetchSections(activeDocumentId)
      .then(setSections)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeDocumentId])

  const tree = useMemo(() => buildTree(sections), [sections])
  const selected = sections.find((s) => s.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    setNumberDraft(selected.number ?? '')
    setTitleDraft(selected.title)
    fetchSectionLinks(selected.id).then(setLinks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  async function reload() {
    if (!activeDocumentId) return
    const rows = await fetchSections(activeDocumentId)
    setSections(rows)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddRoot() {
    if (!activeDocumentId) return
    const sortOrder = nextSiblingSortOrder(sections, null)
    const created = await createSection({
      document_id: activeDocumentId,
      parent_id: null,
      number: null,
      title: 'Neuer Abschnitt',
      sort_order: sortOrder,
    })
    await reload()
    setSelectedId(created.id)
  }

  async function handleAddChild(parentId: string) {
    if (!activeDocumentId) return
    const sortOrder = nextSiblingSortOrder(sections, parentId)
    const created = await createSection({
      document_id: activeDocumentId,
      parent_id: parentId,
      number: null,
      title: 'Neuer Unterabschnitt',
      sort_order: sortOrder,
    })
    setExpanded((prev) => new Set(prev).add(parentId))
    await reload()
    setSelectedId(created.id)
  }

  async function handleMove(node: SectionNode, direction: 'up' | 'down') {
    const siblings = sections.filter((s) => s.parent_id === node.parent_id)
    await moveSection(node, siblings, direction)
    await reload()
  }

  async function handleSaveDetail() {
    if (!selected) return
    await updateSection(selected.id, { number: numberDraft.trim() || null, title: titleDraft.trim() || selected.title })
    await reload()
  }

  async function handleReparent(newParentId: string | null) {
    if (!selected) return
    const sortOrder = nextSiblingSortOrder(sections, newParentId)
    await updateSection(selected.id, { parent_id: newParentId, sort_order: sortOrder })
    await reload()
  }

  async function handleToggleRq(rqId: string) {
    if (!selected) return
    const linked = links.rqIds.has(rqId)
    await toggleSectionRq(selected.id, rqId, linked)
    setLinks((prev) => {
      const next = new Set(prev.rqIds)
      if (linked) next.delete(rqId)
      else next.add(rqId)
      return { ...prev, rqIds: next }
    })
  }

  async function handleToggleTopic(topicId: string) {
    if (!selected) return
    const linked = links.topicIds.has(topicId)
    await toggleSectionTopic(selected.id, topicId, linked)
    setLinks((prev) => {
      const next = new Set(prev.topicIds)
      if (linked) next.delete(topicId)
      else next.add(topicId)
      return { ...prev, topicIds: next }
    })
  }

  async function handleImportOutline() {
    if (!activeDocumentId || !outlineText.trim()) return
    setImporting(true)
    setImportMessage(null)
    try {
      const parsed = parseOutline(outlineText)
      const count = await createSectionsFromOutline(activeDocumentId, parsed)
      setOutlineText('')
      setImportMessage(`${count} Abschnitt(e) angelegt.`)
      await reload()
    } catch (err) {
      setImportMessage(`Fehler: ${(err as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const affected = collectDescendantIds(sections, deleteTarget.id)
      await deleteSection(deleteTarget.id)
      if (selectedId && affected.has(selectedId)) setSelectedId(null)
      setDeleteTarget(null)
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  function countDescendants(id: string): number {
    return collectDescendantIds(sections, id).size - 1
  }

  const descendantIdsOfSelected = selected ? collectDescendantIds(sections, selected.id) : new Set<string>()
  const reparentOptions = sections.filter((s) => !descendantIdsOfSelected.has(s.id))

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside
        className={`shrink-0 overflow-y-auto border-slate-200 p-4 dark:border-slate-800 md:w-72 md:border-r ${
          selectedId ? 'hidden md:block' : 'block'
        }`}
      >
        <h1 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Schreibwerkstatt</h1>

        {loading && <p className="text-sm text-slate-400">Lädt …</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">Fehler: {error}</p>}

        <ul className="flex flex-col gap-0.5">
          {tree.map((node, i) => (
            <SectionRowItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onSelect={setSelectedId}
              onAddChild={handleAddChild}
              onMove={handleMove}
              siblingsCount={tree.length}
              index={i}
            />
          ))}
        </ul>

        {!loading && tree.length === 0 && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Noch keine Abschnitte für dieses Dokument.</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAddRoot}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            + Abschnitt
          </button>
          <button
            type="button"
            onClick={() => setQuickEntryOpen((v) => !v)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {quickEntryOpen ? '– Schnellerfassung' : '+ Schnellerfassung'}
          </button>
        </div>

        {quickEntryOpen && (
          <div className="mt-2 rounded-md border border-slate-200 p-2 dark:border-slate-800">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
              Gliederung als eingerückten Text einfügen (Einrückung = Verschachtelung, führende Nummer optional). Wird
              als neue Abschnitte am Ende angehängt, ersetzt nichts Bestehendes.
            </p>
            <textarea
              value={outlineText}
              onChange={(e) => setOutlineText(e.target.value)}
              rows={8}
              placeholder={'1 Einleitung\n2 Grundlagen\n  2.1 Business-IT-Alignment\n  2.2 Digitale Transformation\n3 Methodik'}
              className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              disabled={importing || !outlineText.trim()}
              onClick={handleImportOutline}
              className="mt-2 w-full rounded-md bg-slate-900 px-2 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {importing ? 'Lege an …' : 'In Baum umwandeln'}
            </button>
            {importMessage && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{importMessage}</p>}
          </div>
        )}
      </aside>

      <section className={`flex-1 overflow-y-auto p-4 sm:p-6 ${selectedId ? 'block' : 'hidden md:block'}`}>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="mb-2 text-sm text-slate-500 hover:underline dark:text-slate-400 md:hidden"
        >
          ← Zur Gliederung
        </button>

        {!selected && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Abschnitt links auswählen oder anlegen. Entwurf, Zitat-Pool und Diskussion kommen in den folgenden Paketen
            dieser Phase.
          </p>
        )}

        {selected && (
          <div className="flex max-w-2xl flex-col gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
                Nummer
                <input
                  value={numberDraft}
                  onChange={(e) => setNumberDraft(e.target.value)}
                  placeholder="z. B. 2.3"
                  className="mt-0.5 w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-1 flex-col text-xs text-slate-500 dark:text-slate-400">
                Titel
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="mt-0.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveDetail}
                disabled={numberDraft === (selected.number ?? '') && titleDraft === selected.title}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(selected)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
              >
                🗑 Löschen
              </button>
            </div>

            <label className="flex max-w-xs flex-col text-xs text-slate-500 dark:text-slate-400">
              Übergeordneter Abschnitt
              <select
                value={selected.parent_id ?? ''}
                onChange={(e) => handleReparent(e.target.value || null)}
                className="mt-0.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">— oberste Ebene —</option>
                {reparentOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number ? `${s.number} ` : ''}
                    {s.title}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Forschungsfragen
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {allRqs.map((rq) => {
                  const active = links.rqIds.has(rq.id)
                  return (
                    <button
                      key={rq.id}
                      type="button"
                      onClick={() => handleToggleRq(rq.id)}
                      title={rq.question}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                      }`}
                    >
                      {rq.code}
                    </button>
                  )
                })}
                {allRqs.length === 0 && (
                  <p className="text-xs text-slate-400">Keine Forschungsfragen im Bestand.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Themenfelder
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {allTopics.map((t) => {
                  const active = links.topicIds.has(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleToggleTopic(t.id)}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t.name}
                    </button>
                  )
                })}
                {allTopics.length === 0 && <p className="text-xs text-slate-400">Keine Themenfelder im Bestand.</p>}
              </div>
            </div>
          </div>
        )}
      </section>

      {deleteTarget && (
        <ConfirmDialog
          title="Abschnitt löschen"
          message={
            countDescendants(deleteTarget.id) > 0
              ? `„${deleteTarget.title}" hat ${countDescendants(deleteTarget.id)} Unterabschnitt(e) - diese werden mitgelöscht. Fortfahren?`
              : `„${deleteTarget.title}" wirklich löschen?`
          }
          busy={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
