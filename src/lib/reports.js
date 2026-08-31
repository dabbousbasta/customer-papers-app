import { supabase } from './supabase'

export async function getDashboardData() {
  const [
    customersResult,
    papersResult,
    paymentsResult
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, is_archived')
      .eq('is_archived', false),

    supabase
      .from('papers')
      .select(`
        id,
        customer_id,
        total_amount,
        status,
        paper_date
      `)
      .neq('status', 'archived'),

    supabase
      .from('payments')
      .select(`
        id,
        paper_id,
        amount,
        is_archived
      `)
      .eq('is_archived', false)
  ])

  if (customersResult.error) {
    throw customersResult.error
  }

  if (papersResult.error) {
    throw papersResult.error
  }

  if (paymentsResult.error) {
    throw paymentsResult.error
  }

  const customers = customersResult.data || []
  const papers = papersResult.data || []
  const payments = paymentsResult.data || []

  const paymentsByPaper = new Map()

  for (const payment of payments) {
    const oldValue =
      paymentsByPaper.get(payment.paper_id) || 0

    paymentsByPaper.set(
      payment.paper_id,
      oldValue + Number(payment.amount || 0)
    )
  }

  const openPapers = papers.filter(
    (paper) => paper.status === 'open'
  )

  const uncalculatedPapers = openPapers.filter(
    (paper) =>
      paper.total_amount === null ||
      paper.total_amount === undefined
  )

  const calculatedOpenPapers = openPapers.filter(
    (paper) =>
      paper.total_amount !== null &&
      paper.total_amount !== undefined
  )

  let totalRemaining = 0

  for (const paper of calculatedOpenPapers) {
    const paid =
      paymentsByPaper.get(paper.id) || 0

    totalRemaining +=
      Number(paper.total_amount) - paid
  }

  const customersWithOpenPapers = new Set(
    openPapers.map((paper) => paper.customer_id)
  )

  const balancesByCustomer = new Map()

  for (const paper of calculatedOpenPapers) {
    const paid =
      paymentsByPaper.get(paper.id) || 0

    const remaining =
      Number(paper.total_amount) - paid

    const oldValue = balancesByCustomer.get(
      paper.customer_id
    ) || {
      customerId: paper.customer_id,
      openPapersCount: 0,
      totalRemaining: 0
    }

    oldValue.openPapersCount += 1
    oldValue.totalRemaining += remaining

    balancesByCustomer.set(
      paper.customer_id,
      oldValue
    )
  }

  const customerReports = customers
    .map((customer) => {
      const report = balancesByCustomer.get(customer.id)

      return {
        customerId: customer.id,
        name: customer.name,
        openPapersCount: report?.openPapersCount || 0,
        totalRemaining: report?.totalRemaining || 0,
        hasOpenPapers: customersWithOpenPapers.has(
          customer.id
        )
      }
    })
    .filter(
      (customer) =>
        customer.openPapersCount > 0
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'ar')
    )

  return {
    customersCount: customers.length,
    openPapersCount: openPapers.length,
    uncalculatedPapersCount:
      uncalculatedPapers.length,
    customersWithOpenPapersCount:
      customersWithOpenPapers.size,
    totalRemaining,
    customerReports
  }
}

export async function getCustomerHistory(
  customerId
) {
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
    .eq('customer_id', customerId)
    .order('paper_date', {
      ascending: false
    })

  if (error) {
    throw error
  }

  return data || []
}

export async function getCustomerActivity(
  customerId
) {
  const { data: customerLogs, error: customerError } =
    await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'customer')
      .eq('entity_id', customerId)

  if (customerError) {
    throw customerError
  }

  const { data: papers, error: papersError } =
    await supabase
      .from('papers')
      .select('id')
      .eq('customer_id', customerId)

  if (papersError) {
    throw papersError
  }

  const paperIds = (papers || []).map(
    (paper) => paper.id
  )

  let paperLogs = []

  if (paperIds.length > 0) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'paper')
      .in('entity_id', paperIds)

    if (error) {
      throw error
    }

    paperLogs = data || []
  }

  let paymentLogs = []

  if (paperIds.length > 0) {
    const { data: payments, error: paymentsError } =
      await supabase
        .from('payments')
        .select('id')
        .in('paper_id', paperIds)

    if (paymentsError) {
      throw paymentsError
    }

    const paymentIds = (payments || []).map(
      (payment) => payment.id
    )

    if (paymentIds.length > 0) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', 'payment')
        .in('entity_id', paymentIds)

      if (error) {
        throw error
      }

      paymentLogs = data || []
    }
  }

  let imageLogs = []

  if (paperIds.length > 0) {
    const { data: images, error: imagesError } =
      await supabase
        .from('paper_images')
        .select('id')
        .in('paper_id', paperIds)

    if (imagesError) {
      throw imagesError
    }

    const imageIds = (images || []).map(
      (image) => image.id
    )

    if (imageIds.length > 0) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', 'paper_image')
        .in('entity_id', imageIds)

      if (error) {
        throw error
      }

      imageLogs = data || []
    }
  }

  return [
    ...(customerLogs || []),
    ...paperLogs,
    ...paymentLogs,
    ...imageLogs
  ].sort(
    (a, b) =>
      new Date(b.created_at) -
      new Date(a.created_at)
  )
}