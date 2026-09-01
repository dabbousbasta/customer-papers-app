import {
  createPaperImageUrl,
  getPaperImageHistory
} from './storage'

function getPayments(paper) {
  return (paper.payments || [])
    .filter((payment) => !payment.is_archived)
    .sort((a, b) =>
      String(a.payment_date).localeCompare(
        String(b.payment_date)
      )
    )
}

function getPaymentsTotal(paper) {
  return getPayments(paper).reduce(
    (sum, payment) =>
      sum + Number(payment.amount || 0),
    0
  )
}

function getPaperBalance(paper) {
  if (
    paper.total_amount === null ||
    paper.total_amount === undefined
  ) {
    return null
  }

  return (
    Number(paper.total_amount) -
    getPaymentsTotal(paper)
  )
}

function getStatusText(status) {
  if (status === 'open') return 'مفتوحة'
  if (status === 'closed') return 'مغلقة'
  if (status === 'archived') return 'مؤرشفة'
  return status
}

export async function buildCustomerWhatsAppReport(
  customer,
  papers,
  options = {}
) {
  const includeImageLinks =
    options.includeImageLinks === true

  const lines = [
    'كشف حساب',
    `الزبون: ${customer.name}`,
    ''
  ]

  let finalBalance = 0
  let totalValues = 0
  let totalPayments = 0
  let paperNumber = 0

  for (const paper of papers) {
    paperNumber += 1

    const payments = getPayments(paper)
    const paymentsTotal = getPaymentsTotal(paper)
    const balance = getPaperBalance(paper)

    if (
      paper.total_amount !== null &&
      paper.total_amount !== undefined
    ) {
      totalValues += Number(paper.total_amount)
    }

    totalPayments += paymentsTotal

    if (
      paper.status === 'open' &&
      balance !== null
    ) {
      finalBalance += balance
    }

    lines.push(`الورقة ${paperNumber}`)
    lines.push(`التاريخ: ${paper.paper_date}`)
    lines.push(`الحالة: ${getStatusText(paper.status)}`)

    lines.push(
      `القيمة: ${
        paper.total_amount === null ||
        paper.total_amount === undefined
          ? 'غير محسوبة'
          : Number(paper.total_amount).toFixed(2)
      }`
    )

    if (payments.length === 0) {
      lines.push('الدفعات: لا توجد دفعات')
    } else {
      lines.push('الدفعات:')

      for (const payment of payments) {
        lines.push(
          `- ${Number(payment.amount).toFixed(2)} ` +
          `بتاريخ ${payment.payment_date}`
        )

        if (payment.note) {
          lines.push(`ملاحظة الدفعة: ${payment.note}`)
        }
      }
    }

    lines.push(
      `مجموع الدفعات: ${paymentsTotal.toFixed(2)}`
    )

    lines.push(
      `المتبقي: ${
        balance === null
          ? 'غير محسوب'
          : balance.toFixed(2)
      }`
    )

    if (includeImageLinks && paper.image_path) {
      try {
        const currentImageUrl =
          await createPaperImageUrl(
            paper.image_path,
            86400
          )

        lines.push('رابط الصورة الحالية:')
        lines.push(currentImageUrl)
      } catch {
        lines.push('رابط الصورة الحالية: غير متاح')
      }

      try {
        const history =
          await getPaperImageHistory(paper.id)

        if (history.length > 0) {
          lines.push('سجل الصور:')

          for (const image of history) {
            try {
              const imageUrl =
                await createPaperImageUrl(
                  image.image_path,
                  86400
                )

              const description =
                image.description ||
                image.note ||
                'صورة بدون وصف'

              lines.push(`- ${description}`)
              lines.push(imageUrl)
            } catch {
              lines.push('- صورة قديمة غير متاحة')
            }
          }
        }
      } catch {
        lines.push('تعذر تحميل سجل الصور')
      }
    }

    lines.push('')
  }

  lines.push('الخلاصة النهائية')
  lines.push(`عدد الأوراق: ${paperNumber}`)
  lines.push(`إجمالي القيم: ${totalValues.toFixed(2)}`)
  lines.push(
    `إجمالي دفعات الأوراق المفتوحة: ${totalPayments.toFixed(
      2
    )}`
  )
  lines.push(
    `الرصيد النهائي المفتوح: ${finalBalance.toFixed(
      2
    )}`
  )

  return lines.join('\n')
}

export function openWhatsAppMessage(text) {
  const url =
    `https://wa.me/?text=${encodeURIComponent(text)}`

  window.open(url, '_blank', 'noopener,noreferrer')
}