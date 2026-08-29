import { supabase } from './supabase'

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

export async function createPaper({
  customerId,
  paperDate,
  imagePath,
  note,
  totalAmount
}) {
  const user = await getCurrentUser()

  const { data, error } = await supabase
    .from('papers')
    .insert({
      customer_id: customerId,
      paper_date: paperDate,
      image_path: imagePath,
      note: note?.trim() || null,
      total_amount:
        totalAmount === '' || totalAmount === null
          ? null
          : Number(totalAmount),
      status: 'open',
      created_by: user.id,
      updated_by: user.id
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}