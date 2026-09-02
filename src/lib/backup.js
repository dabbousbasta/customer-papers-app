import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { supabase } from './supabase'
import { calculateBalance } from './papers'

const BUCKET_NAME = 'paper-images'
const APP_NAME = 'دبوس البسطة'
const BACKUP_VERSION = 1

function pad(value) {
  return String(value).padStart(2, '0')
}

function getBackupStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeFilePart(value, fallback = 'بدون-اسم') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 70)

  return cleaned || fallback
}

function getExtension(path, fallback = 'jpg') {
  const cleanPath = String(path || '').split('?')[0]
  const extension = cleanPath.split('.').pop()?.toLowerCase()

  if (
    extension &&
    /^[a-z0-9]{1,8}$/.test(extension)
  ) {
    return extension
  }

  return fallback
}

function money(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return Number(value).toFixed(2)
}

function statusLabel(status) {
  if (status === 'closed') return 'مغلقة'
  if (status === 'archived') return 'مؤرشفة'
  return 'مفتوحة'
}

function archiveLabel(value) {
  return value ? 'نعم' : 'لا'
}

function getPaymentsTotal(payments = []) {
  return payments
    .filter((payment) => !payment.is_archived)
    .reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0
    )
}

function createSheetHeader(worksheet, values) {
  const row = worksheet.addRow(values)

  row.font = {
    bold: true,
    color: { argb: 'FFFFFFFF' }
  }

  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F3D68' }
  }

  row.alignment = {
    horizontal: 'center',
    vertical: 'center'
  }

  worksheet.views = [
    {
      rightToLeft: true,
      state: 'frozen',
      ySplit: 1
    }
  ]

  return row
}

function formatWorksheet(worksheet) {
  worksheet.eachRow((row) => {
    row.alignment = {
      vertical: 'top',
      wrapText: true
    }

    row.eachCell((cell) => {
      cell.border = {
        top: {
          style: 'thin',
          color: { argb: 'FFD1D5DB' }
        },
        left: {
          style: 'thin',
          color: { argb: 'FFD1D5DB' }
        },
        bottom: {
          style: 'thin',
          color: { argb: 'FFD1D5DB' }
        },
        right: {
          style: 'thin',
          color: { argb: 'FFD1D5DB' }
        }
      }
    })
  })
}

function createExcelBuffer({
  customers,
  papers,
  payments,
  imageHistory,
  generatedAt
}) {
  const workbook = new ExcelJS.Workbook()

  workbook.creator = APP_NAME
  workbook.created = generatedAt
  workbook.modified = generatedAt

  const customersSheet = workbook.addWorksheet('الزبائن')
  createSheetHeader(customersSheet, [
    'رقم الزبون',
    'اسم الزبون',
    'الهاتف',
    'الملاحظات',
    'مؤرشف',
    'تاريخ الإنشاء',
    'تاريخ آخر تعديل',
    'عدد الأوراق',
    'إجمالي قيمة الأوراق',
    'إجمالي الدفعات النشطة',
    'الرصيد الكلي'
  ])

  customers.forEach((customer) => {
    const customerPapers = papers.filter(
      (paper) => paper.customer_id === customer.id
    )

    const totalAmount = customerPapers.reduce(
      (sum, paper) =>
        sum + Number(paper.total_amount || 0),
      0
    )

    const totalPayments = customerPapers.reduce(
      (sum, paper) =>
        sum + getPaymentsTotal(paper.payments),
      0
    )

    const balance = customerPapers.reduce(
      (sum, paper) => {
        const paperBalance = calculateBalance(
          paper.total_amount,
          paper.payments
        )

        return paperBalance === null
          ? sum
          : sum + paperBalance
      },
      0
    )

    customersSheet.addRow([
      customer.id,
      customer.name || '',
      customer.phone || '',
      customer.notes || '',
      archiveLabel(customer.is_archived),
      customer.created_at || '',
      customer.updated_at || '',
      customerPapers.length,
      totalAmount,
      totalPayments,
      balance
    ])
  })

  customersSheet.columns = [
    { width: 38 },
    { width: 28 },
    { width: 18 },
    { width: 34 },
    { width: 12 },
    { width: 24 },
    { width: 24 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
    { width: 18 }
  ]

  formatWorksheet(customersSheet)

  const papersSheet = workbook.addWorksheet('الأوراق')
  createSheetHeader(papersSheet, [
    'رقم الورقة',
    'اسم الزبون',
    'رقم الزبون',
    'تاريخ الورقة',
    'القيمة',
    'إجمالي الدفعات النشطة',
    'الرصيد',
    'الحالة',
    'سبب الأرشفة',
    'ملاحظات الورقة',
    'مسار الصورة الحالية',
    'عدد صور السجل',
    'تاريخ الإنشاء',
    'تاريخ آخر تعديل'
  ])

  papers.forEach((paper) => {
    const paperPaymentsTotal = getPaymentsTotal(
      paper.payments
    )

    const balance = calculateBalance(
      paper.total_amount,
      paper.payments
    )

    const historyCount = imageHistory.filter(
      (image) => image.paper_id === paper.id
    ).length

    papersSheet.addRow([
      paper.id,
      paper.customers?.name || '',
      paper.customer_id || '',
      paper.paper_date || '',
      paper.total_amount ?? '',
      paperPaymentsTotal,
      balance ?? '',
      statusLabel(paper.status),
      paper.archive_reason || '',
      paper.note || '',
      paper.image_path || '',
      historyCount,
      paper.created_at || '',
      paper.updated_at || ''
    ])
  })

  papersSheet.columns = [
    { width: 38 },
    { width: 28 },
    { width: 38 },
    { width: 16 },
    { width: 15 },
    { width: 23 },
    { width: 15 },
    { width: 14 },
    { width: 25 },
    { width: 34 },
    { width: 48 },
    { width: 16 },
    { width: 24 },
    { width: 24 }
  ]

  formatWorksheet(papersSheet)

  const paymentsSheet = workbook.addWorksheet('الدفعات')
  createSheetHeader(paymentsSheet, [
    'رقم الدفعة',
    'اسم الزبون',
    'رقم الورقة',
    'تاريخ الورقة',
    'تاريخ الدفعة',
    'المبلغ',
    'مؤرشفة',
    'ملاحظة',
    'تاريخ الإنشاء',
    'تاريخ آخر تعديل'
  ])

  payments.forEach((payment) => {
    const paper = papers.find(
      (item) => item.id === payment.paper_id
    )

    paymentsSheet.addRow([
      payment.id,
      paper?.customers?.name || '',
      payment.paper_id || '',
      paper?.paper_date || '',
      payment.payment_date || '',
      payment.amount ?? '',
      archiveLabel(payment.is_archived),
      payment.note || '',
      payment.created_at || '',
      payment.updated_at || ''
    ])
  })

  paymentsSheet.columns = [
    { width: 38 },
    { width: 28 },
    { width: 38 },
    { width: 16 },
    { width: 16 },
    { width: 15 },
    { width: 12 },
    { width: 34 },
    { width: 24 },
    { width: 24 }
  ]

  formatWorksheet(paymentsSheet)

  const imagesSheet = workbook.addWorksheet('سجل الصور')
  createSheetHeader(imagesSheet, [
    'رقم سجل الصورة',
    'رقم الورقة',
    'اسم الزبون',
    'تاريخ الورقة',
    'المسار في Supabase',
    'الصورة الحالية',
    'الوصف',
    'ملاحظة',
    'تاريخ الإضافة'
  ])

  imageHistory.forEach((image) => {
    const paper = papers.find(
      (item) => item.id === image.paper_id
    )

    imagesSheet.addRow([
      image.id,
      image.paper_id || '',
      paper?.customers?.name || '',
      paper?.paper_date || '',
      image.image_path || '',
      archiveLabel(image.is_current),
      image.description || '',
      image.note || '',
      image.created_at || ''
    ])
  })

  imagesSheet.columns = [
    { width: 38 },
    { width: 38 },
    { width: 28 },
    { width: 16 },
    { width: 50 },
    { width: 16 },
    { width: 34 },
    { width: 34 },
    { width: 24 }
  ]

  formatWorksheet(imagesSheet)

  return workbook.xlsx.writeBuffer()
}

function createHtmlReport({
  customers,
  papers,
  generatedAt
}) {
  const customerSections = customers.map((customer) => {
    const customerPapers = papers.filter(
      (paper) => paper.customer_id === customer.id
    )

    const totalAmount = customerPapers.reduce(
      (sum, paper) =>
        sum + Number(paper.total_amount || 0),
      0
    )

    const totalPayments = customerPapers.reduce(
      (sum, paper) =>
        sum + getPaymentsTotal(paper.payments),
      0
    )

    const totalBalance = customerPapers.reduce(
      (sum, paper) => {
        const balance = calculateBalance(
          paper.total_amount,
          paper.payments
        )

        return balance === null
          ? sum
          : sum + balance
      },
      0
    )

    const papersRows = customerPapers.length
      ? customerPapers.map((paper) => {
          const payments = paper.payments || []
          const paymentsHtml = payments.length
            ? `
              <ul class="payments-list">
                ${payments.map((payment) => `
                  <li>
                    ${escapeHtml(payment.payment_date || '—')}
                    — ${escapeHtml(money(payment.amount))}
                    ${payment.is_archived ? '(مؤرشفة)' : ''}
                    ${payment.note ? `— ${escapeHtml(payment.note)}` : ''}
                  </li>
                `).join('')}
              </ul>
            `
            : '<span class="muted">لا توجد دفعات</span>'

          const balance = calculateBalance(
            paper.total_amount,
            payments
          )

          return `
            <tr>
              <td>${escapeHtml(paper.paper_date || '—')}</td>
              <td>${escapeHtml(statusLabel(paper.status))}</td>
              <td>${escapeHtml(money(paper.total_amount))}</td>
              <td>${escapeHtml(money(getPaymentsTotal(payments)))}</td>
              <td>${escapeHtml(money(balance))}</td>
              <td>${escapeHtml(paper.note || '—')}</td>
              <td>${paymentsHtml}</td>
              <td>${escapeHtml(paper.image_path || 'لا توجد صورة')}</td>
            </tr>
          `
        }).join('')
      : `
        <tr>
          <td colspan="8" class="muted">
            لا توجد أوراق لهذا الزبون.
          </td>
        </tr>
      `

    return `
      <section class="customer">
        <div class="customer-header">
          <div>
            <h2>${escapeHtml(customer.name || 'بدون اسم')}</h2>
            <p>
              الهاتف: ${escapeHtml(customer.phone || '—')}
              · الحالة: ${customer.is_archived ? 'مؤرشف' : 'نشط'}
            </p>
            ${
              customer.notes
                ? `<p>ملاحظات: ${escapeHtml(customer.notes)}</p>`
                : ''
            }
          </div>

          <div class="totals">
            <span>الأوراق: <strong>${customerPapers.length}</strong></span>
            <span>القيمة: <strong>${money(totalAmount)}</strong></span>
            <span>الدفعات: <strong>${money(totalPayments)}</strong></span>
            <span>الرصيد: <strong>${money(totalBalance)}</strong></span>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاريخ الورقة</th>
                <th>الحالة</th>
                <th>القيمة</th>
                <th>الدفعات</th>
                <th>الرصيد</th>
                <th>ملاحظة الورقة</th>
                <th>تفاصيل الدفعات</th>
                <th>مسار الصورة داخل النسخة</th>
              </tr>
            </thead>
            <tbody>
              ${papersRows}
            </tbody>
          </table>
        </div>
      </section>
    `
  }).join('')

  const totalOpenPapers = papers.filter(
    (paper) => paper.status === 'open'
  )

  const totalOpenBalance = totalOpenPapers.reduce(
    (sum, paper) => {
      const balance = calculateBalance(
        paper.total_amount,
        paper.payments
      )

      return balance === null
        ? sum
        : sum + balance
    },
    0
  )

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>تقرير النسخة الاحتياطية — ${APP_NAME}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      color: #172033;
      background: #f4f7fb;
      font-family: Tahoma, Arial, sans-serif;
      line-height: 1.55;
    }
    .container {
      max-width: 1500px;
      margin: 0 auto;
    }
    .report-head {
      padding: 24px;
      border-radius: 16px;
      color: white;
      background: #0f3d68;
    }
    .report-head h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    .report-head p {
      margin: 4px 0;
    }
    .overview {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0;
    }
    .overview article,
    .customer {
      padding: 18px;
      border: 1px solid #dbe6f0;
      border-radius: 14px;
      background: white;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    }
    .overview span,
    .totals span {
      display: block;
      color: #475569;
      font-size: 13px;
    }
    .overview strong {
      display: block;
      margin-top: 6px;
      color: #0f3d68;
      font-size: 24px;
    }
    .customer {
      margin-top: 20px;
      break-inside: avoid;
    }
    .customer-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #dbeafe;
    }
    .customer h2 {
      margin: 0 0 6px;
      color: #0f3d68;
      font-size: 22px;
    }
    .customer p {
      margin: 3px 0;
    }
    .totals {
      display: grid;
      grid-template-columns: repeat(2, minmax(130px, 1fr));
      gap: 8px;
      min-width: 320px;
    }
    .totals span {
      padding: 9px;
      border-radius: 9px;
      background: #f0f9ff;
    }
    .totals strong {
      color: #0f3d68;
      font-size: 16px;
    }
    .table-wrap {
      overflow-x: auto;
      margin-top: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 10px;
      border: 1px solid #dbe6f0;
      text-align: right;
      vertical-align: top;
    }
    th {
      color: white;
      background: #1d4f78;
      white-space: nowrap;
    }
    .payments-list {
      min-width: 180px;
      margin: 0;
      padding-right: 18px;
    }
    .muted {
      color: #64748b;
    }
    @media print {
      body {
        padding: 0;
        background: white;
      }
      .report-head,
      .customer,
      .overview article {
        box-shadow: none;
      }
      .customer {
        page-break-inside: avoid;
      }
    }
    @media (max-width: 760px) {
      body { padding: 12px; }
      .overview { grid-template-columns: repeat(2, 1fr); }
      .customer-header { flex-direction: column; }
      .totals { width: 100%; min-width: 0; }
    }
  </style>
</head>
<body>
  <main class="container">
    <header class="report-head">
      <h1>تقرير النسخة الاحتياطية — ${APP_NAME}</h1>
      <p>تاريخ الإنشاء: ${escapeHtml(generatedAt.toLocaleString('ar-LB'))}</p>
      <p>
        افتح هذا الملف في المتصفح، ثم اضغط Ctrl + P
        واختر “Save as PDF” إذا احتجت نسخة PDF.
      </p>
    </header>

    <section class="overview">
      <article>
        <span>عدد الزبائن</span>
        <strong>${customers.length}</strong>
      </article>
      <article>
        <span>عدد الأوراق</span>
        <strong>${papers.length}</strong>
      </article>
      <article>
        <span>الأوراق المفتوحة</span>
        <strong>${totalOpenPapers.length}</strong>
      </article>
      <article>
        <span>الرصيد المفتوح</span>
        <strong>${money(totalOpenBalance)}</strong>
      </article>
    </section>

    ${customerSections}
  </main>
</body>
</html>`
}

async function getAllRows(queryFactory) {
  const pageSize = 1000
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await queryFactory()
      .range(from, from + pageSize - 1)

    if (error) {
      throw error
    }

    const page = data || []
    rows.push(...page)

    if (page.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}

async function fetchBackupData() {
  const customers = await getAllRows(() =>
    supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true })
  )

  const papers = await getAllRows(() =>
    supabase
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
          paper_id,
          amount,
          payment_date,
          note,
          is_archived,
          created_at,
          updated_at,
          created_by,
          updated_by
        )
      `)
      .order('paper_date', { ascending: false })
  )

  const payments = await getAllRows(() =>
    supabase
      .from('payments')
      .select('*')
      .order('payment_date', { ascending: false })
  )

  const imageHistory = await getAllRows(() =>
    supabase
      .from('paper_images')
      .select('*')
      .order('created_at', { ascending: false })
  )

  return {
    customers,
    papers,
    payments,
    imageHistory
  }
}

function createImageJobs(papers, imageHistory) {
  const jobsByPath = new Map()

  function addJob({
    imagePath,
    paper,
    source,
    imageRecord = null
  }) {
    if (!imagePath || jobsByPath.has(imagePath)) {
      return
    }

    jobsByPath.set(imagePath, {
      imagePath,
      paper,
      source,
      imageRecord
    })
  }

  papers.forEach((paper) => {
    addJob({
      imagePath: paper.image_path,
      paper,
      source: 'current'
    })
  })

  imageHistory.forEach((image) => {
    const paper = papers.find(
      (item) => item.id === image.paper_id
    )

    addJob({
      imagePath: image.image_path,
      paper,
      source: image.is_current
        ? 'history-current'
        : 'history',
      imageRecord: image
    })
  })

  return [...jobsByPath.values()]
}

async function downloadImageBlob(imagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(imagePath)

  if (error) {
    throw error
  }

  return data
}

function createImageZipPath(job, index) {
  const customerName = safeFilePart(
    job.paper?.customers?.name || 'زبون-غير-معروف'
  )

  const paperDate = safeFilePart(
    job.paper?.paper_date || 'بدون-تاريخ'
  )

  const sourceLabel =
    job.source === 'current'
      ? 'الصورة-الحالية'
      : job.source === 'history-current'
        ? 'سجل-الصورة-الحالية'
        : 'صورة-سابقة'

  const extension = getExtension(job.imagePath)
  const fileName =
    `${String(index + 1).padStart(4, '0')}-` +
    `${safeFilePart(sourceLabel)}-` +
    `${safeFilePart(job.paper?.id || 'بدون-رقم')}.` +
    extension

  return `صور-الأوراق/${customerName}/${paperDate}/${fileName}`
}

function createReadme({
  includeImages,
  generatedAt,
  customers,
  papers,
  payments,
  imageHistory,
  downloadedImages,
  failedImages
}) {
  return `${APP_NAME}
نسخة احتياطية محلية
نوع النسخة: ${includeImages ? 'كاملة مع الصور' : 'سريعة بدون الصور'}

تاريخ الإنشاء:
${generatedAt.toLocaleString('ar-LB')}

محتويات النسخة:
- backup.json: نسخة بيانات كاملة بصيغة JSON، مخصصة للاستعادة لاحقًا.
- تقرير-مالي.xlsx: ملف Excel يحتوي صفحات الزبائن والأوراق والدفعات وسجل الصور.
- تقرير-كامل.html: تقرير عربي قابل للفتح في المتصفح والطباعة إلى PDF.
- صور-الأوراق: نسخة محلية من صور الأوراق الحالية وصور سجل التغييرات.

ملخص البيانات:
- عدد الزبائن: ${customers.length}
- عدد الأوراق: ${papers.length}
- عدد الدفعات: ${payments.length}
- عدد سجلات الصور: ${imageHistory.length}
- عدد الصور التي تم تنزيلها: ${downloadedImages}
- عدد الصور التي تعذر تنزيلها: ${failedImages.length}

تنبيه:
هذا الملف ZIP للقراءة والاحتفاظ الآمن. لا تحذف backup.json لأنه مهم لإنشاء ميزة استعادة البيانات مستقبلًا.

${
  failedImages.length
    ? `الصور التي تعذر تنزيلها:\n${failedImages
        .map(
          (item) =>
            `- ${item.imagePath}: ${item.error}`
        )
        .join('\n')}`
    : 'تم تنزيل جميع الصور بنجاح.'
}
`
}

export async function createAndDownloadBackup({
  includeImages = true,
  onProgress = () => {}
} = {}) {
  const generatedAt = new Date()
   const stamp = getBackupStamp(generatedAt)

  onProgress({
    stage: 'data',
    message: 'جارٍ قراءة بيانات الزبائن والأوراق والدفعات...'
  })

  const {
    customers,
    papers,
    payments,
    imageHistory
  } = await fetchBackupData()

    const imageJobs = includeImages
    ? createImageJobs(papers, imageHistory)
    : []

  const zip = new JSZip()
  const imageFiles = []
  const failedImages = []

  if (includeImages) {
    onProgress({
      stage: 'images',
      current: 0,
      total: imageJobs.length,
      message:
        imageJobs.length
          ? `جارٍ تنزيل الصور: 0 من ${imageJobs.length}`
          : 'لا توجد صور لتنزيلها.'
    })

    for (
      let index = 0;
      index < imageJobs.length;
      index += 1
    ) {
      const job = imageJobs[index]

      try {
        const blob = await downloadImageBlob(
          job.imagePath
        )

        const zipPath = createImageZipPath(
          job,
          index
        )

        zip.file(zipPath, blob)

        imageFiles.push({
          original_path: job.imagePath,
          backup_path: zipPath,
          paper_id: job.paper?.id || null,
          customer_id: job.paper?.customer_id || null,
          source: job.source,
          image_record_id: job.imageRecord?.id || null
        })
      } catch (error) {
        failedImages.push({
          imagePath: job.imagePath,
          error:
            error.message || 'تعذر تنزيل الصورة'
        })
      }

      onProgress({
        stage: 'images',
        current: index + 1,
        total: imageJobs.length,
        message:
          `جارٍ تنزيل الصور: ${index + 1} من ` +
          `${imageJobs.length}`
      })
    }
  } else {
    onProgress({
      stage: 'images',
      current: 0,
      total: 0,
      message:
        'نسخة سريعة: لن يتم تنزيل الصور.'
    })
  }
  onProgress({
    stage: 'excel',
    message: 'جارٍ إنشاء ملف Excel...'
  })

  const excelBuffer = await createExcelBuffer({
    customers,
    papers,
    payments,
    imageHistory,
    generatedAt
  })

    const backupData = {
    app: APP_NAME,
    version: BACKUP_VERSION,
    generated_at: generatedAt.toISOString(),
    includes_images: includeImages,
    tables: {
      customers,
      papers,
      payments,
      paper_images: imageHistory
    },
    image_files: imageFiles,
    failed_images: failedImages
  }

  onProgress({
    stage: 'files',
    message: 'جارٍ إنشاء ملفات النسخة الاحتياطية...'
  })

  zip.file(
    'backup.json',
    JSON.stringify(backupData, null, 2)
  )

  zip.file(
    'تقرير-مالي.xlsx',
    excelBuffer
  )

  zip.file(
    'تقرير-كامل.html',
    createHtmlReport({
      customers,
      papers,
      generatedAt
    })
  )

  zip.file(
    'README.txt',
    createReadme({
      includeImages,
      generatedAt,
      customers,
      papers,
      payments,
      imageHistory,
      downloadedImages: imageFiles.length,
      failedImages
    })
  )

  onProgress({
    stage: 'zip',
    message: 'جارٍ ضغط النسخة الاحتياطية...'
  })

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  const backupType = includeImages
    ? 'كاملة-مع-الصور'
    : 'سريعة-بدون-صور'

  const fileName =
    `backup-${safeFilePart(APP_NAME)}-${backupType}-${stamp}.zip`

  saveAs(zipBlob, fileName)

  return {
    fileName,
    includeImages,
    customersCount: customers.length,
    papersCount: papers.length,
    paymentsCount: payments.length,
    imagesCount: imageFiles.length,
    failedImages
  }
}