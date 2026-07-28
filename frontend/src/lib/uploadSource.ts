import { supabase } from './supabase'
import { checkAgainstRejections, computeFileHash, type TriageRejection } from './triage'

export type UploadResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; blocked: true; rejection: TriageRejection }

export type UploadOptions = {
  toTriage?: boolean
  // "Trotzdem hochladen" nach einer Verworfen-Warnung - Duplikat-Pruefung
  // fuer diesen einen Versuch gezielt uebergehen, statt eine dauerhafte
  // Sperre aufzuheben (Plan: "hebt die Sperre fuer diesen Fall auf").
  ignoreRejectionMatch?: boolean
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadSource(file: File, opts: UploadOptions = {}): Promise<UploadResult> {
  const title = file.name.replace(/\.pdf$/i, '')

  // Hash wird IMMER berechnet und gespeichert (auch bei uebergangener
  // Duplikat-Pruefung) - sonst waere ein spaeter doch noch verworfener
  // "trotzdem hochgeladener" Kandidat seinerseits nicht per Hash
  // wiedererkennbar.
  let fileHash: string
  if (opts.ignoreRejectionMatch) {
    fileHash = await computeFileHash(file)
  } else {
    const { hash, match } = await checkAgainstRejections(file, title)
    fileHash = hash
    if (match) return { ok: false, blocked: true, rejection: match }
  }

  const { data: source, error: insertError } = await supabase
    .from('sources')
    .insert({ title, status: opts.toTriage ? 'triage' : 'processing', file_hash: fileHash })
    .select('id')
    .single()

  if (insertError || !source) {
    return { ok: false, error: `DB-Eintrag fehlgeschlagen: ${insertError?.message ?? 'unbekannter Fehler'}` }
  }

  const path = `${source.id}/${sanitizeFilename(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(path, file, { contentType: 'application/pdf' })

  if (uploadError) {
    await supabase
      .from('sources')
      .update({ status: 'failed', status_hint: `Upload fehlgeschlagen: ${uploadError.message}` })
      .eq('id', source.id)
    return { ok: false, error: `Upload fehlgeschlagen: ${uploadError.message}` }
  }

  const { error: updateError } = await supabase.from('sources').update({ storage_path: path }).eq('id', source.id)

  if (updateError) {
    return { ok: false, error: `Speicherpfad konnte nicht gespeichert werden: ${updateError.message}` }
  }

  return { ok: true }
}
