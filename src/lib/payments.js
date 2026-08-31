import { supabase } from './supabase'

async function getCurrentUser() {
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

export async function createPayment({
  paperId,
  amount,
  paymentDate,
  note
}) {
  const user = await getCurrentUser()
  const numericAmount = Number(amount)

  if (!numericAmount || numericAmount <= 0) {
    throw new Error('يجب أن تكون قيمة الدفعة أكبر من صفر')
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      paper_id: paperId,
      amount: numericAmount,
      payment_date: paymentDate,
      note: note?.trim() || null,
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

export async function updatePayment(
  paymentId,
  {
    amount,
    paymentDate,
    note
  }
) {
  const user = await getCurrentUser()
  const numericAmount = Number(amount)

  if (!numericAmount || numericAmount <= 0) {
    throw new Error('يجب أن تكون قيمة الدفعة أكبر من صفر')
  }

  const { data, error } = await supabase
    .from('payments')
    .update({
      amount: numericAmount,
      payment_date: paymentDate,
      note: note?.trim() || null,
      updated_by: user.id
    })
    .eq('id', paymentId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}