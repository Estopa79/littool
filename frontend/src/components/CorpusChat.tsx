import { useEffect, useMemo, useState } from 'react'
import {
  createPassageCandidateFromChat,
  fetchChatSession,
  fetchChatSessions,
  renameChatSession,
  sendChatMessage,
  type ChatMessage,
  type ChatSessionSummary,
  type ChatSource,
} from '../lib/chat'
import { fetchPersonas, type Persona } from '../lib/personas'
import { fetchAllTopics, type TopicOption } from '../lib/qsReview'
import { fetchAllResearchQuestions, type Rq } from '../lib/sections'
import { fetchSources, type Source } from '../lib/sources'
import { formatAuthorYear } from '../lib/sourceFormat'
import { STUDY_TYPE_LABEL, type StudyType } from '../lib/methodProfiles'

const STUDY_TYPE_OPTIONS = Object.entries(STUDY_TYPE_LABEL) as Array<[StudyType, string]>

// "Als Zitat-Kandidat übernehmen": der Chat kennt keine Forschungsfrage (er
// ist FF-übergreifend) - der Autor muss sie hier auswählen, bevor die Zeile
// als unbestätigter Kandidat in passages landet (läuft danach durch die
// normale Prüfung aus Phase 3, Paket 6 - "/pruefen").
function CandidatePicker({
  rqs,
  onCancel,
  onConfirm,
}: {
  rqs: Rq[]
  onCancel: () => void
  onConfirm: (rqId: string) => void
}) {
  const [rqId, setRqId] = useState('')
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
      <span className="text-slate-500 dark:text-slate-400">Als Kandidat für:</span>
      <select
        value={rqId}
        onChange={(e) => setRqId(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">Forschungsfrage wählen …</option>
        {rqs.map((rq) => (
          <option key={rq.id} value={rq.id}>
            {rq.code}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!rqId}
        onClick={() => onConfirm(rqId)}
        className="rounded-md bg-slate-900 px-2 py-0.5 font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Übernehmen
      </button>
      <button type="button" onClick={onCancel} className="text-slate-500 hover:underline dark:text-slate-400">
        Abbrechen
      </button>
    </div>
  )
}

function SourcePill({
  source,
  rqs,
  messageKey,
  sourceIndex,
  openKey,
  setOpenKey,
  savedKeys,
  onSaved,
}: {
  source: ChatSource
  rqs: Rq[]
  messageKey: string
  sourceIndex: number
  openKey: string | null
  setOpenKey: (key: string | null) => void
  savedKeys: Set<string>
  onSaved: (key: string) => void
}) {
  const key = `${messageKey}-${sourceIndex}`
  const saved = savedKeys.has(key)

  async function handleConfirm(rqId: string) {
    await createPassageCandidateFromChat({
      sourceId: source.source_id,
      researchQuestionId: rqId,
      page: source.page,
      original: source.original,
      citation: source.citation,
    })
    onSaved(key)
    setOpenKey(null)
  }

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
        <span className="text-slate-600 dark:text-slate-400">{source.citation}</span>
        {saved ? (
          <span className="text-emerald-600 dark:text-emerald-400">✓ als Kandidat übernommen</span>
        ) : (
          <button
            type="button"
            onClick={() => setOpenKey(openKey === key ? null : key)}
            className="text-slate-500 hover:underline dark:text-slate-400"
          >
            Als Zitat-Kandidat übernehmen
          </button>
        )}
      </div>
      {openKey === key && (
        <CandidatePicker rqs={rqs} onCancel={() => setOpenKey(null)} onConfirm={handleConfirm} />
      )}
    </div>
  )
}

export function CorpusChat() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [sessionSearch, setSessionSearch] = useState('')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')

  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState('')
  const [topics, setTopics] = useState<TopicOption[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [rqs, setRqs] = useState<Rq[]>([])
  const [filterTopicId, setFilterTopicId] = useState('')
  const [filterRankingSystem, setFilterRankingSystem] = useState('')
  const [filterStudyType, setFilterStudyType] = useState('')
  const [filterSourceId, setFilterSourceId] = useState('')

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [openCandidateKey, setOpenCandidateKey] = useState<string | null>(null)
  const [savedCandidateKeys, setSavedCandidateKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchChatSessions().then(setSessions)
    fetchPersonas().then(setPersonas)
    fetchAllTopics().then(setTopics)
    fetchSources().then(setSources)
    fetchAllResearchQuestions().then(setRqs)
  }, [])

  async function reloadSessions() {
    const rows = await fetchChatSessions()
    setSessions(rows)
  }

  async function handleSelectSession(id: string) {
    setError(null)
    setMobileView('thread')
    setCurrentSessionId(id)
    const session = await fetchChatSession(id)
    setMessages(session.messages)
    setSelectedPersonaId(session.persona_id ?? '')
  }

  function handleNewSession() {
    setCurrentSessionId(null)
    setMessages([])
    setError(null)
    setMobileView('thread')
  }

  async function handleSend() {
    const question = messageInput.trim()
    if (!question || sending) return
    setSending(true)
    setError(null)
    setMessageInput('')
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    try {
      const result = await sendChatMessage({
        session_id: currentSessionId,
        message: question,
        persona_id: selectedPersonaId || null,
        filter_topic_id: filterTopicId || null,
        filter_ranking_system: filterRankingSystem || null,
        filter_study_type: filterStudyType || null,
        filter_source_id: filterSourceId || null,
      })
      setMessages((prev) => [...prev, result.message])
      if (!currentSessionId) {
        setCurrentSessionId(result.session_id)
      }
      await reloadSessions()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  function startRename(session: ChatSessionSummary) {
    setRenamingId(session.id)
    setRenameValue(session.title ?? '')
  }

  async function confirmRename() {
    if (!renamingId) return
    await renameChatSession(renamingId, renameValue.trim() || 'Unbenannte Unterhaltung')
    setRenamingId(null)
    await reloadSessions()
  }

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => (s.title ?? '').toLowerCase().includes(q))
  }, [sessions, sessionSearch])

  const sessionList = (
    <aside className="flex h-full w-full shrink-0 flex-col overflow-y-auto border-slate-200 p-4 dark:border-slate-800 md:w-72 md:border-r">
      <button
        type="button"
        onClick={handleNewSession}
        className="mb-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
      >
        + Neue Unterhaltung
      </button>
      <input
        type="search"
        value={sessionSearch}
        onChange={(e) => setSessionSearch(e.target.value)}
        placeholder="Verläufe durchsuchen …"
        className="mb-3 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <ul className="flex flex-col gap-1">
        {filteredSessions.map((s) => (
          <li key={s.id}>
            {renamingId === s.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={confirmRename}
                onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            ) : (
              <div
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                  s.id === currentSessionId
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <button type="button" onClick={() => handleSelectSession(s.id)} className="flex-1 truncate text-left">
                  {s.title || 'Unbenannte Unterhaltung'}
                </button>
                <button
                  type="button"
                  onClick={() => startRename(s)}
                  className="hidden shrink-0 opacity-70 group-hover:block"
                  title="Umbenennen"
                >
                  ✎
                </button>
              </div>
            )}
          </li>
        ))}
        {filteredSessions.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Noch keine gespeicherten Unterhaltungen.</p>
        )}
      </ul>
    </aside>
  )

  const thread = (
    <section className="flex h-full min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => setMobileView('list')}
        className="p-4 pb-0 text-left text-sm text-slate-500 hover:underline dark:text-slate-400 md:hidden"
      >
        ← Zu den Verläufen
      </button>

      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        <select
          value={selectedPersonaId}
          onChange={(e) => setSelectedPersonaId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Keine Persona (neutral)</option>
          {personas
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <select
          value={filterTopicId}
          onChange={(e) => setFilterTopicId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Themen</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filterRankingSystem}
          onChange={(e) => setFilterRankingSystem(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Rankings</option>
          <option value="VHB">VHB</option>
          <option value="SJR">SJR</option>
          <option value="CORE">CORE</option>
        </select>
        <select
          value={filterStudyType}
          onChange={(e) => setFilterStudyType(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Studientypen</option>
          {STUDY_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filterSourceId}
          onChange={(e) => setFilterSourceId(e.target.value)}
          className="max-w-[10rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Alle Quellen</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {formatAuthorYear(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Stell eine Fachfrage an den Bestand - die Antwort stützt sich ausschließlich auf bestätigte Zitate/Chunks
            aus deinen Quellen, mit Beleg (Quelle + Seite).
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <li
              key={i}
              className={`max-w-[85%] rounded-lg p-3 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {m.sources.map((s, si) => (
                    <SourcePill
                      key={si}
                      source={s}
                      rqs={rqs}
                      messageKey={`${currentSessionId ?? 'neu'}-${i}`}
                      sourceIndex={si}
                      openKey={openCandidateKey}
                      setOpenKey={setOpenCandidateKey}
                      savedKeys={savedCandidateKeys}
                      onSaved={(key) => setSavedCandidateKeys((prev) => new Set(prev).add(key))}
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="flex gap-2">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={2}
            placeholder="Fachfrage an den Bestand …"
            className="flex-1 rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !messageInput.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {sending ? 'Fragt an …' : 'Senden'}
          </button>
        </div>
      </div>
    </section>
  )

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className={mobileView === 'list' ? 'flex h-full flex-1 md:hidden' : 'hidden'}>{sessionList}</div>
      <div className="hidden h-full md:flex">{sessionList}</div>
      <div className={mobileView === 'thread' ? 'flex h-full flex-1 md:hidden' : 'hidden'}>{thread}</div>
      <div className="hidden h-full min-h-0 flex-1 md:flex">{thread}</div>
    </div>
  )
}
