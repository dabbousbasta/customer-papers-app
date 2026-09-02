import { supabase } from './supabase'

function normalizeCustomerName(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
}

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

export async function createCustomer({
  name,
  phone,
  notes
}) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const cleanName = name.trim()

  if (!cleanName) {
    throw new Error('اسم الزبون مطلوب')
  }

  const userId = sessionData.session?.user?.id

  const payload = {
    name: cleanName,
    normalized_name: normalizeCustomerName(cleanName),
    phone: phone.trim() || null,
    notes: notes.trim() || null,
    is_archived: false
  }

  if (userId) {
    payload.created_by = userId
    payload.updated_by = userId
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
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

  const cleanName = name.trim()

  if (!cleanName) {
    throw new Error('اسم الزبون مطلوب')
  }

  const userId = sessionData.session?.user?.id

  const payload = {
    name: cleanName,
    normalized_name: normalizeCustomerName(cleanName),
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