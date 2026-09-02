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
    `الزبون: ${customer.name}`
  ]

  if (customer.phone) {
    lines.push(`الهاتف: ${customer.phone}`)
  }

  lines.push('')

  if (papers.length === 0) {
    lines.push('لا توجد أوراق ضمن هذا التبويب.')

    return lines.join('\n')
  }

  let finalBalance = 0
  let totalValues = 0
  let totalPayments = 0
  let paperNumber = 0

  const imageLinks = []

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

    if (balance !== null) {
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

    if (paper.note) {
      lines.push(`ملاحظة الورقة: ${paper.note}`)
    }

    lines.push('')

    if (includeImageLinks && paper.image_path) {
      try {
        const currentImageUrl =
          await createPaperImageUrl(
            paper.image_path,
            86400
          )

        if (currentImageUrl) {
          imageLinks.push({
            label:
              `صورة الورقة ${paperNumber} ` +
              `بتاريخ ${paper.paper_date}`,
            url: currentImageUrl
          })
        }
      } catch {
        imageLinks.push({
          label:
            `صورة الورقة ${paperNumber} ` +
            `بتاريخ ${paper.paper_date}`,
          url: 'الرابط غير متاح'
        })
      }

      try {
        const history =
          await getPaperImageHistory(paper.id)

        for (const image of history || []) {
          try {
            const imageUrl =
              await createPaperImageUrl(
                image.image_path,
                86400
              )

            const description =
              image.description ||
              image.note ||
              'صورة قديمة بدون وصف'

            imageLinks.push({
              label:
                `صورة قديمة للورقة ${paperNumber}: ` +
                description,
              url: imageUrl
            })
          } catch {
            imageLinks.push({
              label:
                `صورة قديمة للورقة ${paperNumber}`,
              url: 'الرابط غير متاح'
            })
          }
        }
      } catch {
        imageLinks.push({
          label:
            `سجل صور الورقة ${paperNumber}`,
          url: 'تعذر تحميل سجل الصور'
        })
      }
    }
  }

  lines.push('الخلاصة النهائية')
  lines.push(`عدد الأوراق: ${paperNumber}`)
  lines.push(`إجمالي القيم: ${totalValues.toFixed(2)}`)
  lines.push(`إجمالي الدفعات: ${totalPayments.toFixed(2)}`)
  lines.push(`الرصيد النهائي: ${finalBalance.toFixed(2)}`)

  if (includeImageLinks) {
    lines.push('')
    lines.push('روابط الصور')

    if (imageLinks.length === 0) {
      lines.push('لا توجد روابط صور متاحة.')
    } else {
      imageLinks.forEach((image, index) => {
        lines.push('')
        lines.push(`صورة ${index + 1}`)
        lines.push(image.label)
        lines.push(image.url)
      })
    }
  }

  return lines.join('\n')
}

export function openWhatsAppMessage(text) {
  const url =
    `https://wa.me/?text=${encodeURIComponent(text)}`

  window.open(url, '_blank', 'noopener,noreferrer')
}