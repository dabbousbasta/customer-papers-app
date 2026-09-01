import { supabase } from './supabase'

export async function getCustomers(
  searchText = '',
  options = {}
) {
  const archivedOnly =
    options.archivedOnly === true

  let query = supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true })
    .eq('is_archived', archivedOnly)

  const trimmedSearch = searchText.trim()

  if (trimmedSearch) {
    query = query.ilike(
      'name',
      `%${trimmedSearch}%`
    )
  }

  const { data, error } = await query

  return {
    data: data || [],
    error
  }
}

export async function updateCustomer({
  customerId,
  name,
  phone,
  notes
}) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const userId = sessionData.session?.user?.id

  const payload = {
    name: name.trim(),
    phone: phone.trim() || null,
    notes: notes.trim() || null
  }

  if (userId) {
    payload.updated_by = userId
  }

  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', customerId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function archiveCustomer(customerId) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const userId = sessionData.session?.user?.id

  const payload = {
    is_archived: true
  }

  if (userId) {
    payload.updated_by = userId
  }

  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', customerId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function restoreCustomer(customerId) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const userId = sessionData.session?.user?.id

  const payload = {
    is_archived: false
  }

  if (userId) {
    payload.updated_by = userId
  }

  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', customerId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}