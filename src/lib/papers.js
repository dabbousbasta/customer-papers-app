import { supabase } from './supabase'
import { logActivity } from './activity'

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

async function getPaperActivityInfo(paperId) {
  const { data, error } = await supabase
    .from('papers')
    .select(`
      id,
      customer_id,
      paper_date,
      total_amount,
      status,
      image_path,
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

function getCustomerName(paper) {
  return paper?.customers?.name || 'زبون غير معروف'
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) {
    return 'بدون قيمة'
  }

  return Number(amount).toFixed(2)
}

export async function getPapers({
  includeArchived = false,
  customerId = null
} = {}) {
  let query = supabase
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
    .order('paper_date', {
      ascending: false
    })

  if (!includeArchived) {
    query = query.neq('status', 'archived')
  }

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return data || []
}

export async function createPaper({
  customerId,
  paperDate,
  imagePath,
  note,
  totalAmount
}) {
  const user = await getCurrentUser()

  const numericAmount =
    totalAmount === '' ||
    totalAmount === null ||
    totalAmount === undefined
      ? null
      : Number(totalAmount)

  const { data, error } = await supabase
    .from('papers')
    .insert({
      customer_id: customerId,
      paper_date: paperDate,
      image_path: imagePath,
      note: note?.trim() || null,
      total_amount: numericAmount,
      status: 'open',
      created_by: user.id,
      updated_by: user.id
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  try {
    const paper = await getPaperActivityInfo(data.id)
    const customerName = getCustomerName(paper)

    await logActivity({
      actionType: 'paper_created',
      entityType: 'paper',
      entityId: data.id,
      customerId: data.customer_id,
      paperId: data.id,
      summary:
        `إضافة ورقة للزبون: ${customerName} ` +
        `بقيمة ${formatAmount(data.total_amount)}`,
      details: {
        paper_date: data.paper_date,
        total_amount: data.total_amount,
        note: data.note,
        has_image: Boolean(data.image_path),
        status: data.status
      }
    })
  } catch (activityError) {
    console.error(
      'تعذر تسجيل إضافة الورقة',
      activityError
    )
  }

  return data
}

export async function updatePaperAmount(
  paperId,
  totalAmount
) {
  const user = await getCurrentUser()

  const oldPaper = await getPaperActivityInfo(paperId)

  const numericAmount =
    totalAmount === '' ||
    totalAmount === null ||
    totalAmount === undefined
      ? null
      : Number(totalAmount)

  if (
    numericAmount !== null &&
    Number.isNaN(numericAmount)
  ) {
    throw new Error('أدخل قيمة صحيحة للورقة')
  }

  const { data, error } = await supabase
    .from('papers')
    .update({
      total_amount: numericAmount,
      updated_by: user.id
    })
    .eq('id', paperId)
    .select()
    .single()

  if (error) {
    throw error
  }

  try {
    const customerName = getCustomerName(oldPaper)

    await logActivity({
      actionType: 'paper_amount_updated',
      entityType: 'paper',
      entityId: data.id,
      customerId: data.customer_id,
      paperId: data.id,
      summary:
        `تعديل قيمة ورقة الزبون: ${customerName} ` +
        `من ${formatAmount(oldPaper.total_amount)} ` +
        `إلى ${formatAmount(data.total_amount)}`,
      details: {
        paper_date: data.paper_date,
        old_total_amount: oldPaper.total_amount,
        new_total_amount: data.total_amount
      }
    })
  } catch (activityError) {
    console.error(
      'تعذر تسجيل تعديل قيمة الورقة',
      activityError
    )
  }

  return data
}

export async function updatePaperImagePath(
  paperId,
  imagePath
) {
  const user = await getCurrentUser()

  const oldPaper = await getPaperActivityInfo(paperId)

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

  try {
    const customerName = getCustomerName(oldPaper)
    const actionType = imagePath
      ? oldPaper.image_path
        ? 'paper_image_replaced'
        : 'paper_image_added'
      : 'paper_image_removed'

    const actionLabel = imagePath
      ? oldPaper.image_path
        ? 'استبدال صورة'
        : 'إضافة صورة'
      : 'حذف صورة'

    await logActivity({
      actionType,
      entityType: 'paper',
      entityId: data.id,
      customerId: data.customer_id,
      paperId: data.id,
      summary: `${actionLabel} ورقة الزبون: ${customerName}`,
      details: {
        paper_date: data.paper_date,
        had_previous_image: Boolean(oldPaper.image_path),
        has_current_image: Boolean(imagePath)
      }
    })
  } catch (activityError) {
    console.error(
      'تعذر تسجيل تغيير صورة الورقة',
      activityError
    )
  }

  return data
}

export async function movePapersToCustomer({
  paperIds,
  targetCustomerId
}) {
  if (!Array.isArray(paperIds) || paperIds.length === 0) {
    throw new Error('اختر ورقة واحدة على الأقل')
  }

  if (!targetCustomerId) {
    throw new Error('اختر الزبون المنقول إليه')
  }

  const { data, error } = await supabase.rpc(
    'move_papers_to_customer',
    {
      p_paper_ids: paperIds,
      p_target_customer_id: targetCustomerId
    }
  )

  if (error) {
    throw error
  }

  return Number(data || 0)
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

export async function restorePaper(paperId) {
  const { data, error } = await supabase.rpc(
    'restore_paper',
    {
      p_paper_id: paperId
    }
  )

  if (error) {
    throw error
  }

  return data
}

export function calculateBalance(
  totalAmount,
  payments = []
) {
  if (
    totalAmount === null ||
    totalAmount === undefined
  ) {
    return null
  }

  const paymentsTotal = payments
    .filter((payment) => !payment.is_archived)
    .reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0
    )

  return Number(totalAmount) - paymentsTotal
}