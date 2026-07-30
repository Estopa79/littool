import { supabase } from './supabase'

export type IngestPipelineResult = {
  enrich: { complete: number; needs_review: number; fehler: number }
  ranking: { gefunden: number; kein_treffer: number }
  duplicates: { dubletten_markiert: number; geprueft: number }
  embed: { eingebettet: number; remaining: number }
}

// Ein Aufruf = ein Durchlauf Metadaten/Ranking/Duplikate (komplett) + EIN
// Embedding-Batch (max. 100 Chunks) - siehe supabase/functions/run-ingest-pipeline.
// Bei embed.remaining > 0 muss erneut aufgerufen werden (Frontend uebernimmt
// das Pacing, gleiches Voyage-Rate-Limit wie im lokalen Worker).
export async function runIngestPipelineStep(): Promise<IngestPipelineResult> {
  const { data, error } = await supabase.functions.invoke('run-ingest-pipeline', {})
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as IngestPipelineResult
}
