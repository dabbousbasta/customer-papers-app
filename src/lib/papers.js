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
    .select(`
      *,
      customers (
        id,
        name,
        phone
      )
    `)
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function getPapers() {
  const { data, error } = await supabase
    .from('papers')
    .select(`
      *,
      customers (
        id,
        name,
        phone
      ),
      payments (
        id,
        amount,
        payment_date,
        note,
        is_archived
      )
    `)
    .neq('status', 'archived')
    .order('paper_date', { ascending: false })

  if (error) {
    throw error
  }

  return data || []
}

export async function updatePaperImagePath(
  paperId,
  imagePath
) {
  const user = await getCurrentUser()

  const { data, error } = await supabase
    .from('papers')
    .update({
      image_path: imagePath,
      updated_by: user.id
    })
    .eq('id', paperId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function closePaper(paperId) {
  const { data, error } = await supabase.rpc(
    'close_paper',
    {
      p_paper_id: paperId
    }
  )

  if (error) {
    throw error
  }

  return data
}

export async function reopenPaper(paperId) {
  const { data, error } = await supabase.rpc(
    'reopen_paper',
    {
      p_paper_id: paperId
    }
  )

  if (error) {
    throw error
  }

  return data
}

export async function archivePaper(
  paperId,
  reason
) {
  const { data, error } = await supabase.rpc(
    'archive_paper',
    {
      p_paper_id: paperId,
      p_reason: reason || null
    }
  )

  if (error) {
    throw error
  }

  return data
}

export function calculateBalance(totalAmount, payments = []) {
  if (totalAmount === null || totalAmount === undefined) {
    return null
  }

  const paid = payments
    .filter((payment) => !payment.is_archived)
    .reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    )

  return Number(totalAmount) - paid
}