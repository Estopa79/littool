import { useState } from 'react'

const TRANSLATION_NOTE = '[Übersetzung durch den Verfasser]'

function CopyButton({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('error')
    }
    setTimeout(() => setState('idle'), 1500)
  }

  return (
    <button type="button" onClick={handleClick} className="text-slate-500 hover:underline dark:text-slate-400">
      {state === 'copied' ? `✓ ${label} kopiert` : state === 'error' ? `✗ ${label} fehlgeschlagen` : `${label} kopieren`}
    </button>
  )
}

// Drei getrennte Kopier-Varianten statt eines einzelnen "Zitation kopieren":
// der Uebersetzungs-Zusatz ist fest eingebaut und nicht abwaehlbar, damit nie
// eine unmarkierte Uebersetzung als woertliches Zitat in der Arbeit landet.
export function CitationCopyButtons({
  original,
  translation,
  paraphrase,
  citation,
}: {
  original: string
  translation: string | null
  paraphrase: string | null
  citation: string
}) {
  return (
    <>
      <CopyButton label="Original" text={`„${original}" ${citation}`} />
      {translation && (
        <CopyButton label="Übersetzung" text={`„${translation}" ${citation} ${TRANSLATION_NOTE}`} />
      )}
      {paraphrase && <CopyButton label="Paraphrase" text={`${paraphrase} ${citation}`} />}
    </>
  )
}
