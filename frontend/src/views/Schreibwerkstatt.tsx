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
import { fetchConfirmedPassagesPool, filterPassagesForSection, type PoolPassage } from '../lib/sectionPool'
import { fetchPersonas, type Persona } from '../lib/personas'
import {
  adoptDraft,
  buildCopyableDraftText,
  fetchActiveDraftJobForSection,
  fetchDraftPassages,
  fetchDraftsForSection,
  fetchJob,
  requestDraftGeneration,
  type Draft,
  type DraftJob,
} from '../lib/drafts'
import {
  fetchDiscussionEntries,
  postUserComment,
  requestReaction,
  reviewOwnText,
  type DiscussionEntry,
} from '../lib/discussion'
import { cancelJob, fetchActiveDebateJobForSection, requestDebate } from '../lib/debate'
import { formatAuthorYear } from '../lib/sourceFormat'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CitationCopyButtons } from '../components/CitationCopyButtons'
import { UsedCitationCheckbox } from '../components/UsedCitationCheckbox'
import { DraftNoticeBanner } from '../components/DraftNoticeBanner'
import { TransferSectionDialog } from '../components/TransferSectionDialog'

const EMPTY_SET: Set<string> = new Set()
const JOB_POLL_INTERVAL_MS = 2000
type MobileTab = 'entwurf' | 'pool' | 'diskussion'

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

// Rendert Fliesstext mit [n]-Markern als klickbare Chips; Marker ohne
// bekannte Zuordnung (sollte dank Belegpruefung im Backend nicht vorkommen)
// bleiben reiner Text statt eine kaputte Referenz anklickbar zu machen.
function DraftMarkerText({
  text,
  markerToPassageId,
  onMarkerClick,
}: {
  text: string
  markerToPassageId: Map<number, string>
  onMarkerClick: (passageId: string) => void
}) {
  const parts = text.split(/(\[\d+\])/g)
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        const passageId = m ? markerToPassageId.get(Number(m[1])) : undefined
        if (!m || !passageId) return <span key={i}>{part}</span>
        return (
          <button
            key={i}
            type="button"
            onClick={() => onMarkerClick(passageId)}
            title="Zitat im Pool hervorheben"
            className="mx-0.5 rounded bg-slate-200 px-1 align-baseline text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {part}
          </button>
        )
      })}
    </p>
  )
}

function EntwurfColumn({
  pendingCount,
  personas,
  selectedPersonaId,
  onSelectPersona,
  onRequestDraft,
  requesting,
  requestError,
  activeJob,
  drafts,
  selectedVersion,
  onSelectVersion,
  currentDraft,
  markerToPassageId,
  onMarkerClick,
  showDiff,
  onToggleDiff,
  previousDraft,
  passageCitations,
  onAdoptDraft,
  adopting,
  adoptError,
}: {
  pendingCount: number
  personas: Persona[]
  selectedPersonaId: string
  onSelectPersona: (id: string) => void
  onRequestDraft: () => void
  requesting: boolean
  requestError: string | null
  activeJob: DraftJob | null
  drafts: Draft[]
  selectedVersion: number | null
  onSelectVersion: (version: number) => void
  currentDraft: Draft | null
  markerToPassageId: Map<number, string>
  onMarkerClick: (passageId: string) => void
  showDiff: boolean
  onToggleDiff: () => void
  previousDraft: Draft | null
  passageCitations: Map<string, string>
  onAdoptDraft: () => void
  adopting: boolean
  adoptError: string | null
}) {
  const jobRunning = activeJob && (activeJob.status === 'pending' || activeJob.status === 'running')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleCopyText() {
    if (!currentDraft) return
    try {
      const text = buildCopyableDraftText(currentDraft.text, markerToPassageId, passageCitations)
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 1500)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Entwurf</h3>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={selectedPersonaId}
          onChange={(e) => onSelectPersona(e.target.value)}
          disabled={!!jobRunning}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Persona wählen …</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRequestDraft}
          disabled={!!jobRunning || requesting || !selectedPersonaId || pendingCount === 0}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          Entwurf anfordern
        </button>
      </div>

      {pendingCount === 0 && !jobRunning && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Erst im Zitat-Pool Zitate für den Entwurf auswählen, dann Persona wählen und anfordern.
        </p>
      )}
      {pendingCount > 0 && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          {pendingCount} Zitat(e) aus dem Pool ausgewählt.
        </p>
      )}

      {jobRunning && (
        <p className="mb-3 rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Entwurf wird erstellt … ({activeJob!.progress}%) - läuft im Hintergrund, die Seite kann verlassen werden.
        </p>
      )}
      {activeJob?.status === 'failed' && (
        <p className="mb-3 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          Entwurf fehlgeschlagen: {activeJob.error}
        </p>
      )}
      {requestError && (
        <p className="mb-3 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {requestError}
        </p>
      )}

      {drafts.length === 0 && !jobRunning && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Noch kein Entwurf für diesen Abschnitt.</p>
      )}

      {drafts.length > 0 && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              Version
              <select
                value={selectedVersion ?? ''}
                onChange={(e) => onSelectVersion(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {drafts.map((d) => (
                  <option key={d.id} value={d.version}>
                    v{d.version}
                  </option>
                ))}
              </select>
            </label>
            {previousDraft && (
              <button type="button" onClick={onToggleDiff} className="text-slate-500 hover:underline dark:text-slate-400">
                {showDiff ? 'Diff ausblenden' : `Diff zu v${previousDraft.version} anzeigen`}
              </button>
            )}
            {currentDraft?.status === 'adopted' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                ✓ Arbeitsstand
              </span>
            )}
          </div>

          {currentDraft && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onAdoptDraft}
                disabled={adopting || currentDraft.status === 'adopted'}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Markiert diese Version als Arbeitsstand und hakt alle darin per Marker zitierten Passagen im aktiven Dokument an"
              >
                {adopting ? 'Übernimmt …' : 'Version übernehmen'}
              </button>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-slate-500 hover:underline dark:text-slate-400"
                title="Entwurf mit ausformulierten APA-Zitationen statt Markern kopieren"
              >
                {copyState === 'copied' ? '✓ kopiert' : copyState === 'error' ? '✗ fehlgeschlagen' : 'Text kopieren'}
              </button>
            </div>
          )}
          {adoptError && (
            <p className="mb-3 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {adoptError}
            </p>
          )}

          {currentDraft && !showDiff && (
            <DraftMarkerText
              text={currentDraft.text}
              markerToPassageId={markerToPassageId}
              onMarkerClick={onMarkerClick}
            />
          )}

          {currentDraft && showDiff && previousDraft && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">v{previousDraft.version} (alt)</p>
                <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">{previousDraft.text}</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">v{currentDraft.version} (neu)</p>
                <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">{currentDraft.text}</p>
              </div>
            </div>
          )}

          {currentDraft && currentDraft.unverified_claims.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950">
              <p className="mb-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                ⚠ Unbelegte Aussagen ({currentDraft.unverified_claims.length})
              </p>
              <ul className="flex flex-col gap-1 text-xs text-amber-800 dark:text-amber-300">
                {currentDraft.unverified_claims.map((c, i) => (
                  <li key={i}>
                    „{c.auszug}" - {c.grund}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DiskussionColumn({
  currentDraft,
  entries,
  loadingEntries,
  commentText,
  onCommentChange,
  onPostComment,
  postingComment,
  personas,
  selectedPersonaId,
  onSelectPersona,
  onRequestReaction,
  requestingReaction,
  reactionError,
  reviewText,
  onReviewTextChange,
  onSubmitReview,
  submittingReview,
  reviewError,
  debatePersonaIds,
  onToggleDebatePersona,
  debateRoundLimit,
  onDebateRoundLimitChange,
  onStartDebate,
  debateRequesting,
  debateError,
  debateJob,
  onCancelDebate,
}: {
  currentDraft: Draft | null
  entries: DiscussionEntry[]
  loadingEntries: boolean
  commentText: string
  onCommentChange: (v: string) => void
  onPostComment: () => void
  postingComment: boolean
  personas: Persona[]
  selectedPersonaId: string
  onSelectPersona: (id: string) => void
  onRequestReaction: () => void
  requestingReaction: boolean
  reactionError: string | null
  reviewText: string
  onReviewTextChange: (v: string) => void
  onSubmitReview: () => void
  submittingReview: boolean
  reviewError: string | null
  debatePersonaIds: Set<string>
  onToggleDebatePersona: (id: string) => void
  debateRoundLimit: number
  onDebateRoundLimitChange: (n: number) => void
  onStartDebate: () => void
  debateRequesting: boolean
  debateError: string | null
  debateJob: DraftJob | null
  onCancelDebate: () => void
}) {
  const debateJobRunning = debateJob && (debateJob.status === 'pending' || debateJob.status === 'running')
  const debateJobFinishingCancel = debateJob && debateJob.status === 'cancelled' && debateJob.progress < 100
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Diskussion
      </h3>

      <div className="mb-3">
        <select
          value={selectedPersonaId}
          onChange={(e) => onSelectPersona(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Persona wählen …</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!currentDraft && (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Noch kein Entwurf für diesen Abschnitt - der Diskussionsfaden startet, sobald einer vorliegt (per „Entwurf
          anfordern" in der Entwurf-Spalte oder unten per „Eigenen Text prüfen").
        </p>
      )}

      {currentDraft && (
        <>
          {loadingEntries && <p className="text-sm text-slate-400">Lädt …</p>}
          <ul className="mb-3 flex flex-col gap-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className={`rounded-md border p-2 text-xs ${
                  e.author_type === 'system'
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <p
                  className={`mb-1 font-medium ${
                    e.author_type === 'system'
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {e.author_type === 'user' ? 'Du' : e.author_type === 'system' ? '📋 Kernpunkte der Debatte' : (e.persona_name ?? 'Persona')}
                </p>
                <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">{e.text}</p>
              </li>
            ))}
          </ul>
          {!loadingEntries && entries.length === 0 && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Noch keine Diskussionsbeiträge zu dieser Version.</p>
          )}

          <div className="mb-3 flex flex-col gap-1.5">
            <textarea
              value={commentText}
              onChange={(e) => onCommentChange(e.target.value)}
              rows={2}
              placeholder="Eigener Kommentar …"
              className="rounded-md border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={onPostComment}
              disabled={postingComment || !commentText.trim()}
              className="self-start rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Kommentar hinzufügen
            </button>
          </div>

          <button
            type="button"
            onClick={onRequestReaction}
            disabled={requestingReaction || !selectedPersonaId}
            className="mb-3 self-start rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {requestingReaction ? 'Fragt an …' : 'Reaktion anfordern'}
          </button>
          {reactionError && (
            <p className="mb-3 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {reactionError}
            </p>
          )}
        </>
      )}

      <details className="mb-3 rounded-md border border-slate-200 p-2 dark:border-slate-800">
        <summary className="cursor-pointer select-none text-xs font-medium text-slate-600 dark:text-slate-400">
          Debatte starten
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <p className="text-slate-500 dark:text-slate-400">
            2-3 Personas auswählen, die autonom über mehrere Runden den aktuellen Entwurf diskutieren.
          </p>
          <div className="flex flex-wrap gap-2">
            {personas.map((p) => (
              <label key={p.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={debatePersonaIds.has(p.id)}
                  onChange={() => onToggleDebatePersona(p.id)}
                  disabled={!!debateJobRunning || (!debatePersonaIds.has(p.id) && debatePersonaIds.size >= 3)}
                />
                {p.name}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-1.5">
            Runden
            <input
              type="number"
              min={1}
              max={5}
              value={debateRoundLimit}
              onChange={(e) => onDebateRoundLimitChange(Number(e.target.value))}
              disabled={!!debateJobRunning}
              className="w-14 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={onStartDebate}
            disabled={
              !currentDraft ||
              !!debateJobRunning ||
              debateRequesting ||
              debatePersonaIds.size < 2 ||
              debatePersonaIds.size > 3
            }
            className="self-start rounded-md bg-slate-900 px-2 py-1 font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            Debatte starten
          </button>
          {!currentDraft && <p className="text-slate-400">Erst einen Entwurf anfordern oder eigenen Text prüfen.</p>}

          {debateJobRunning && (
            <div className="rounded-md bg-slate-100 px-2 py-1.5 dark:bg-slate-800">
              <p className="text-slate-600 dark:text-slate-300">
                Debatte läuft … ({debateJob!.progress}%) - läuft im Hintergrund, die Seite kann verlassen werden.
              </p>
              <button type="button" onClick={onCancelDebate} className="mt-1 text-red-600 hover:underline dark:text-red-400">
                Abbrechen
              </button>
            </div>
          )}
          {debateJobFinishingCancel && (
            <p className="text-slate-500 dark:text-slate-400">
              Wird abgebrochen … (laufende Runde wird noch zu Ende geführt, danach folgt die Zusammenfassung)
            </p>
          )}
          {debateJob?.status === 'cancelled' && debateJob.progress >= 100 && (
            <p className="text-slate-500 dark:text-slate-400">Debatte abgebrochen - Zusammenfassung wurde trotzdem erstellt.</p>
          )}
          {debateJob?.status === 'failed' && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700 dark:bg-red-950 dark:text-red-300">
              Debatte fehlgeschlagen: {debateJob.error}
            </p>
          )}
          {debateError && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700 dark:bg-red-950 dark:text-red-300">{debateError}</p>
          )}
        </div>
      </details>

      <div className="mt-auto border-t border-slate-200 pt-3 dark:border-slate-800">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Eigenen Text prüfen
        </h4>
        <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
          Eigenen (nicht KI-generierten) Text einfügen - legt eine neue Version an und lässt die oben gewählte Persona
          ihn beurteilen (passt er zum Abschnitt, ist er durch Pool-Zitate gedeckt, was fehlt).
        </p>
        <textarea
          value={reviewText}
          onChange={(e) => onReviewTextChange(e.target.value)}
          rows={4}
          placeholder="Eigenen Text hier einfügen …"
          className="mb-1.5 w-full rounded-md border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={onSubmitReview}
          disabled={submittingReview || !reviewText.trim() || !selectedPersonaId}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {submittingReview ? 'Prüft …' : 'Eigenen Text prüfen'}
        </button>
        {reviewError && (
          <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {reviewError}
          </p>
        )}
      </div>
    </div>
  )
}

function PoolPassageCard({
  passage,
  selected,
  onToggleSelect,
  highlighted,
}: {
  passage: PoolPassage
  selected: boolean
  onToggleSelect: () => void
  highlighted: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      data-passage-id={passage.id}
      className={`rounded-lg border p-2 text-xs ${
        highlighted
          ? 'border-slate-500 ring-2 ring-slate-400 dark:border-slate-400 dark:ring-slate-500'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {formatAuthorYear(passage)}, S. {passage.page}
        </span>
        <label
          className="flex shrink-0 items-center gap-1 text-slate-500 dark:text-slate-400"
          title="Für den nächsten Entwurf auswählen"
        >
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          Entwurf
        </label>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left italic text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {expanded ? `„${passage.original}"` : `„${passage.original.slice(0, 70)}${passage.original.length > 70 ? ' …' : ''}"`}
      </button>
      {expanded && passage.translation && <p className="mt-1 text-slate-600 dark:text-slate-400">DE: {passage.translation}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-slate-400 dark:text-slate-500">{passage.citation}</span>
        <CitationCopyButtons
          original={passage.original}
          translation={passage.translation}
          paraphrase={passage.paraphrase}
          citation={passage.citation}
        />
        <UsedCitationCheckbox passageId={passage.id} />
      </div>
    </li>
  )
}

function ZitatPoolColumn({
  filtered,
  all,
  showAll,
  onToggleShowAll,
  selectedIds,
  onToggleSelect,
  highlightedId,
}: {
  filtered: PoolPassage[]
  all: PoolPassage[]
  showAll: boolean
  onToggleShowAll: () => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  highlightedId: string | null
}) {
  const list = showAll ? all : filtered
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Zitat-Pool</h3>
        <button
          type="button"
          onClick={onToggleShowAll}
          className="text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          {showAll ? 'nur passende' : 'alle anzeigen'}
        </button>
      </div>

      {list.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {showAll
            ? 'Noch keine bestätigten Zitate im Bestand.'
            : 'Keine passenden Zitate zu den FFs/Themen dieses Abschnitts - Abschnitt verknüpfen oder „alle anzeigen".'}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <PoolPassageCard
            key={p.id}
            passage={p}
            selected={selectedIds.has(p.id)}
            onToggleSelect={() => onToggleSelect(p.id)}
            highlighted={highlightedId === p.id}
          />
        ))}
      </ul>
    </div>
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

  const [pool, setPool] = useState<PoolPassage[]>([])
  const [showAllPool, setShowAllPool] = useState(false)
  const [draftSelections, setDraftSelections] = useState<Record<string, Set<string>>>({})
  const [mobileTab, setMobileTab] = useState<MobileTab>('entwurf')
  const [highlightedPassageId, setHighlightedPassageId] = useState<string | null>(null)

  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [draftPassages, setDraftPassages] = useState<Map<number, string>>(new Map())
  const [showDiff, setShowDiff] = useState(false)

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeJob, setActiveJob] = useState<DraftJob | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [discussionEntries, setDiscussionEntries] = useState<DiscussionEntry[]>([])
  const [loadingDiscussion, setLoadingDiscussion] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [requestingReaction, setRequestingReaction] = useState(false)
  const [reactionError, setReactionError] = useState<string | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const [debatePersonaIds, setDebatePersonaIds] = useState<Set<string>>(new Set())
  const [debateRoundLimit, setDebateRoundLimit] = useState(3)
  const [debateJobId, setDebateJobId] = useState<string | null>(null)
  const [debateJob, setDebateJob] = useState<DraftJob | null>(null)
  const [debateRequesting, setDebateRequesting] = useState(false)
  const [debateError, setDebateError] = useState<string | null>(null)

  const [adopting, setAdopting] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferMessage, setTransferMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchAllResearchQuestions().then(setAllRqs)
    fetchAllTopics().then(setAllTopics)
    fetchConfirmedPassagesPool().then(setPool)
    fetchPersonas().then(setPersonas)
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
    setShowAllPool(false)
    setShowDiff(false)
    setRequestError(null)
    setHighlightedPassageId(null)
    setCommentText('')
    setReviewText('')
    setReactionError(null)
    setReviewError(null)
    setDebatePersonaIds(new Set())
    setDebateRoundLimit(3)
    setDebateError(null)
    setAdoptError(null)
    setTransferMessage(null)
    fetchSectionLinks(selected.id).then(setLinks)

    fetchDraftsForSection(selected.id).then((rows) => {
      setDrafts(rows)
      setSelectedVersion(rows[0]?.version ?? null)
    })
    fetchActiveDraftJobForSection(selected.id).then((job) => {
      setActiveJob(job)
      setActiveJobId(job?.id ?? null)
    })
    fetchActiveDebateJobForSection(selected.id).then((job) => {
      setDebateJob(job)
      setDebateJobId(job?.id ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  // Hintergrund-Job pollen, bis er fertig/fehlgeschlagen ist - ueberlebt einen
  // Abschnittswechsel oder das Verlassen der Seite (beim Wiederkommen greift
  // die fetchActiveDraftJobForSection-Abfrage oben erneut).
  useEffect(() => {
    if (!activeJobId) return
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const job = await fetchJob(activeJobId)
        if (cancelled) return
        setActiveJob(job)
        if (job.status === 'done' || job.status === 'failed') {
          setActiveJobId(null)
          if (job.status === 'done' && selected) {
            const rows = await fetchDraftsForSection(selected.id)
            setDrafts(rows)
            setSelectedVersion(rows[0]?.version ?? null)
          }
        }
      } catch {
        // Netzwerkfehler beim Pollen - naechster Tick versucht es erneut.
      }
    }, JOB_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId])

  // Gleiches Polling-Muster fuer die Debatte (Paket 7) - separater Job, kann
  // parallel zu einem Entwurfs-Job laufen. Nach Abschluss/Abbruch werden nur
  // die Diskussionsbeitraege neu geladen (die Debatte legt keine neue
  // Entwurfsversion an).
  //
  // Wichtig: 'cancelled' allein ist NICHT terminal - cancelJob() setzt den
  // Status sofort vom Frontend aus, aber der Hintergrund-Job prueft das nur
  // vor der naechsten Runde, beendet die laufende Runde noch reguaer und
  // schreibt danach erst die Abschluss-Zusammenfassung + progress:100. Ein
  // Poll, der genau in dieser Zwischenzeit landet, wuerde sonst zu frueh
  // aufhoeren und die Zusammenfassung verpassen (live gegen die echte
  // Function beobachtet).
  useEffect(() => {
    if (!debateJobId) return
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const job = await fetchJob(debateJobId)
        if (cancelled) return
        setDebateJob(job)
        const finished = job.status === 'done' || job.status === 'failed' || (job.status === 'cancelled' && job.progress >= 100)
        if (finished) {
          setDebateJobId(null)
          if (job.status !== 'failed') {
            await reloadDiscussion()
          }
        }
      } catch {
        // Netzwerkfehler beim Pollen - naechster Tick versucht es erneut.
      }
    }, JOB_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateJobId])

  const currentDraft = drafts.find((d) => d.version === selectedVersion) ?? null
  const previousDraft =
    currentDraft ? drafts.find((d) => d.version === currentDraft.version - 1) ?? null : null

  useEffect(() => {
    if (!currentDraft) {
      setDraftPassages(new Map())
      return
    }
    fetchDraftPassages(currentDraft.id).then((rows) => {
      setDraftPassages(new Map(rows.map((r) => [r.marker, r.passage_id])))
    })
  }, [currentDraft?.id])

  useEffect(() => {
    if (!currentDraft) {
      setDiscussionEntries([])
      return
    }
    setLoadingDiscussion(true)
    fetchDiscussionEntries(currentDraft.id)
      .then(setDiscussionEntries)
      .finally(() => setLoadingDiscussion(false))
  }, [currentDraft?.id])

  async function reloadDiscussion() {
    if (!currentDraft) return
    const rows = await fetchDiscussionEntries(currentDraft.id)
    setDiscussionEntries(rows)
  }

  async function handlePostComment() {
    if (!selected || !currentDraft || !commentText.trim()) return
    setPostingComment(true)
    try {
      await postUserComment(selected.id, currentDraft.id, commentText.trim())
      setCommentText('')
      await reloadDiscussion()
    } finally {
      setPostingComment(false)
    }
  }

  async function handleRequestReaction() {
    if (!selected || !currentDraft || !selectedPersonaId) return
    setRequestingReaction(true)
    setReactionError(null)
    try {
      await requestReaction({ section_id: selected.id, draft_id: currentDraft.id, persona_id: selectedPersonaId })
      await reloadDiscussion()
    } catch (err) {
      setReactionError((err as Error).message)
    } finally {
      setRequestingReaction(false)
    }
  }

  async function handleSubmitReview() {
    if (!selected || !selectedPersonaId || !reviewText.trim()) return
    setSubmittingReview(true)
    setReviewError(null)
    try {
      const result = await reviewOwnText({
        section_id: selected.id,
        text: reviewText.trim(),
        persona_id: selectedPersonaId,
      })
      setReviewText('')
      const rows = await fetchDraftsForSection(selected.id)
      setDrafts(rows)
      setSelectedVersion(result.draft.version)
    } catch (err) {
      setReviewError((err as Error).message)
    } finally {
      setSubmittingReview(false)
    }
  }

  function toggleDebatePersona(id: string) {
    setDebatePersonaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 3) next.add(id)
      return next
    })
  }

  async function handleStartDebate() {
    if (!selected || !currentDraft) return
    const personaIds = Array.from(debatePersonaIds)
    if (personaIds.length < 2 || personaIds.length > 3) return
    setDebateRequesting(true)
    setDebateError(null)
    try {
      const jobId = await requestDebate({
        section_id: selected.id,
        draft_id: currentDraft.id,
        persona_ids: personaIds,
        round_limit: debateRoundLimit,
      })
      setDebateJobId(jobId)
      setDebateJob({ id: jobId, type: 'debate', status: 'pending', progress: 0, result: null, error: null, payload: {} })
    } catch (err) {
      setDebateError((err as Error).message)
    } finally {
      setDebateRequesting(false)
    }
  }

  async function handleCancelDebate() {
    if (!debateJobId) return
    await cancelJob(debateJobId)
  }

  async function handleAdoptDraft() {
    if (!selected || !currentDraft || !activeDocumentId) return
    setAdopting(true)
    setAdoptError(null)
    try {
      await adoptDraft(currentDraft.id, selected.id, activeDocumentId)
      const rows = await fetchDraftsForSection(selected.id)
      setDrafts(rows)
    } catch (err) {
      setAdoptError((err as Error).message)
    } finally {
      setAdopting(false)
    }
  }

  const passageCitations = useMemo(() => new Map(pool.map((p) => [p.id, p.citation])), [pool])

  const filteredPool = useMemo(() => filterPassagesForSection(pool, links), [pool, links])

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

  function toggleDraftSelection(sectionId: string, passageId: string) {
    setDraftSelections((prev) => {
      const current = new Set(prev[sectionId] ?? [])
      if (current.has(passageId)) current.delete(passageId)
      else current.add(passageId)
      return { ...prev, [sectionId]: current }
    })
  }

  function handleMarkerClick(passageId: string) {
    if (!filteredPool.some((p) => p.id === passageId) && !showAllPool) {
      setShowAllPool(true)
    }
    setHighlightedPassageId(passageId)
    requestAnimationFrame(() => {
      document.querySelector(`[data-passage-id="${passageId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  async function handleRequestDraft() {
    if (!selected || !selectedPersonaId) return
    const passageIds = Array.from(draftSelections[selected.id] ?? EMPTY_SET)
    if (passageIds.length === 0) return
    setRequesting(true)
    setRequestError(null)
    try {
      const jobId = await requestDraftGeneration({
        section_id: selected.id,
        persona_id: selectedPersonaId,
        passage_ids: passageIds,
      })
      setActiveJobId(jobId)
      setActiveJob({ id: jobId, type: 'draft_generation', status: 'pending', progress: 0, result: null, error: null, payload: {} })
    } catch (err) {
      setRequestError((err as Error).message)
    } finally {
      setRequesting(false)
    }
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
  const selectedPoolIds = selected ? (draftSelections[selected.id] ?? EMPTY_SET) : EMPTY_SET

  const entwurfColumn = selected && (
    <EntwurfColumn
      pendingCount={selectedPoolIds.size}
      personas={personas.filter((p) => p.active)}
      selectedPersonaId={selectedPersonaId}
      onSelectPersona={setSelectedPersonaId}
      onRequestDraft={handleRequestDraft}
      requesting={requesting}
      requestError={requestError}
      activeJob={activeJob}
      drafts={drafts}
      selectedVersion={selectedVersion}
      onSelectVersion={setSelectedVersion}
      currentDraft={currentDraft}
      markerToPassageId={draftPassages}
      onMarkerClick={handleMarkerClick}
      showDiff={showDiff}
      onToggleDiff={() => setShowDiff((v) => !v)}
      previousDraft={previousDraft}
      passageCitations={passageCitations}
      onAdoptDraft={handleAdoptDraft}
      adopting={adopting}
      adoptError={adoptError}
    />
  )

  const zitatPoolColumn = (
    <ZitatPoolColumn
      filtered={filteredPool}
      all={pool}
      showAll={showAllPool}
      onToggleShowAll={() => setShowAllPool((v) => !v)}
      selectedIds={selectedPoolIds}
      onToggleSelect={(id) => selected && toggleDraftSelection(selected.id, id)}
      highlightedId={highlightedPassageId}
    />
  )

  const diskussionColumn = (
    <DiskussionColumn
      currentDraft={currentDraft}
      entries={discussionEntries}
      loadingEntries={loadingDiscussion}
      commentText={commentText}
      onCommentChange={setCommentText}
      onPostComment={handlePostComment}
      postingComment={postingComment}
      personas={personas.filter((p) => p.active)}
      selectedPersonaId={selectedPersonaId}
      onSelectPersona={setSelectedPersonaId}
      onRequestReaction={handleRequestReaction}
      requestingReaction={requestingReaction}
      reactionError={reactionError}
      reviewText={reviewText}
      onReviewTextChange={setReviewText}
      onSubmitReview={handleSubmitReview}
      submittingReview={submittingReview}
      reviewError={reviewError}
      debatePersonaIds={debatePersonaIds}
      onToggleDebatePersona={toggleDebatePersona}
      debateRoundLimit={debateRoundLimit}
      onDebateRoundLimitChange={setDebateRoundLimit}
      onStartDebate={handleStartDebate}
      debateRequesting={debateRequesting}
      debateError={debateError}
      debateJob={debateJob}
      onCancelDebate={handleCancelDebate}
    />
  )

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

      <section className={`flex min-h-0 flex-1 flex-col ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {!selected && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400 sm:p-6">
            Abschnitt links auswählen oder anlegen.
          </p>
        )}

        {selected && (
          <>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="p-4 pb-0 text-left text-sm text-slate-500 hover:underline dark:text-slate-400 md:hidden"
            >
              ← Zur Gliederung
            </button>

            <div className="shrink-0 p-4 pb-3 sm:px-6 sm:pt-5">
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
                <button
                  type="button"
                  onClick={() => {
                    setTransferMessage(null)
                    setTransferDialogOpen(true)
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  → Anderes Dokument
                </button>
              </div>
              {transferMessage && (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{transferMessage}</p>
              )}

              <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer select-none">Übergeordneter Abschnitt, Forschungsfragen, Themenfelder</summary>
                <div className="mt-2 flex flex-col gap-3">
                  <label className="flex max-w-xs flex-col">
                    Übergeordneter Abschnitt
                    <select
                      value={selected.parent_id ?? ''}
                      onChange={(e) => handleReparent(e.target.value || null)}
                      className="mt-0.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                    <h3 className="mb-1 font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
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
                            className={`rounded-full px-2 py-0.5 ${
                              active
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                          >
                            {rq.code}
                          </button>
                        )
                      })}
                      {allRqs.length === 0 && <p className="text-slate-400">Keine Forschungsfragen im Bestand.</p>}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-1 font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
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
                            className={`rounded-full px-2 py-0.5 ${
                              active
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                          >
                            {t.name}
                          </button>
                        )
                      })}
                      {allTopics.length === 0 && <p className="text-slate-400">Keine Themenfelder im Bestand.</p>}
                    </div>
                  </div>
                </div>
              </details>
            </div>

            <DraftNoticeBanner />

            {/* Desktop: drei Spalten nebeneinander */}
            <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-3 md:divide-x md:divide-slate-200 dark:md:divide-slate-800">
              {entwurfColumn}
              {zitatPoolColumn}
              {diskussionColumn}
            </div>

            {/* Mobil: Tabs statt Spalten */}
            <div className="flex min-h-0 flex-1 flex-col md:hidden">
              <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-800">
                {(
                  [
                    { key: 'entwurf', label: 'Entwurf' },
                    { key: 'pool', label: 'Zitat-Pool' },
                    { key: 'diskussion', label: 'Diskussion' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setMobileTab(tab.key)}
                    className={`flex-1 px-2 py-2 text-sm font-medium ${
                      mobileTab === tab.key
                        ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {mobileTab === 'entwurf' && entwurfColumn}
                {mobileTab === 'pool' && zitatPoolColumn}
                {mobileTab === 'diskussion' && diskussionColumn}
              </div>
            </div>
          </>
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

      {transferDialogOpen && selected && (
        <TransferSectionDialog
          section={selected}
          onClose={() => setTransferDialogOpen(false)}
          onTransferred={() => {
            setTransferDialogOpen(false)
            setTransferMessage('Abschnitt übernommen.')
          }}
        />
      )}
    </div>
  )
}
