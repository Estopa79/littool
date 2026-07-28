import { supabase } from './supabase'

export type Persona = {
  id: string
  name: string
  role: string
  stance: string | null
  system_prompt: string
  active: boolean
}

export async function fetchPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from('personas')
    .select('id, name, role, stance, system_prompt, active')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Persona[]
}

export async function createPersona(persona: Omit<Persona, 'id'>): Promise<Persona> {
  const { data, error } = await supabase
    .from('personas')
    .insert(persona)
    .select('id, name, role, stance, system_prompt, active')
    .single()
  if (error) throw error
  return data as Persona
}

export async function updatePersona(id: string, patch: Partial<Omit<Persona, 'id'>>): Promise<void> {
  const { error } = await supabase
    .from('personas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deletePersona(id: string): Promise<void> {
  const { error } = await supabase.from('personas').delete().eq('id', id)
  if (error) throw error
}
