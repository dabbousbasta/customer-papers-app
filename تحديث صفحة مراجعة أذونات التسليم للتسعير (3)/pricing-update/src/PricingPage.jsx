import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Link } from 'react-router-dom'
import {
  createPricingAccount,
  createPricingInvoice,
  deletePricingAccount,
  deletePricingImage,
  deletePricingInvoice,
  getSignedImageUrls,
  loadPricingData,
  renamePricingAccount,
  setPricingInvoiceArchived,
  updatePricingInvoiceNumber,
  uploadPricingImage
} from './lib/pricing'
import {
  cleanDocumentNumber,
  getSearchTokens,
  matchesSearch,
  normalizeSearchText
} from './lib/searchText'
import RegisterModal, { EditImageModal } from './PricingRegister'
import './pricing.css'

const UPLOAD_WORKERS = 3

function compareNumbersDesc(a, b) {
  return String(b).localeCompare(String(a), 'en', {
    numeric: true
  })
}

function compareNumbersAsc(a, b) {
  return String(a).localeCompare(String(b), 'en', {
    numeric: true
  })
}

function countDeliveries(images) {
  return new Set(images.map((image) => image.delivery_number)).size
}

function compareDelivery(a, b, direction) {
  // الأوراق بدون رقم إذن دايمًا بالآخر
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return direction === 'desc' ? compareNumbersDesc(a, b) : compareNumbersAsc(a, b)
}

function byTime(a, b) {
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
}

const IMAGE_SORTS = [
  { value: 'time', label: 'وقت التصوير' },
  { value: 'asc', label: 'تصاعدي' },
  { value: 'desc', label: 'تنازلي' }
]

const SORT_STORAGE_KEY = 'pricing-image-sort'

function readSavedSort() {
  try {
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY)
    return IMAGE_SORTS.some((item) => item.value === saved) ? saved : 'asc'
  } catch {
    return 'asc'
  }
}

function groupByDelivery(images, sortMode = 'asc') {
  const sorted = [...images].sort(byTime)

  if (sortMode === 'time') {
    // حسب وقت التصوير: كل ورقة بمكانها، والصور المتتالية لنفس الإذن سوا
    const groups = []

    for (const image of sorted) {
      const last = groups[groups.length - 1]

      if (last && last.deliveryNumber === image.delivery_number) {
        last.images.push(image)
      } else {
        groups.push({
          key: `${groups.length}-${image.delivery_number}`,
          deliveryNumber: image.delivery_number,
          images: [image]
        })
      }
    }

    return groups
  }

  const groups = new Map()

  for (const image of sorted) {
    if (!groups.has(image.delivery_number)) {
      groups.set(image.delivery_number, [])
    }

    groups.get(image.delivery_number).push(image)
  }

  return [...groups.entries()]
    .sort((a, b) => compareDelivery(a[0], b[0], sortMode))
    .map(([deliveryNumber, groupImages]) => ({
      key: deliveryNumber,
      deliveryNumber,
      images: groupImages
    }))
}

// ملخص تحت اسم الحساب: 1500 (320، 325) - 1508 (341)
function invoicesSummary(invoiceItems, waiting) {
  return invoiceItems.map(({ invoice, shownImages }, index) => {
    const numbers = waiting
      ? []
      : [...new Set(shownImages.map((image) => image.delivery_number))].sort(
          (a, b) => compareDelivery(a, b, 'asc')
        )

    return (
      <span key={invoice.id} className="pr-sum-item">
        {index > 0 && <span className="pr-sum-sep"> - </span>}
        <bdi className="pr-sum-invoice">{invoice.invoice_number}</bdi>
        {numbers.length > 0 && (
          <>
            {' ('}
            {numbers.map((number, numberIndex) => (
              <span key={number || 'none'}>
                {numberIndex > 0 && '، '}
                <bdi>{number || 'بدون رقم'}</bdi>
              </span>
            ))}
            {')'}
          </>
        )}
      </span>
    )
  })
}

// =====================================================
// الصفحة الرئيسية: مراجعة أذونات التسليم للتسعير
// =====================================================

export default function PricingPage({ session, signOut }) {
  const [data, setData] = useState({
    accounts: [],
    invoices: [],
    images: []
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('pending')
  const [imageSort, setImageSort] = useState(readSavedSort)

  function changeImageSort(value) {
    setImageSort(value)

    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, value)
    } catch {
      // ignore
    }
  }
  const [filters, setFilters] = useState({
    account: '',
    invoice: '',
    delivery: ''
  })
  const [baseOpen, setBaseOpen] = useState(() => ({
    accounts: new Set(),
    invoices: new Set()
  }))
  const [filterOpen, setFilterOpen] = useState(() => ({
    key: '',
    accounts: new Map(),
    invoices: new Map()
  }))
  const [modal, setModal] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      setData(await loadPricingData())
    } catch (error) {
      setMessage(`تعذر تحميل البيانات: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    loadPricingData()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((error) => {
        if (active) setMessage(`تعذر تحميل البيانات: ${error.message}`)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  // ---------- تجهيز الشجرة ----------

  const imagesByInvoice = useMemo(() => {
    const map = new Map()

    for (const image of data.images) {
      if (!map.has(image.invoice_id)) {
        map.set(image.invoice_id, [])
      }

      map.get(image.invoice_id).push(image)
    }

    return map
  }, [data.images])

  const tabCounts = useMemo(() => {
    const counts = { waiting: 0, pending: 0, archived: 0 }

    for (const invoice of data.invoices) {
      if (!imagesByInvoice.get(invoice.id)?.length) {
        if (!invoice.is_archived) counts.waiting += 1
        continue
      }

      counts[invoice.is_archived ? 'archived' : 'pending'] += 1
    }

    return counts
  }, [data.invoices, imagesByInvoice])

  const tree = useMemo(() => {
    const archived = tab === 'archived'
    const accountTokens = getSearchTokens(filters.account)
    const invoiceTokens = getSearchTokens(filters.invoice)
    const deliveryTokens = getSearchTokens(filters.delivery)
    const accountsById = new Map(
      data.accounts.map((account) => [account.id, account])
    )
    const groups = new Map()
    let invoicesCount = 0
    let imagesCount = 0
    const waiting = tab === 'waiting'

    // تبويب «بانتظار الصور»: الحسابات المحفوظة بدون فواتير تظهر أيضًا
    if (waiting && invoiceTokens.length === 0) {
      const accountsWithInvoices = new Set(
        data.invoices.map((invoice) => invoice.account_id)
      )

      for (const account of data.accounts) {
        if (accountsWithInvoices.has(account.id)) continue
        if (!matchesSearch(account.name, accountTokens)) continue

        groups.set(account.id, { account, invoices: [] })
      }
    }

    for (const invoice of data.invoices) {
      if (invoice.is_archived !== archived) continue

      const allImages = imagesByInvoice.get(invoice.id) || []

      // بانتظار الصور: الفواتير بدون صور فقط
      // باقي التبويبات: الفاتورة بدون صور لا تظهر
      if (waiting ? allImages.length > 0 : allImages.length === 0) {
        continue
      }

      const account = accountsById.get(invoice.account_id)

      if (!account) continue
      if (!matchesSearch(account.name, accountTokens)) continue
      if (!matchesSearch(invoice.invoice_number, invoiceTokens)) {
        continue
      }

      const shownImages = deliveryTokens.length && !waiting
        ? allImages.filter((image) =>
            matchesSearch(image.delivery_number, deliveryTokens)
          )
        : allImages

      if (!waiting && shownImages.length === 0) continue

      if (!groups.has(account.id)) {
        groups.set(account.id, {
          account,
          invoices: []
        })
      }

      groups.get(account.id).invoices.push({
        invoice,
        allImages,
        shownImages
      })

      invoicesCount += 1
      imagesCount += shownImages.length
    }

    const accounts = [...groups.values()]
      .map((group) => ({
        ...group,
        invoices: group.invoices.sort((a, b) =>
          compareNumbersDesc(
            a.invoice.invoice_number,
            b.invoice.invoice_number
          )
        ),
        imagesCount: group.invoices.reduce(
          (sum, item) => sum + item.shownImages.length,
          0
        )
      }))
      .sort((a, b) =>
        a.account.name.localeCompare(b.account.name, 'ar')
      )

    return {
      accounts,
      invoicesCount,
      imagesCount
    }
  }, [data, imagesByInvoice, filters, tab])

  const hasFilter = Boolean(
    filters.account.trim() ||
      filters.invoice.trim() ||
      filters.delivery.trim()
  )

  // فتح وإغلاق الحسابات والفواتير.
  // بدون بحث: يبقى الفتح كما تركته.
  // مع البحث: نفتح النتائج تلقائيًا إذا كانت قليلة، ويمكنك تغييرها.
  const filterKey = `${tab}|${filters.account}|${filters.invoice}|${filters.delivery}`

  const autoOpen = useMemo(() => {
    const accounts = new Set()
    const invoices = new Set()

    if (!hasFilter) return { accounts, invoices }

    const numberFilter = Boolean(
      filters.invoice.trim() || filters.delivery.trim()
    )

    if (numberFilter || tree.accounts.length <= 5) {
      for (const group of tree.accounts) accounts.add(group.account.id)
    }

    if (numberFilter && tree.invoicesCount <= 6) {
      for (const group of tree.accounts) {
        for (const item of group.invoices) invoices.add(item.invoice.id)
      }
    }

    return { accounts, invoices }
  }, [hasFilter, filters, tree])

  function isOpen(kind, id) {
    if (!hasFilter) return baseOpen[kind].has(id)

    const override =
      filterOpen.key === filterKey
        ? filterOpen[kind].get(id)
        : undefined

    return override ?? autoOpen[kind].has(id)
  }

  function toggleOpen(kind, id) {
    const nextValue = !isOpen(kind, id)

    if (!hasFilter) {
      setBaseOpen((current) => {
        const next = new Set(current[kind])
        if (nextValue) next.add(id)
        else next.delete(id)
        return { ...current, [kind]: next }
      })
      return
    }

    setFilterOpen((current) => {
      const base =
        current.key === filterKey
          ? current
          : { key: filterKey, accounts: new Map(), invoices: new Map() }
      const next = new Map(base[kind])
      next.set(id, nextValue)
      return { ...base, [kind]: next }
    })
  }

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function clearFilters() {
    setFilters({ account: '', invoice: '', delivery: '' })
  }

  // ---------- تعديل البيانات محليًا بعد الحفظ ----------

  function upsertAccount(account) {
    setData((current) => ({
      ...current,
      accounts: current.accounts.some((item) => item.id === account.id)
        ? current.accounts.map((item) =>
            item.id === account.id ? account : item
          )
        : [...current.accounts, account]
    }))
  }

  function upsertInvoice(invoice) {
    setData((current) => ({
      ...current,
      invoices: current.invoices.some((item) => item.id === invoice.id)
        ? current.invoices.map((item) =>
            item.id === invoice.id ? invoice : item
          )
        : [...current.invoices, invoice]
    }))
  }

  function addImage(image) {
    setData((current) => ({
      ...current,
      images: [...current.images, image]
    }))
  }

  function replaceImage(image) {
    setData((current) => ({
      ...current,
      images: current.images.map((item) =>
        item.id === image.id ? image : item
      )
    }))
  }

  function removeImage(imageId) {
    setData((current) => ({
      ...current,
      images: current.images.filter((item) => item.id !== imageId)
    }))
  }

  // ---------- الأزرار ----------

  async function handleArchiveToggle(invoice, accountName) {
    const toArchive = !invoice.is_archived
    const question = toArchive
      ? `نقل الفاتورة ${invoice.invoice_number} (${accountName}) إلى المؤرشفة؟`
      : `إرجاع الفاتورة ${invoice.invoice_number} (${accountName}) إلى مطلوب تسعيرها؟`

    if (!window.confirm(question)) return

    setBusyId(invoice.id)
    setMessage('')

    try {
      upsertInvoice(
        await setPricingInvoiceArchived(invoice.id, toArchive)
      )
      setMessage(
        toArchive
          ? `تم نقل الفاتورة ${invoice.invoice_number} إلى المؤرشفة`
          : `تم إرجاع الفاتورة ${invoice.invoice_number} إلى مطلوب تسعيرها`
      )
    } catch (error) {
      setMessage(`فشل النقل: ${error.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleRenameAccount(account) {
    const name = window.prompt('اسم الحساب الجديد', account.name)

    if (name === null || name.trim() === account.name) return

    try {
      upsertAccount(await renamePricingAccount(account.id, name))
    } catch (error) {
      setMessage(`فشل تعديل الاسم: ${error.message}`)
    }
  }

  async function handleEditInvoiceNumber(invoice) {
    const number = window.prompt(
      'رقم الفاتورة الصحيح',
      invoice.invoice_number
    )

    if (
      number === null ||
      cleanDocumentNumber(number) === invoice.invoice_number
    ) {
      return
    }

    try {
      upsertInvoice(
        await updatePricingInvoiceNumber(invoice.id, number)
      )
    } catch (error) {
      setMessage(`فشل تعديل الرقم: ${error.message}`)
    }
  }

  function openViewer(images, index, context) {
    setViewer({ images, index, context })
  }

  async function handleDeleteInvoice(invoice, accountName) {
    if (
      !window.confirm(
        `حذف الفاتورة ${invoice.invoice_number} من حساب ${accountName}؟`
      )
    ) {
      return
    }

    setBusyId(invoice.id)
    setMessage('')

    try {
      await deletePricingInvoice(invoice.id)
      setData((current) => ({
        ...current,
        invoices: current.invoices.filter((item) => item.id !== invoice.id)
      }))
      setMessage(`تم حذف الفاتورة ${invoice.invoice_number}`)
    } catch (error) {
      setMessage(`فشل الحذف: ${error.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteAccount(account) {
    if (!window.confirm(`حذف الحساب «${account.name}»؟`)) return

    setBusyId(account.id)
    setMessage('')

    try {
      await deletePricingAccount(account.id)
      setData((current) => ({
        ...current,
        accounts: current.accounts.filter((item) => item.id !== account.id)
      }))
      setMessage(`تم حذف الحساب ${account.name}`)
    } catch (error) {
      setMessage(`فشل الحذف: ${error.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const accountsWithAnyInvoice = new Set(
    data.invoices.map((invoice) => invoice.account_id)
  )
  const isArchiveTab = tab === 'archived'
  const isWaitingTab = tab === 'waiting'

  return (
    <div className="pr-page" dir="rtl">
      <header className="pr-topbar">
        <div className="pr-brand">
          <strong>دبوس البسطة</strong>
          <h1>مراجعة أذونات التسليم للتسعير</h1>
          <small>{session.user.email}</small>
        </div>

        <div className="pr-topbar-actions">
          <button
            type="button"
            className="pr-icon-button"
            onClick={reload}
            disabled={loading}
            title="تحديث"
            aria-label="تحديث"
          >
            ↻
          </button>
          <button
            type="button"
            className="pr-icon-button pr-muted"
            onClick={signOut}
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            ⇥
          </button>
        </div>
      </header>

      <main className="pr-main">
        <div className="pr-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={isWaitingTab}
            className={isWaitingTab ? 'active' : ''}
            onClick={() => setTab('waiting')}
          >
            بانتظار الصور
            <span>{tabCounts.waiting}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pending'}
            className={tab === 'pending' ? 'active' : ''}
            onClick={() => setTab('pending')}
          >
            مطلوب تسعيرها
            <span>{tabCounts.pending}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isArchiveTab}
            className={isArchiveTab ? 'active' : ''}
            onClick={() => setTab('archived')}
          >
            المؤرشفة
            <span>{tabCounts.archived}</span>
          </button>
        </div>

        <section className="pr-filters">
          <FilterInput
            label="الحساب"
            placeholder="اسم الحساب أو جزء منه"
            value={filters.account}
            onChange={(value) => updateFilter('account', value)}
          />
          <FilterInput
            label="رقم الفاتورة"
            placeholder="رقم الفاتورة"
            value={filters.invoice}
            onChange={(value) => updateFilter('invoice', value)}
          />
          <FilterInput
            label="رقم إذن التسليم"
            placeholder={isWaitingTab ? 'لا يوجد صور هنا' : 'رقم الإذن'}
            value={isWaitingTab ? '' : filters.delivery}
            disabled={isWaitingTab}
            onChange={(value) => updateFilter('delivery', value)}
          />
        </section>

        <div className="pr-toolbar">
          <p className="pr-result-count">
            {tree.accounts.length} حساب · {tree.invoicesCount} فاتورة
            {!isWaitingTab && ` · ${tree.imagesCount} صورة`}
            {hasFilter && (
              <button
                type="button"
                className="pr-link-button"
                onClick={clearFilters}
              >
                مسح البحث
              </button>
            )}
          </p>

          {!isArchiveTab && (
            <div className="pr-add-buttons">
              <button
                type="button"
                className="pr-primary"
                onClick={() => setModal({ mode: 'register' })}
              >
                + ورقة جديدة
              </button>
              <button
                type="button"
                onClick={() => setModal({ mode: 'images' })}
              >
                + صور
              </button>
            </div>
          )}
        </div>

        {message && (
          <p
            className={
              message.startsWith('فشل') || message.startsWith('تعذر')
                ? 'pr-message error'
                : 'pr-message'
            }
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="pr-empty">جارٍ التحميل...</p>
        ) : tree.accounts.length === 0 ? (
          <p className="pr-empty">
            {hasFilter
              ? 'لا توجد نتائج لهذا البحث'
              : isArchiveTab
                ? 'لا توجد فواتير مؤرشفة'
                : isWaitingTab
                  ? 'كل الفواتير المسجلة فيها صور. اضغط «+ ورقة جديدة» لتسجيل فواتير جديدة.'
                  : 'لا توجد فواتير مطلوب تسعيرها. اضغط «+ صور» للبدء.'}
          </p>
        ) : (
          <ul className="pr-tree">
            {tree.accounts.map((group) => {
              const accountOpen = isOpen('accounts', group.account.id)

              return (
                <li key={group.account.id} className="pr-account">
                  <div className="pr-account-row">
                    <button
                      type="button"
                      className="pr-row-toggle"
                      onClick={() =>
                        toggleOpen('accounts', group.account.id)
                      }
                      aria-expanded={accountOpen}
                    >
                      <span className="pr-caret">
                        {accountOpen ? '▾' : '◂'}
                      </span>
                      <strong>{group.account.name}</strong>
                      <small>
                        {isWaitingTab
                          ? group.invoices.length
                            ? `${group.invoices.length} فاتورة بانتظار الصور`
                            : 'بدون فواتير'
                          : `${group.invoices.length} فاتورة · ${group.imagesCount} صورة`}
                      </small>
                      {group.invoices.length > 0 && (
                        <span className="pr-account-summary">
                          {invoicesSummary(group.invoices, isWaitingTab)}
                        </span>
                      )}
                    </button>

                    <div className="pr-row-actions">
                      <button
                        type="button"
                        className="pr-small-button pr-ghost"
                        onClick={() => handleRenameAccount(group.account)}
                        title="تعديل اسم الحساب"
                        aria-label="تعديل اسم الحساب"
                      >
                        ✎
                      </button>
                      {isWaitingTab &&
                        !accountsWithAnyInvoice.has(group.account.id) && (
                          <button
                            type="button"
                            className="pr-small-button pr-delete"
                            disabled={busyId === group.account.id}
                            onClick={() => handleDeleteAccount(group.account)}
                          >
                            حذف
                          </button>
                        )}
                      {!isArchiveTab && (
                        <button
                          type="button"
                          className="pr-small-button"
                          onClick={() =>
                            setModal({
                              mode: 'register',
                              accountId: group.account.id
                            })
                          }
                        >
                          + فاتورة
                        </button>
                      )}
                    </div>
                  </div>

                  {accountOpen && group.invoices.length > 0 && (
                    <ul className="pr-invoices">
                      {group.invoices.map((item) => {
                        const { invoice } = item
                        const invoiceOpen = isOpen('invoices', invoice.id)
                        const filteredOut =
                          item.shownImages.length !==
                          item.allImages.length

                        return (
                          <li key={invoice.id} className="pr-invoice">
                            <div className="pr-invoice-row">
                              <button
                                type="button"
                                className="pr-row-toggle"
                                onClick={() =>
                                  toggleOpen('invoices', invoice.id)
                                }
                                aria-expanded={invoiceOpen}
                              >
                                <span className="pr-caret">
                                  {isWaitingTab
                                    ? '•'
                                    : invoiceOpen
                                      ? '▾'
                                      : '◂'}
                                </span>
                                <strong>
                                  فاتورة {invoice.invoice_number}
                                </strong>
                                <small>
                                  {isWaitingTab
                                    ? 'بدون صور بعد'
                                    : `${countDeliveries(item.allImages)} إذن · ${item.allImages.length} صورة`}
                                  {filteredOut &&
                                    ` (ظاهر ${item.shownImages.length})`}
                                </small>
                              </button>

                              <div className="pr-row-actions">
                                <button
                                  type="button"
                                  className="pr-small-button pr-ghost"
                                  onClick={() =>
                                    handleEditInvoiceNumber(invoice)
                                  }
                                  title="تعديل رقم الفاتورة"
                                  aria-label="تعديل رقم الفاتورة"
                                >
                                  ✎
                                </button>
                                {!isArchiveTab && (
                                  <button
                                    type="button"
                                    className="pr-small-button"
                                    onClick={() =>
                                      setModal({
                                        mode: 'images',
                                        accountId: group.account.id,
                                        invoiceId: invoice.id
                                      })
                                    }
                                  >
                                    + صور
                                  </button>
                                )}
                                {isWaitingTab ? (
                                  <button
                                    type="button"
                                    className="pr-small-button pr-delete"
                                    disabled={busyId === invoice.id}
                                    onClick={() =>
                                      handleDeleteInvoice(
                                        invoice,
                                        group.account.name
                                      )
                                    }
                                  >
                                    حذف
                                  </button>
                                ) : (
                                <button
                                  type="button"
                                  className={
                                    isArchiveTab
                                      ? 'pr-small-button pr-restore'
                                      : 'pr-small-button pr-archive'
                                  }
                                  disabled={busyId === invoice.id}
                                  onClick={() =>
                                    handleArchiveToggle(
                                      invoice,
                                      group.account.name
                                    )
                                  }
                                >
                                  {busyId === invoice.id
                                    ? '...'
                                    : isArchiveTab
                                      ? 'إرجاع للتسعير'
                                      : 'أرشفة'}
                                </button>
                                )}
                              </div>
                            </div>

                            {invoiceOpen && !isWaitingTab && (
                              <InvoiceImages
                                images={item.shownImages}
                                sortMode={imageSort}
                                onSortChange={changeImageSort}
                                onImageDeleted={removeImage}
                                onOpen={(orderedImages, index) =>
                                  openViewer(orderedImages, index, {
                                    accountName: group.account.name,
                                    invoiceNumber: invoice.invoice_number
                                  })
                                }
                              />
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>

      <Link
        to="/papers"
        className="pr-papers-shortcut"
        title="صفحات الأوراق"
      >
        ▤ الأوراق
      </Link>

      {modal?.mode === 'register' && (
        <RegisterModal
          initialAccountId={modal.accountId || null}
          accounts={data.accounts}
          invoices={data.invoices}
          imagesByInvoice={imagesByInvoice}
          onAccountSaved={upsertAccount}
          onInvoiceSaved={upsertInvoice}
          onImageUploaded={addImage}
          onClose={() => setModal(null)}
        />
      )}

      {modal && modal.mode !== 'register' && (
        <AddModal
          key={JSON.stringify(modal)}
          initial={modal}
          accounts={data.accounts}
          invoices={data.invoices}
          imagesByInvoice={imagesByInvoice}
          onAccountSaved={upsertAccount}
          onInvoiceSaved={upsertInvoice}
          onImageUploaded={addImage}
          onClose={() => setModal(null)}
        />
      )}

      {viewer && (
        <ImageViewer
          viewer={viewer}
          setViewer={setViewer}
          onImageUpdated={replaceImage}
          onImageDeleted={removeImage}
          accounts={data.accounts}
          invoices={data.invoices}
          imagesByInvoice={imagesByInvoice}
          onAccountSaved={upsertAccount}
          onInvoiceSaved={upsertInvoice}
        />
      )}
    </div>
  )
}

function FilterInput({
  label,
  placeholder,
  value,
  onChange,
  disabled = false
}) {
  return (
    <label className="pr-filter">
      <span>{label}</span>
      <div className="pr-filter-input">
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          disabled={disabled}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`مسح ${label}`}
          >
            ×
          </button>
        )}
      </div>
    </label>
  )
}

// =====================================================
// صور الفاتورة مقسمة حسب رقم إذن التسليم
// =====================================================

function InvoiceImages({
  images,
  sortMode,
  onSortChange,
  onOpen,
  onImageDeleted
}) {
  const groups = useMemo(
    () => groupByDelivery(images, sortMode),
    [images, sortMode]
  )
  // كم مرة متكرر كل رقم إذن بهالفاتورة
  const deliveryCounts = useMemo(() => {
    const counts = new Map()

    for (const image of images) {
      if (!image.delivery_number) continue
      counts.set(
        image.delivery_number,
        (counts.get(image.delivery_number) || 0) + 1
      )
    }

    return counts
  }, [images])
  const orderedImages = useMemo(
    () => groups.flatMap((group) => group.images),
    [groups]
  )
  const indexById = useMemo(
    () =>
      new Map(orderedImages.map((image, index) => [image.id, index])),
    [orderedImages]
  )
  const [urls, setUrls] = useState({})
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  async function deleteDuplicate(image) {
    if (!window.confirm(`حذف هذه الصورة من إذن التسليم ${image.delivery_number}؟`)) {
      return
    }

    setDeletingId(image.id)
    setError('')

    try {
      await deletePricingImage(image.id)
      onImageDeleted?.(image.id)
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    let active = true

    // الصورة الكاملة (مش المصغرة) لأنها بتنعرض بعرض الشاشة
    const paths = orderedImages.map((image) => image.image_path)

    getSignedImageUrls(paths)
      .then((result) => {
        if (active) setUrls(result)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })

    return () => {
      active = false
    }
  }, [orderedImages])

  return (
    <div className="pr-deliveries">
      {error && (
        <p className="pr-message error">تعذر تحميل الصور: {error}</p>
      )}

      <div className="pr-sort" role="group" aria-label="ترتيب الأوراق">
        <span>الترتيب:</span>
        {IMAGE_SORTS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={sortMode === item.value ? 'active' : ''}
            onClick={() => onSortChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {groups.map((group) => {
        // نفس رقم الإذن أكتر من صورة بنفس الفاتورة (الأوراق بدون رقم ما منحسبها)
        const duplicateCount = deliveryCounts.get(group.deliveryNumber) || 0
        const duplicated = Boolean(group.deliveryNumber) && duplicateCount > 1

        return (
        <div
          key={group.key}
          className={duplicated ? 'pr-delivery duplicated' : 'pr-delivery'}
        >
          {duplicated && (
            <p className="pr-alert">
              تنبيه: إذن التسليم {group.deliveryNumber} مكرر بهالفاتورة (
              {duplicateCount} صور). تأكد إنها مش نفس الورقة، واحذف
              المكرر.
            </p>
          )}
          <h4>
            {group.deliveryNumber
              ? `إذن تسليم ${group.deliveryNumber}`
              : 'بدون رقم إذن'}
            <small>{group.images.length} صورة</small>
          </h4>

          <div className="pr-full-list">
            {group.images.map((image, groupIndex) => {
              const index = indexById.get(image.id)
              const url = urls[image.image_path]

              return (
                <button
                  type="button"
                  key={image.id}
                  className="pr-full-image"
                  onClick={() => onOpen(orderedImages, index)}
                  title="اضغط للتكبير أو التعديل"
                >
                  {url ? (
                    <img
                      src={url}
                      alt={`إذن ${image.delivery_number || 'بدون رقم'} صورة ${groupIndex + 1}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="pr-full-placeholder">
                      جارٍ تحميل الصورة...
                    </span>
                  )}
                  <span className="pr-full-label">
                    {image.delivery_number
                      ? `إذن ${image.delivery_number}`
                      : 'بدون رقم'}{' '}
                    · {groupIndex + 1}/
                    {group.images.length}
                  </span>
                  {duplicated && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="pr-dup-delete"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!deletingId) deleteDuplicate(image)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation()
                          if (!deletingId) deleteDuplicate(image)
                        }
                      }}
                    >
                      {deletingId === image.id ? 'جارٍ الحذف...' : 'حذف الصورة'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        )
      })}
    </div>
  )
}

// =====================================================
// عرض الصورة بالحجم الكامل
// =====================================================

function ImageViewer({
  viewer,
  setViewer,
  onImageUpdated,
  onImageDeleted,
  accounts,
  invoices,
  imagesByInvoice,
  onAccountSaved,
  onInvoiceSaved
}) {
  const { images, index, context } = viewer
  const image = images[index]
  const [urls, setUrls] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const touchStart = useRef(null)

  const close = useCallback(() => setViewer(null), [setViewer])

  const go = useCallback(
    (step) => {
      setViewer((current) => {
        if (!current) return current

        const nextIndex = current.index + step

        if (nextIndex < 0 || nextIndex >= current.images.length) {
          return current
        }

        return { ...current, index: nextIndex }
      })
    },
    [setViewer]
  )

  useEffect(() => {
    if (!image) return

    let active = true
    const paths = [
      image.image_path,
      images[index + 1]?.image_path,
      images[index - 1]?.image_path
    ].filter(Boolean)

    getSignedImageUrls(paths)
      .then((result) => {
        if (active) setUrls((current) => ({ ...current, ...result }))
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })

    return () => {
      active = false
    }
  }, [image, images, index])

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') close()
      if (event.key === 'ArrowLeft') go(1)
      if (event.key === 'ArrowRight') go(-1)
    }

    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [close, go])

  if (!image) return null

  const url = urls[image.image_path]

  function handleEdited(updated, target) {
    onImageUpdated(updated)
    setEditing(false)
    setError('')

    if (updated.invoice_id === image.invoice_id) {
      setNotice('انحفظ التعديل')
      setViewer((current) => ({
        ...current,
        images: current.images.map((item) =>
          item.id === updated.id ? updated : item
        )
      }))
      return
    }

    // الصورة انتقلت لفاتورة ثانية: منشيلها من هالعرض
    setNotice(
      `انتقلت الصورة لـ «${target.accountName}» · فاتورة ${target.invoiceNumber}`
    )

    const remaining = images.filter((item) => item.id !== updated.id)

    if (remaining.length === 0) {
      window.alert(
        `انتقلت الصورة لـ «${target.accountName}» · فاتورة ${target.invoiceNumber}`
      )
      close()
    } else {
      setViewer((current) => ({
        ...current,
        images: remaining,
        index: Math.min(current.index, remaining.length - 1)
      }))
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        image.delivery_number
          ? `حذف هذه الصورة من إذن التسليم ${image.delivery_number}؟`
          : 'حذف هذه الصورة؟'
      )
    ) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await deletePricingImage(image.id)
      onImageDeleted(image.id)

      const remaining = images.filter((item) => item.id !== image.id)

      if (remaining.length === 0) {
        close()
      } else {
        setViewer((current) => ({
          ...current,
          images: remaining,
          index: Math.min(current.index, remaining.length - 1)
        }))
      }
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="pr-viewer"
      role="dialog"
      aria-modal="true"
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return

        const deltaX =
          event.changedTouches[0].clientX - touchStart.current
        touchStart.current = null

        // بالعربي: السحب لليمين = الصورة التالية
        if (deltaX > 60) go(1)
        if (deltaX < -60) go(-1)
      }}
    >
      <div className="pr-viewer-bar">
        <div>
          <strong>
            {context.accountName} · فاتورة {context.invoiceNumber}
          </strong>
          <small>
            {image.delivery_number
              ? `إذن تسليم ${image.delivery_number}`
              : 'بدون رقم إذن'}{' '}
            · صورة {index + 1} من{' '}
            {images.length}
          </small>
        </div>
        <button
          type="button"
          className="pr-icon-button"
          onClick={close}
          aria-label="إغلاق"
        >
          ×
        </button>
      </div>

      <div className="pr-viewer-image">
        {url ? <img src={url} alt="" /> : <span>جارٍ التحميل...</span>}
      </div>

      {error && <p className="pr-message error">{error}</p>}
      {notice && !error && <p className="pr-viewer-notice">{notice}</p>}

      <div className="pr-viewer-actions">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
        >
          → السابقة
        </button>
        <button
          type="button"
          onClick={() => {
            setNotice('')
            setEditing(true)
          }}
          disabled={busy}
        >
          تعديل
        </button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            فتح الأصل
          </a>
        )}
        <button
          type="button"
          className="pr-danger"
          onClick={handleDelete}
          disabled={busy}
        >
          حذف
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === images.length - 1}
        >
          التالية ←
        </button>
      </div>

      {editing && (
        <EditImageModal
          image={image}
          accounts={accounts}
          invoices={invoices}
          imagesByInvoice={imagesByInvoice}
          onAccountSaved={onAccountSaved}
          onInvoiceSaved={onInvoiceSaved}
          onImageUpdated={handleEdited}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

// =====================================================
// نافذة الإضافة: حساب ← فاتورة ← صور
// =====================================================

function getInitialStep({ mode, accountId, invoiceId }) {
  if (mode === 'images' && invoiceId) return 'images'
  if ((mode === 'invoice' || mode === 'images') && accountId) {
    return 'invoice'
  }

  return 'account'
}

function AddModal({
  initial,
  accounts,
  invoices,
  imagesByInvoice,
  onAccountSaved,
  onInvoiceSaved,
  onImageUploaded,
  onClose
}) {
  const [step, setStep] = useState(() => getInitialStep(initial))
  const [accountId, setAccountId] = useState(initial.accountId || null)
  const [invoiceId, setInvoiceId] = useState(initial.invoiceId || null)
  const [queueBusy, setQueueBusy] = useState(false)
  const [queueCount, setQueueCount] = useState(0)

  const account = accounts.find((item) => item.id === accountId)
  const invoice = invoices.find((item) => item.id === invoiceId)

  function requestClose() {
    if (queueBusy) {
      window.alert('انتظر حتى ينتهي رفع الصور')
      return
    }

    if (
      queueCount > 0 &&
      !window.confirm('في صور لم تُرفع بعد. إغلاق النافذة وتركها؟')
    ) {
      return
    }

    onClose()
  }

  const title =
    step === 'account'
      ? initial.mode === 'account'
        ? 'إضافة حساب'
        : 'اختر الحساب'
      : step === 'invoice'
        ? 'اختر أو أضف فاتورة'
        : 'إضافة صور أذونات التسليم'

  return (
    <div
      className="pr-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div className="pr-modal" role="dialog" aria-modal="true">
        <div className="pr-modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="pr-icon-button pr-muted"
            onClick={requestClose}
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        {(account || invoice) && (
          <div className="pr-breadcrumb">
            {account && (
              <button
                type="button"
                onClick={() => !queueBusy && setStep('account')}
                disabled={queueBusy}
              >
                الحساب: <strong>{account.name}</strong>
              </button>
            )}
            {invoice && step === 'images' && (
              <button
                type="button"
                onClick={() => !queueBusy && setStep('invoice')}
                disabled={queueBusy}
              >
                الفاتورة: <strong>{invoice.invoice_number}</strong>
              </button>
            )}
          </div>
        )}

        {step === 'account' && (
          <AccountStep
            accounts={accounts}
            invoices={invoices}
            focusNew={initial.mode === 'account'}
            onAccountSaved={onAccountSaved}
            onSelect={(selected) => {
              setAccountId(selected.id)
              setInvoiceId(null)
              setStep('invoice')
            }}
          />
        )}

        {step === 'invoice' && account && (
          <InvoiceStep
            account={account}
            invoices={invoices}
            imagesByInvoice={imagesByInvoice}
            onInvoiceSaved={onInvoiceSaved}
            onSelect={(selected) => {
              setInvoiceId(selected.id)
              setStep('images')
            }}
          />
        )}

        {step === 'images' && account && invoice && (
          <ImagesStep
            invoice={invoice}
            onImageUploaded={onImageUploaded}
            onBusyChange={setQueueBusy}
            onQueueChange={setQueueCount}
            onDone={requestClose}
          />
        )}
      </div>
    </div>
  )
}

function AccountStep({
  accounts,
  invoices,
  focusNew,
  onAccountSaved,
  onSelect
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const invoiceCounts = useMemo(() => {
    const counts = new Map()

    for (const invoice of invoices) {
      if (invoice.is_archived) continue
      counts.set(
        invoice.account_id,
        (counts.get(invoice.account_id) || 0) + 1
      )
    }

    return counts
  }, [invoices])

  const tokens = getSearchTokens(text)
  const normalizedText = normalizeSearchText(text)
  const matches = accounts
    .filter((account) => matchesSearch(account.name, tokens))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  const exactMatch = accounts.find(
    (account) => normalizeSearchText(account.name) === normalizedText
  )

  async function handleCreate() {
    setSaving(true)
    setError('')

    try {
      const account = await createPricingAccount(text)
      onAccountSaved(account)
      onSelect(account)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pr-step">
      <label className="pr-field">
        <span>
          {focusNew
            ? 'اسم الحساب الجديد'
            : 'ابحث عن الحساب أو اكتب اسم حساب جديد'}
        </span>
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()

            if (exactMatch) onSelect(exactMatch)
            else if (normalizedText && !saving) handleCreate()
          }}
          placeholder="اسم الحساب"
        />
      </label>

      {error && <p className="pr-message error">{error}</p>}

      {normalizedText && !exactMatch && (
        <button
          type="button"
          className="pr-primary pr-wide"
          onClick={handleCreate}
          disabled={saving}
        >
          {saving ? 'جارٍ الحفظ...' : `+ إضافة حساب جديد: «${text.trim()}»`}
        </button>
      )}

      {matches.length > 0 && (
        <>
          <p className="pr-hint">
            {focusNew && normalizedText
              ? 'حسابات مشابهة موجودة:'
              : 'أو اختر حسابًا موجودًا:'}
          </p>
          <ul className="pr-pick-list">
            {matches.slice(0, 60).map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => onSelect(account)}
                >
                  <strong>{account.name}</strong>
                  <small>
                    {invoiceCounts.get(account.id) || 0} فاتورة
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {matches.length > 60 && (
            <p className="pr-hint">
              يوجد {matches.length - 60} حساب آخر، اكتب جزءًا من الاسم.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function InvoiceStep({
  account,
  invoices,
  imagesByInvoice,
  onInvoiceSaved,
  onSelect
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const accountInvoices = invoices.filter(
    (invoice) => invoice.account_id === account.id
  )
  const cleanText = cleanDocumentNumber(text)
  const tokens = getSearchTokens(text)
  const activeMatches = accountInvoices
    .filter(
      (invoice) =>
        !invoice.is_archived &&
        matchesSearch(invoice.invoice_number, tokens)
    )
    .sort((a, b) =>
      compareNumbersDesc(a.invoice_number, b.invoice_number)
    )
  const exactInvoice = accountInvoices.find(
    (invoice) => invoice.invoice_number === cleanText
  )

  async function handleCreate() {
    setSaving(true)
    setError('')

    try {
      const invoice = await createPricingInvoice({
        accountId: account.id,
        invoiceNumber: text
      })
      onInvoiceSaved(invoice)
      onSelect(invoice)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(invoice) {
    setSaving(true)
    setError('')

    try {
      const restored = await setPricingInvoiceArchived(invoice.id, false)
      onInvoiceSaved(restored)
      onSelect(restored)
    } catch (restoreError) {
      setError(restoreError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pr-step">
      <label className="pr-field">
        <span>رقم الفاتورة (من برنامج المحاسبة)</span>
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()

            if (exactInvoice && !exactInvoice.is_archived) {
              onSelect(exactInvoice)
            } else if (cleanText && !exactInvoice && !saving) {
              handleCreate()
            }
          }}
          placeholder="مثال: 1500"
        />
      </label>

      {error && <p className="pr-message error">{error}</p>}

      {cleanText && !exactInvoice && (
        <button
          type="button"
          className="pr-primary pr-wide"
          onClick={handleCreate}
          disabled={saving}
        >
          {saving
            ? 'جارٍ الحفظ...'
            : `+ إضافة فاتورة رقم ${cleanText}`}
        </button>
      )}

      {exactInvoice?.is_archived && (
        <div className="pr-notice">
          <p>
            الفاتورة {exactInvoice.invoice_number} موجودة في المؤرشفة لهذا
            الحساب.
          </p>
          <button
            type="button"
            className="pr-primary"
            onClick={() => handleRestore(exactInvoice)}
            disabled={saving}
          >
            إرجاعها لمطلوب تسعيرها وإضافة صور
          </button>
        </div>
      )}

      {activeMatches.length > 0 && (
        <>
          <p className="pr-hint">أو اختر فاتورة موجودة:</p>
          <ul className="pr-pick-list">
            {activeMatches.map((invoice) => {
              const images = imagesByInvoice.get(invoice.id) || []

              return (
                <li key={invoice.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(invoice)}
                  >
                    <strong>فاتورة {invoice.invoice_number}</strong>
                    <small>
                      {images.length
                        ? `${countDeliveries(images)} إذن · ${images.length} صورة`
                        : 'بدون صور بعد'}
                    </small>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {accountInvoices.length === 0 && !cleanText && (
        <p className="pr-hint">
          لا توجد فواتير لهذا الحساب بعد. الحساب يظهر بالصفحة بعد إضافة
          أول صورة.
        </p>
      )}
    </div>
  )
}

let queueSequence = 0

function ImagesStep({
  invoice,
  onImageUploaded,
  onBusyChange,
  onQueueChange,
  onDone
}) {
  const [deliveryNumber, setDeliveryNumber] = useState('')
  const [queue, setQueue] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const deliveryInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const filesInputRef = useRef(null)
  const queueRef = useRef(queue)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    onQueueChange(queue.filter((item) => item.status !== 'done').length)
  }, [queue, onQueueChange])

  useEffect(() => {
    onBusyChange(uploading)
  }, [uploading, onBusyChange])

  useEffect(
    () => () => {
      for (const item of queueRef.current) {
        URL.revokeObjectURL(item.previewUrl)
      }
    },
    []
  )

  function openPicker(inputRef) {
    setError('')
    inputRef.current?.click()
  }

  function addFiles(fileList) {
    const files = [...(fileList || [])].filter((file) =>
      file.type.startsWith('image/')
    )

    if (files.length === 0) return

    const number = cleanDocumentNumber(deliveryNumber)

    setSummary('')
    setQueue((current) => [
      ...current,
      ...files.map((file) => {
        queueSequence += 1

        return {
          key: `q${queueSequence}`,
          file,
          previewUrl: URL.createObjectURL(file),
          deliveryNumber: number,
          status: 'waiting',
          error: ''
        }
      })
    ])
  }

  function updateItem(key, changes) {
    setQueue((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...changes } : item
      )
    )
  }

  function removeItem(key) {
    setQueue((current) => {
      const item = current.find((entry) => entry.key === key)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return current.filter((entry) => entry.key !== key)
    })
  }

  const pendingItems = queue.filter((item) => item.status !== 'done')
  const doneCount = queue.filter((item) => item.status === 'done').length

  async function handleUpload() {

    const items = queueRef.current.filter(
      (item) => item.status !== 'done'
    )

    if (items.length === 0) return

    setUploading(true)
    setError('')
    setSummary('')

    let cursor = 0
    let success = 0
    let failed = 0

    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor]
        cursor += 1

        updateItem(item.key, { status: 'uploading', error: '' })

        try {
          const saved = await uploadPricingImage({
            invoiceId: invoice.id,
            deliveryNumber: item.deliveryNumber,
            file: item.file
          })

          onImageUploaded(saved)
          updateItem(item.key, { status: 'done' })
          success += 1
        } catch (uploadError) {
          updateItem(item.key, {
            status: 'failed',
            error: uploadError.message
          })
          failed += 1
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(UPLOAD_WORKERS, items.length) },
        worker
      )
    )

    setUploading(false)

    // نشيل الصور التي نجحت من القائمة
    setQueue((current) => {
      for (const item of current) {
        if (item.status === 'done') URL.revokeObjectURL(item.previewUrl)
      }

      return current.filter((item) => item.status !== 'done')
    })

    if (failed) {
      setError(
        `تم رفع ${success} صورة، وفشل ${failed}. اضغط «رفع» مرة ثانية لإعادة المحاولة.`
      )
    } else {
      setSummary(`تم رفع ${success} صورة إلى الفاتورة ${invoice.invoice_number}`)
      setDeliveryNumber('')
      deliveryInputRef.current?.focus()
    }
  }

  return (
    <div className="pr-step">
      <input
        ref={cameraInputRef}
        className="pr-hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={filesInputRef}
        className="pr-hidden-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <label className="pr-field">
        <span>رقم إذن التسليم</span>
        <input
          ref={deliveryInputRef}
          autoFocus
          value={deliveryNumber}
          onChange={(event) => setDeliveryNumber(event.target.value)}
          placeholder="اختياري، مثال: 320"
          disabled={uploading}
        />
      </label>

      <div className="pr-pick-buttons">
        <button
          type="button"
          onClick={() => openPicker(cameraInputRef)}
          disabled={uploading}
        >
          الكاميرا
        </button>
        <button
          type="button"
          onClick={() => openPicker(filesInputRef)}
          disabled={uploading}
        >
          من الملفات
        </button>
      </div>

      <p className="pr-hint">
        الصور التي تختارها تأخذ رقم الإذن المكتوب فوق. لإذن ثانٍ غيّر الرقم
        وأضف صوره، ثم ارفع الكل مرة واحدة.
      </p>

      {error && <p className="pr-message error">{error}</p>}
      {summary && <p className="pr-message">{summary}</p>}

      {queue.length > 0 && (
        <ul className="pr-queue">
          {queue.map((item) => (
            <li key={item.key} className={`pr-queue-item ${item.status}`}>
              <img src={item.previewUrl} alt="" />
              <input
                value={item.deliveryNumber}
                onChange={(event) =>
                  updateItem(item.key, {
                    deliveryNumber: event.target.value
                  })
                }
                disabled={uploading || item.status === 'done'}
                aria-label="رقم إذن التسليم لهذه الصورة"
              />
              <small>
                {item.status === 'waiting' && 'بانتظار الرفع'}
                {item.status === 'uploading' && 'جارٍ الرفع...'}
                {item.status === 'done' && 'تم'}
                {item.status === 'failed' && `فشل: ${item.error}`}
              </small>
              {!uploading && item.status !== 'done' && (
                <button
                  type="button"
                  className="pr-queue-remove"
                  onClick={() => removeItem(item.key)}
                  aria-label="إزالة الصورة"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <div className="pr-progress">
          <div
            style={{
              width: `${Math.round((doneCount / Math.max(queue.length, 1)) * 100)}%`
            }}
          />
          <span>
            {doneCount} من {queue.length}
          </span>
        </div>
      )}

      <div className="pr-modal-actions">
        <button
          type="button"
          className="pr-primary"
          onClick={handleUpload}
          disabled={uploading || pendingItems.length === 0}
        >
          {uploading
            ? 'جارٍ الرفع...'
            : `رفع ${pendingItems.length} صورة`}
        </button>
        <button
          type="button"
          className="pr-muted"
          onClick={onDone}
          disabled={uploading}
        >
          انتهيت
        </button>
      </div>
    </div>
  )
}
