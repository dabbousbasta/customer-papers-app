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
    const current = paymentsByPaper.get(payment.paper_id) || 0
    paymentsByPaper.set(
      payment.paper_id,
      current + Number(payment.amount || 0)
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
    const paid = paymentsByPaper.get(paper.id) || 0
    totalRemaining += Number(paper.total_amount) - paid
  }

  const customersWithOpenPapers = new Set(
    openPapers.map((paper) => paper.customer_id)
  )

  const balancesByCustomer = new Map()

  for (const paper of calculatedOpenPapers) {
    const paid = paymentsByPaper.get(paper.id) || 0
    const remaining =
      Number(paper.total_amount) - paid

    const current = balancesByCustomer.get(
      paper.customer_id
    ) || {
      customerId: paper.customer_id,
      openPapersCount: 0,
      totalRemaining: 0
    }

    current.openPapersCount += 1
    current.totalRemaining += remaining

    balancesByCustomer.set(
      paper.customer_id,
      current
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
    uncalculatedPapersCount: uncalculatedPapers.length,
    customersWithOpenPapersCount:
      customersWithOpenPapers.size,
    totalRemaining,
    customerReports
  }
}