import { supabase } from './supabase'

export type UploadResult = { ok: true } | { ok: false; error: string }

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadSource(file: File): Promise<UploadResult> {
  const title = file.name.replace(/\.pdf$/i, '')

  const { data: source, error: insertError } = await supabase
    .from('sources')
    .insert({ title, status: 'processing' })
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
