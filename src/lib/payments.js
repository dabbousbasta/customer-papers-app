import { supabase } from './supabase'
import { logActivity } from './activity'

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

async function getPaperForActivity(paperId) {
  const { data, error } = await supabase
    .from('papers')
    .select(`
      id,
      customer_id,
      paper_date,
      customers (
        name
      )
    `)
    .eq('id', paperId)
    .single()

  if (error) {
    throw error
  }

  return data
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
    throw new Error(
      'يجب أن تكون قيمة الدفعة أكبر من صفر'
    )
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

  try {
    const paper = await getPaperForActivity(paperId)
    const customerName =
      paper.customers?.name || 'زبون غير معروف'

    await logActivity({
      actionType: 'payment_created',
      entityType: 'payment',
      entityId: data.id,
      customerId: paper.customer_id,
      paperId,
      summary:
        `إضافة دفعة ${numericAmount.toFixed(2)} ` +
        `للزبون: ${customerName}`,
      details: {
        amount: numericAmount,
        payment_date: paymentDate,
        note: data.note,
        paper_date: paper.paper_date
      }
    })
  } catch (activityError) {
    console.error(
      'تعذر تسجيل إضافة الدفعة',
      activityError
    )
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
    throw new Error(
      'يجب أن تكون قيمة الدفعة أكبر من صفر'
    )
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

  try {
    const paper = await getPaperForActivity(
      data.paper_id
    )

    const customerName =
      paper.customers?.name || 'زبون غير معروف'

    await logActivity({
      actionType: 'payment_updated',
      entityType: 'payment',
      entityId: data.id,
      customerId: paper.customer_id,
      paperId: data.paper_id,
      summary:
        `تعديل دفعة ${numericAmount.toFixed(2)} ` +
        `للزبون: ${customerName}`,
      details: {
        amount: numericAmount,
        payment_date: paymentDate,
        note: data.note,
        paper_date: paper.paper_date
      }
    })
  } catch (activityError) {
    console.error(
      'تعذر تسجيل تعديل الدفعة',
      activityError
    )
  }

  return data
}