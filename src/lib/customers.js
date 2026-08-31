import { supabase } from './supabase'

export function normalizeCustomerName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
}

export async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error('يجب تسجيل الدخول أولًا')
  }

  return user
}

export async function getCustomers(search = '') {
  let query = supabase
    .from('customers')
    .select('*')
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
  }

  return query
}

export async function createCustomer({ name, phone, notes }) {
  const user = await getCurrentUser()
  const cleanName = name.trim()

  if (!cleanName) {
    throw new Error('اكتب اسم الزبون')
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: cleanName,
      normalized_name: normalizeCustomerName(cleanName),
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      created_by: user.id,
      updated_by: user.id
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('هذا الاسم موجود مسبقًا')
    }

    throw error
  }

  return data
}

export async function updateCustomer(id, { name, phone, notes }) {
  const user = await getCurrentUser()
  const cleanName = name.trim()

  if (!cleanName) {
    throw new Error('اكتب اسم الزبون')
  }

  const { data, error } = await supabase
    .from('customers')
    .update({
      name: cleanName,
      normalized_name: normalizeCustomerName(cleanName),
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
      updated_by: user.id
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('هذا الاسم موجود مسبقًا')
    }

    throw error
  }

  return data
}