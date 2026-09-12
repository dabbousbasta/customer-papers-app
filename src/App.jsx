import {
  useEffect,
  useRef,
  useState
} from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from 'react-router-dom'
import { supabase } from './lib/supabase'
import {
  createAndDownloadBackup
} from './lib/backup'
import {
  archiveCustomer,
  createCustomer,
  getCustomers,
  restoreCustomer,
  updateCustomer
} from './lib/customers'
import {
  archivePaper,
  calculateBalance,
  closePaper,
  createPaper,
  getPapers,
  movePapersToCustomer,
  reopenPaper,
  restorePaper,
  updatePaperAmount,
  updatePaperImagePath,
  updatePaperAmountAndDate,
} from './lib/papers'
import {
  addPaperPage,
  createPaperImageUrl,
  getPaperImageHistory,
  removePaperImage,
  savePaperImageHistory,
  setPaperCoverImage,
  uploadPaperImage
} from './lib/storage'
import { createPayment } from './lib/payments'
import {
  getActivitiesForDate,
  getActivityUserName
} from './lib/activity'
import {
  buildCustomerWhatsAppReport,
  openWhatsAppMessage
} from './lib/whatsapp'

const RECENT_CUSTOMERS_KEY =
  'customer-papers-recent-customers'
function getActivePaymentsTotal(papers = []) {
  return papers.reduce(
    (sum, paper) =>
      sum +
      (paper.payments || [])
        .filter((payment) => !payment.is_archived)
        .reduce(
          (paymentsSum, payment) =>
            paymentsSum + Number(payment.amount || 0),
          0
        ),
    0
  )
}

function getOpenBalanceTotal(papers = []) {
  return papers
    .filter((paper) => paper.status === 'open')
    .reduce((sum, paper) => {
      const balance = calculateBalance(
        paper.total_amount,
        paper.payments
      )

      return balance === null
        ? sum
        : sum + balance
    }, 0)
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data } =
        await supabase.auth.getSession()

      if (!active) return

      setSession(data.session)
      setLoading(false)
    }

    loadSession()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
        setLoading(false)
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (loading) {
    return (
      <main dir="rtl" className="page-center">
        <p>جارٍ التحميل...</p>
      </main>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <CustomerSelectPage
            session={session}
            signOut={signOut}
          />
        }
      />

      <Route
        path="/customer/:customerId/*"
        element={
          <CustomerPage
            session={session}
            signOut={signOut}
          />
        }
      />

            <Route
        path="/activities"
        element={
          <ActivitiesPage
            session={session}
            signOut={signOut}
          />
        }
      />
      <Route
        path="/debt-report"
        element={
          <DebtReportPage
            session={session}
            signOut={signOut}
          />
        }
      />
<Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  )
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] =
    useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function login(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      })

    if (error) {
      setMessage(`فشل تسجيل الدخول: ${error.message}`)
    }

    setSaving(false)
  }

  return (
    <main dir="rtl" className="auth-page">
      <section className="auth-card">
        <h1>دبوس البسطة</h1>
        <p>نظام أوراق الزبائن</p>

        <form onSubmit={login}>
          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              required
            />
          </label>

          <label>
            كلمة المرور

            <div className="password-input-wrap">
              <input
                type={
                  showPassword ? 'text' : 'password'
                }
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="password-toggle-button"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
                aria-label={
                  showPassword
                    ? 'إخفاء كلمة المرور'
                    : 'إظهار كلمة المرور'
                }
                title={
                  showPassword
                    ? 'إخفاء كلمة المرور'
                    : 'إظهار كلمة المرور'
                }
              >
                {showPassword ? '◉' : '◌'}
              </button>
            </div>
          </label>

          <button type="submit" disabled={saving}>
            {saving
              ? 'جارٍ الدخول...'
              : 'تسجيل الدخول'}
          </button>
        </form>

        {message && (
          <p className="message error">{message}</p>
        )}
      </section>
    </main>
  )
}

function Header({
  session,
  signOut,
  title
}) {
  const [backupStatus, setBackupStatus] = useState('')
  const [creatingBackup, setCreatingBackup] =
    useState(false)
  const [showBackupOptions, setShowBackupOptions] =
    useState(false)

  async function handleBackup(includeImages) {
    const confirmationMessage = includeImages
      ? 'سيتم تنزيل نسخة كاملة تشمل كل الزبائن والأوراق ' +
        'والدفعات والصور الحالية وصور السجل. قد يستغرق ' +
        'ذلك وقتًا إذا كان عدد الصور كبيرًا.\n\n' +
        'هل تريد المتابعة؟'
      : 'سيتم تنزيل نسخة سريعة تشمل كل الزبائن والأوراق ' +
        'والدفعات، ولكن من دون الصور. هذه النسخة مناسبة ' +
        'للحفظ اليومي.\n\nهل تريد المتابعة؟'

    const confirmed = window.confirm(
      confirmationMessage
    )

    if (!confirmed) {
      return
    }

    setShowBackupOptions(false)
    setCreatingBackup(true)

    setBackupStatus(
      includeImages
        ? 'جارٍ تجهيز النسخة الكاملة مع الصور...'
        : 'جارٍ تجهيز النسخة السريعة بدون الصور...'
    )

    try {
      const result = await createAndDownloadBackup({
        includeImages,
        onProgress: ({ message }) => {
          setBackupStatus(message)
        }
      })

      const failedCount = result.failedImages.length
      const imagePart = includeImages
        ? `، ${result.imagesCount} صورة`
        : ''

      const failedPart = failedCount
        ? `، وتعذر تنزيل ${failedCount} صورة`
        : ''

      setBackupStatus(
        `تم تنزيل النسخة ` +
        `${includeImages ? 'الكاملة مع الصور' : 'السريعة بدون الصور'} ` +
        `بنجاح: ${result.customersCount} زبون، ` +
        `${result.papersCount} ورقة، ` +
        `${result.paymentsCount} دفعة` +
        imagePart +
        failedPart
      )
    } catch (error) {
      setBackupStatus(
        `فشل إنشاء النسخة الاحتياطية: ${error.message}`
      )
    } finally {
      setCreatingBackup(false)
    }
  }

  return (
    <>
      <header className="topbar compact-topbar">
        <div className="topbar-brand">
          <Link to="/" className="app-brand-link">
            دبوس البسطة
          </Link>

          <h1>{title}</h1>
          <p>{session.user.email}</p>
        </div>

        <div className="topbar-actions compact-topbar-actions">
          <Link
            to="/"
            className="header-icon-button home-header-button"
            aria-label="اختيار زبون آخر"
            title="اختيار زبون آخر"
          >
            ⌂
          </Link>

                    <Link
            to="/activities"
            className="header-icon-button activities-header-button"
            aria-label="سجل العمليات"
            title="سجل العمليات"
          >
            ◷
          </Link>

          <Link
            to="/debt-report"
            className="header-icon-button debt-report-header-button"
            aria-label="تقرير مدة الديون"
            title="تقرير مدة الديون"
          >
            ⏳
          </Link>

          <div className="backup-actions">
            <button
              type="button"
              onClick={() =>
                setShowBackupOptions(
                  !showBackupOptions
                )
              }
              className="header-icon-button backup-button"
              disabled={creatingBackup}
              aria-label="نسخة احتياطية"
              title="نسخة احتياطية"
            >
              {creatingBackup ? '…' : '⤓'}
            </button>

           {showBackupOptions && !creatingBackup && (
  <div
    className="backup-options compact-backup-options"
    aria-label="اختيار نوع النسخة الاحتياطية"
  >
    <button
      type="button"
      className="backup-quick-option"
      onClick={() => handleBackup(false)}
      aria-label="نسخة احتياطية سريعة بدون الصور"
      title="نسخة سريعة بدون الصور"
    >
      ⚡
    </button>

    <button
      type="button"
      className="backup-full-option"
      onClick={() => handleBackup(true)}
      aria-label="نسخة احتياطية كاملة مع الصور"
      title="نسخة كاملة مع الصور"
    >
      🗃
    </button>
  </div>
)}
          </div>

          <button
            type="button"
            onClick={signOut}
            className="header-icon-button secondary-button"
            disabled={creatingBackup}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            ⇥
          </button>
        </div>
      </header>

      {backupStatus && (
        <p
          className={
            backupStatus.startsWith('فشل')
              ? 'message error backup-status'
              : 'message backup-status'
          }
        >
          {backupStatus}
        </p>
      )}
    </>
  )
}
function CustomerSelectPage({
  session,
  signOut
}) {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [recentCustomers, setRecentCustomers] =
    useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] =
    useState(false)
  const [showNewCustomerForm, setShowNewCustomerForm] =
    useState(false)
  const [newCustomerName, setNewCustomerName] =
    useState('')
  const [newCustomerPhone, setNewCustomerPhone] =
    useState('')
  const [newCustomerNotes, setNewCustomerNotes] =
    useState('')
  const [savingCustomer, setSavingCustomer] =
    useState(false)
  const [paperPickerCustomer, setPaperPickerCustomer] =
    useState(null)
  const [openPapers, setOpenPapers] = useState([])
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')

  useEffect(() => {
    loadCustomers('', false)
    loadOpenPapers()
    loadRecentCustomers()
  }, [])

  async function loadCustomers(
    searchText,
    archivedOnly = showArchived
  ) {
    setLoading(true)

    const { data, error } = await getCustomers(
      searchText,
      { archivedOnly }
    )

    if (error) {
      setMessage(error.message)
    } else {
      setCustomers(data || [])
    }

    setLoading(false)
  }

    async function loadOpenPapers() {
    try {
      const data = await getPapers({
        includeArchived: false
      })

      setOpenPapers(
        (data || []).filter(
          (paper) => paper.status === 'open'
        )
      )
    } catch {
      setOpenPapers([])
    }
  }

  function loadRecentCustomers() {
    try {
      const stored = localStorage.getItem(
        RECENT_CUSTOMERS_KEY
      )

      if (!stored) {
        setRecentCustomers([])
        return
      }

      const parsed = JSON.parse(stored)

      setRecentCustomers(
        Array.isArray(parsed) ? parsed : []
      )
    } catch {
      setRecentCustomers([])
    }
  }

  function saveRecentCustomer(customer) {
    const withoutCurrent = recentCustomers.filter(
      (item) => item.id !== customer.id
    )

    const updated = [
      {
        id: customer.id,
        name: customer.name,
        phone: customer.phone || '',
        usedAt: new Date().toISOString()
      },
      ...withoutCurrent
    ].slice(0, 8)

    setRecentCustomers(updated)

    localStorage.setItem(
      RECENT_CUSTOMERS_KEY,
      JSON.stringify(updated)
    )
  }

  function removeRecentCustomer(customerId) {
    const updated = recentCustomers.filter(
      (item) => item.id !== customerId
    )

    setRecentCustomers(updated)

    localStorage.setItem(
      RECENT_CUSTOMERS_KEY,
      JSON.stringify(updated)
    )
  }

  function openCustomer(customer) {
    if (customer.is_archived) {
      setMessage(
        'هذا الزبون مؤرشف. ألغِ الأرشفة أولًا لفتحه.'
      )
      return
    }

    saveRecentCustomer(customer)

    navigate(`/customer/${customer.id}/papers`)
  }

  function openQuickPaper(customer) {
    if (customer.is_archived) {
      setMessage(
        'لا يمكن إضافة ورقة لزبون مؤرشف. ألغِ الأرشفة أولًا.'
      )
      return
    }

    setPaperPickerCustomer(customer)
  }

  function chooseHomePaperSource(pick) {
    if (!paperPickerCustomer) {
      return
    }

    const customer = paperPickerCustomer

    setPaperPickerCustomer(null)
    saveRecentCustomer(customer)

    navigate(
      `/customer/${customer.id}/papers?addPaper=1&pick=${pick}`
    )
  }
  function clearRecentCustomers() {
    localStorage.removeItem(RECENT_CUSTOMERS_KEY)
    setRecentCustomers([])
  }

  function cancelNewCustomer() {
    setShowNewCustomerForm(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
    setNewCustomerNotes('')
  }

  async function saveNewCustomer(event) {
    event.preventDefault()

    if (!newCustomerName.trim()) {
      setMessage('اسم الزبون مطلوب')
      return
    }

    setSavingCustomer(true)
    setMessage('')

    try {
      const customer = await createCustomer({
        name: newCustomerName,
        phone: newCustomerPhone,
        notes: newCustomerNotes
      })

      saveRecentCustomer(customer)
      cancelNewCustomer()

      navigate(`/customer/${customer.id}/papers`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSavingCustomer(false)
    }
  }

  async function changeArchivedView() {
    const nextValue = !showArchived

    setShowArchived(nextValue)
    setSearch('')
    setMessage('')
    cancelNewCustomer()

    await loadCustomers('', nextValue)
  }

  async function restoreArchivedCustomer(customer) {
    try {
      setMessage('جارٍ إلغاء أرشفة الزبون...')

      await restoreCustomer(customer.id)
      removeRecentCustomer(customer.id)

      setMessage(
        `تم إلغاء أرشفة الزبون: ${customer.name}`
      )

      await loadCustomers(search, true)
    } catch (error) {
      setMessage(error.message)
    }
  }

    function getCustomerOpenStats(customerId) {
    const customerPapers = openPapers.filter(
      (paper) => paper.customer_id === customerId
    )

    const value = customerPapers.reduce(
      (sum, paper) =>
        sum + Number(paper.total_amount || 0),
      0
    )

    return {
      count: customerPapers.length,
      value
    }
  }

  const sortedCustomers = [...customers].sort(
    (a, b) => {
      let result = 0

      if (sortBy === 'name') {
        result = a.name.localeCompare(b.name, 'ar')
      } else if (sortBy === 'count') {
        result =
          getCustomerOpenStats(a.id).count -
          getCustomerOpenStats(b.id).count
      } else if (sortBy === 'value') {
        result =
          getCustomerOpenStats(a.id).value -
          getCustomerOpenStats(b.id).value
      }

      return sortDirection === 'asc' ? result : -result
    }
  )
return (
    <main dir="rtl" className="app-page">
      <Header
        session={session}
        signOut={signOut}
        title="اختيار الزبون"
      />

      <section className="compact-customer-toolbar">
        <input
          type="search"
          placeholder={
            showArchived
              ? 'ابحث عن زبون مؤرشف...'
              : 'ابحث عن اسم الزبون...'
          }
          value={search}
          onChange={(event) => {
            const value = event.target.value

            setSearch(value)
            loadCustomers(value, showArchived)
          }}
          aria-label={
            showArchived
              ? 'البحث عن زبون مؤرشف'
              : 'البحث عن زبون'
          }
        />

        <button
          type="button"
          className="compact-icon-button add-customer-icon-button"
          onClick={() =>
            setShowNewCustomerForm(!showNewCustomerForm)
          }
          disabled={showArchived}
          aria-label={
            showNewCustomerForm
              ? 'إلغاء إضافة زبون جديد'
              : 'إضافة زبون جديد'
          }
          title={
            showNewCustomerForm
              ? 'إلغاء إضافة زبون جديد'
              : 'إضافة زبون جديد'
          }
        >
          {showNewCustomerForm ? '×' : '+'}
        </button>

        <button
          type="button"
          className="compact-icon-button archive-icon-button"
          onClick={changeArchivedView}
          aria-label={
            showArchived
              ? 'العودة إلى الزبائن النشطين'
              : 'عرض أرشيف الزبائن'
          }
          title={
            showArchived
              ? 'العودة إلى الزبائن النشطين'
              : 'أرشيف الزبائن'
          }
        >
          {showArchived ? '↩' : '🗃'}
        </button>
      </section>

      <section className="compact-sort-toolbar">
        <label>
          الترتيب حسب
          <select
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value)
            }
          >
            <option value="name">الاسم</option>
            <option value="count">عدد الأوراق</option>
            <option value="value">القيمة</option>
          </select>
        </label>

        <button
          type="button"
          className="sort-direction-button"
          onClick={() =>
            setSortDirection(
              sortDirection === 'asc' ? 'desc' : 'asc'
            )
          }
          aria-label={
            sortDirection === 'asc'
              ? 'ترتيب تصاعدي'
              : 'ترتيب تنازلي'
          }
          title={
            sortDirection === 'asc'
              ? 'تصاعدي'
              : 'تنازلي'
          }
        >
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </section>

      {showNewCustomerForm && !showArchived && (
        <section className="form-card new-customer-form-card">
          <div className="form-card-title-row">
            <h2>إضافة زبون جديد</h2>

            <button
              type="button"
              className="form-close-button"
              onClick={cancelNewCustomer}
            >
              إغلاق
            </button>
          </div>

          <form onSubmit={saveNewCustomer}>
            <label>
              اسم الزبون
              <input
                type="text"
                value={newCustomerName}
                onChange={(event) =>
                  setNewCustomerName(event.target.value)
                }
                required
              />
            </label>

            <label>
              رقم الهاتف
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(event) =>
                  setNewCustomerPhone(event.target.value)
                }
              />
            </label>

            <label>
              ملاحظات
              <textarea
                value={newCustomerNotes}
                onChange={(event) =>
                  setNewCustomerNotes(event.target.value)
                }
                rows="3"
              />
            </label>

            <button
              type="submit"
              disabled={savingCustomer}
            >
              {savingCustomer
                ? 'جارٍ حفظ الزبون...'
                : 'حفظ الزبون وفتح أوراقه'}
            </button>
          </form>
        </section>
      )}

      {message && (
        <p className="message error">{message}</p>
      )}
      {!showArchived && (
        <HomeSummary />
      )}
      {!showArchived && recentCustomers.length > 0 && (
        <section className="compact-customer-section">
          <div className="compact-list-heading">
            <h2>آخر الزبائن</h2>

            <button
              type="button"
              className="clear-recent-button"
              onClick={clearRecentCustomers}
            >
              مسح
            </button>
          </div>

          <div className="compact-customer-list">
            {recentCustomers.map((customer) => (
              <article
                className="compact-customer-row"
                key={customer.id}
              >
                <button
                  type="button"
                  className="compact-customer-name"
                  onClick={() => openCustomer(customer)}
                >
                  <strong>{customer.name}</strong>

                  {customer.phone && (
                    <small>{customer.phone}</small>
                  )}
                </button>

                <button
                  type="button"
                  className="compact-paper-add-button"
                  onClick={() => openQuickPaper(customer)}
                  aria-label={`إضافة ورقة للزبون ${customer.name}`}
                  title={`إضافة ورقة للزبون ${customer.name}`}
                >
                  +
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="compact-customer-section">
        <div className="compact-list-heading">
          <h2>
            {showArchived
              ? 'الزبائن المؤرشفون'
              : search.trim()
                ? 'نتائج البحث'
                : 'كل الزبائن'}
          </h2>
        </div>

        {loading ? (
          <div className="empty-card">
            جارٍ تحميل الزبائن...
          </div>
        ) : customers.length === 0 ? (
          <div className="empty-card">
            {showArchived
              ? 'لا يوجد زبائن مؤرشفون'
              : search.trim()
                ? 'لا توجد نتائج مطابقة'
                : 'لا يوجد زبائن'}
          </div>
        ) : (
          <div className="compact-customer-list">
                        {sortedCustomers.map((customer) => {
              const openStats = getCustomerOpenStats(
                customer.id
              )

              return (
              <article
                className="compact-customer-row"
                key={customer.id}
              >
                <button
                  type="button"
                  className="compact-customer-name"
                  onClick={() => openCustomer(customer)}
                  disabled={customer.is_archived}
                  title={
                    customer.is_archived
                      ? 'الزبون مؤرشف، ألغِ الأرشفة أولًا'
                      : `فتح أوراق ${customer.name}`
                  }
                >
                  <strong>{customer.name}</strong>

                  {customer.phone && (
                    <small>{customer.phone}</small>
                  )}
                </button>

                {!showArchived && openStats.count > 0 && (
                  <span className="compact-customer-balance">
                    <small>{openStats.count} ورقة</small>
                    <strong>
                      {openStats.value.toFixed(2)}
                    </strong>
                  </span>
                )}

                {showArchived ? (
                  <button
                    type="button"
                    className="compact-restore-button"
                    onClick={() =>
                      restoreArchivedCustomer(customer)
                    }
                    aria-label={
                      `إلغاء أرشفة الزبون ${customer.name}`
                    }
                    title={
                      `إلغاء أرشفة الزبون ${customer.name}`
                    }
                  >
                    ↺
                  </button>
                ) : (
                  <button
                    type="button"
                    className="compact-paper-add-button"
                    onClick={() => openQuickPaper(customer)}
                    aria-label={
                      `إضافة ورقة للزبون ${customer.name}`
                    }
                    title={
                      `إضافة ورقة للزبون ${customer.name}`
                    }
                  >
                    +
                  </button>
                )}
              </article>
              )
            })}
          </div>
        )}
      </section>

      {paperPickerCustomer && (
        <div className="modal-backdrop">
          <section className="source-picker-modal">
            <button
              type="button"
              className="close-button"
              onClick={() => setPaperPickerCustomer(null)}
              aria-label="إغلاق"
              title="إغلاق"
            >
              ×
            </button>

            <h2>إضافة ورقة</h2>

            <div className="source-picker-actions">
              <button
                type="button"
                className="source-camera-button"
                onClick={() =>
                  chooseHomePaperSource('camera')
                }
                aria-label={
                  `تصوير ورقة للزبون ${paperPickerCustomer.name}`
                }
                title="تصوير بالكاميرا"
              >
                📷
              </button>

              <button
                type="button"
                className="source-file-button"
                onClick={() =>
                  chooseHomePaperSource('file')
                }
                aria-label={
                  `اختيار صورة للزبون ${paperPickerCustomer.name}`
                }
                title="اختيار صورة أو ملف"
              >
                🖼
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
function HomeSummary() {
  const [customers, setCustomers] = useState([])
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSummary()
  }, [])

  async function loadSummary() {
    try {
      const { data, error } = await getCustomers(
        '',
        { archivedOnly: false }
      )

      if (error) {
        throw error
      }

      const allPapers = await getPapers({
        includeArchived: true
      })

      setCustomers(data || [])
      setPapers(allPapers || [])
    } catch {
      setCustomers([])
      setPapers([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <section className="compact-summary home-summary">
        <span className="compact-summary-loading">
          جارٍ تحميل الملخص...
        </span>
      </section>
    )
  }

  const activeCustomerIds = new Set(
    customers.map((customer) => customer.id)
  )

  const openPapers = papers.filter(
    (paper) =>
      paper.status === 'open' &&
      activeCustomerIds.has(paper.customer_id)
  )

  const customersWithOpenPapers = new Set(
    openPapers.map((paper) => paper.customer_id)
  )

  const pricedOpenPapers = openPapers.filter(
    (paper) =>
      paper.total_amount !== null &&
      paper.total_amount !== undefined &&
      Number(paper.total_amount) !== 0
  )

  const unpricedOpenPapersCount =
    openPapers.length - pricedOpenPapers.length

  const openPapersTotalAmount = pricedOpenPapers.reduce(
    (sum, paper) =>
      sum + Number(paper.total_amount || 0),
    0
  )

  return (
    <section
      className="compact-summary home-summary"
      aria-label="ملخص الأوراق المفتوحة"
    >
      <article className="compact-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          👤
        </span>
        <span className="compact-summary-label">
          زبائن
        </span>
        <strong>{customersWithOpenPapers.size}</strong>
      </article>

      <article className="compact-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          ◉
        </span>
        <span className="compact-summary-label">
          الأوراق
        </span>
        <strong>{openPapers.length}</strong>
      </article>

      <article className="compact-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          ◌
        </span>
        <span className="compact-summary-label">
          غير مسعر
        </span>
        <strong>{unpricedOpenPapersCount}</strong>
      </article>

      <article className="compact-summary-item balance-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          ₿
        </span>
        <span className="compact-summary-label">
          القيمة
        </span>
        <strong>
          {openPapersTotalAmount.toFixed(2)}
        </strong>
      </article>
    </section>
  )
}

function ActivitiesPage({ session, signOut }) {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadActivities()
  }, [selectedDate])

  async function loadActivities() {
    setLoading(true)
    setMessage('')

    try {
      const data = await getActivitiesForDate(selectedDate)
      setActivities(data || [])
    } catch (error) {
      setMessage(error.message)
      setActivities([])
    } finally {
      setLoading(false)
    }
  }

  function openActivity(activity) {
    if (activity.paper_id && activity.customer_id) {
      navigate(
        `/customer/${activity.customer_id}/papers?openPaper=${activity.paper_id}`
      )
      return
    }

    if (activity.customer_id) {
      navigate(`/customer/${activity.customer_id}/papers`)
    }
  }

  function formatActivityTime(createdAt) {
    return new Date(createdAt).toLocaleTimeString('ar-LB', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <main dir="rtl" className="app-page">
      <Header
        session={session}
        signOut={signOut}
        title="سجل العمليات"
      />

      <section className="activities-toolbar">
        <label className="activities-date-label">
          التاريخ
          <input
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
          />
        </label>
      </section>

      {message && (
        <p className="message error">{message}</p>
      )}

      {loading ? (
        <div className="empty-card">
          جارٍ تحميل العمليات...
        </div>
      ) : activities.length === 0 ? (
        <div className="empty-card">
          لا يوجد عمليات بهذا التاريخ
        </div>
      ) : (
        <ul className="activities-list">
          {activities.map((activity) => {
            const isClickable = Boolean(
              activity.customer_id
            )

            return (
              <li key={activity.id}>
                <button
                  type="button"
                  className="activity-item"
                  onClick={() => openActivity(activity)}
                  disabled={!isClickable}
                >
                  <span className="activity-time">
                    {formatActivityTime(
                      activity.created_at
                    )}
                  </span>

                  <span className="activity-summary">
                    {activity.summary}
                  </span>

                  <span className="activity-user">
                    {getActivityUserName(activity)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

function isPaperImagePdf(path) {
  return Boolean(path) && path.toLowerCase().endsWith('.pdf')
}

function getDebtBucket(days) {
  if (days <= 7) return 'أسبوع'
  if (days <= 15) return '15 يوم'
  if (days <= 30) return 'شهر'
  if (days <= 45) return 'شهر ونص'
  if (days <= 60) return 'شهرين'
  if (days <= 90) return '3 أشهر'
  if (days <= 180) return '6 أشهر'
  if (days <= 365) return 'سنة'
  return 'أكثر من سنة'
}

function DebtReportPage({ session, signOut }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    setMessage('')

    try {
      const { data: customersData, error } =
        await getCustomers('', { archivedOnly: false })

      if (error) {
        throw error
      }

      const papersData = await getPapers({
        includeArchived: false
      })

      const openPapers = (papersData || []).filter(
        (paper) => paper.status === 'open'
      )

      const today = new Date()

            const bucketOrder = [
        'أسبوع',
        '15 يوم',
        'شهر',
        'شهر ونص',
        'شهرين',
        '3 أشهر',
        '6 أشهر',
        'سنة',
        'أكثر من سنة'
      ]

      const computedRows = (customersData || [])
        .map((customer) => {
          const customerPapers = openPapers.filter(
            (paper) =>
              paper.customer_id === customer.id
          )

          if (customerPapers.length === 0) {
            return null
          }

          const totalValue = customerPapers.reduce(
            (sum, paper) =>
              sum + Number(paper.total_amount || 0),
            0
          )

          const bucketCounts = {}
          let maxDays = 0

          customerPapers.forEach((paper) => {
            const days = Math.floor(
              (today - new Date(paper.paper_date)) /
                (1000 * 60 * 60 * 24)
            )

            if (days > maxDays) {
              maxDays = days
            }

            const bucketLabel = getDebtBucket(days)

            bucketCounts[bucketLabel] =
              (bucketCounts[bucketLabel] || 0) + 1
          })

          const buckets = bucketOrder
            .filter((label) => bucketCounts[label])
            .map((label) => ({
              label,
              count: bucketCounts[label]
            }))

          return {
            customer,
            papersCount: customerPapers.length,
            totalValue,
            buckets,
            maxDays
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.maxDays - a.maxDays)

      setRows(computedRows)
    } catch (error) {
      setMessage(error.message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main dir="rtl" className="app-page">
      <Header
        session={session}
        signOut={signOut}
        title="تقرير مدة الديون"
      />

      {message && (
        <p className="message error">{message}</p>
      )}

      {loading ? (
        <div className="empty-card">
          جارٍ تحميل التقرير...
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-card">
          لا يوجد زبائن لديهم أوراق مفتوحة
        </div>
      ) : (
        <div className="debt-report-list">
          {rows.map((row) => (
                        <button
              type="button"
              key={row.customer.id}
              className="debt-report-row"
              onClick={() =>
                navigate(
                  `/customer/${row.customer.id}/papers`
                )
              }
            >
              <span className="debt-report-header-line">
                <span className="debt-report-name">
                  {row.customer.name}
                </span>

                <span className="debt-report-count">
                  {row.papersCount} ورقة
                </span>

                <span className="debt-report-value">
                  {row.totalValue.toFixed(2)}
                </span>
              </span>

              <span className="debt-report-buckets">
                {row.buckets.map((bucket) => (
                  <span
                    key={bucket.label}
                    className="debt-report-bucket-badge"
                  >
                    {bucket.count} × {bucket.label}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

function CustomerPage({
  session,
  signOut
}) {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCustomer()
  }, [customerId])

  async function loadCustomer() {
    setLoading(true)

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (error) {
      setMessage(error.message)
      setCustomer(null)
    } else {
      setCustomer(data || null)
    }

    setLoading(false)
  }

  async function handleCustomerSaved() {
    await loadCustomer()
  }

  async function handleCustomerArchived() {
    navigate('/')
  }

  if (loading) {
    return (
      <main dir="rtl" className="page-center">
        <p>جارٍ تحميل الزبون...</p>
      </main>
    )
  }

  if (!customer) {
    return (
      <main dir="rtl" className="app-page">
        <Header
          session={session}
          signOut={signOut}
          title="الزبون غير موجود"
        />

        <div className="empty-card">
          لم يتم العثور على الزبون.
        </div>

        {message && (
          <p className="message error">{message}</p>
        )}
      </main>
    )
  }

  if (customer.is_archived) {
    return (
      <main dir="rtl" className="app-page">
        <Header
          session={session}
          signOut={signOut}
          title={customer.name}
        />

        <section className="customer-context-card">
          <div>
            <span>زبون مؤرشف</span>
            <h2>{customer.name}</h2>
            <p>
              هذا الزبون مؤرشف ولا يظهر في البحث العادي.
            </p>
          </div>

          <Link
            to="/"
            className="change-customer-button"
          >
            العودة للزبائن
          </Link>
        </section>

        <CustomerEditCard
          customer={customer}
          onSaved={handleCustomerSaved}
          onArchived={handleCustomerArchived}
        />
      </main>
    )
  }

  return (
    <main dir="rtl" className="app-page">
      <Header
        session={session}
        signOut={signOut}
        title={customer.name}
      />

      <CustomerCompactBar
        customer={customer}
        onSaved={handleCustomerSaved}
        onArchived={handleCustomerArchived}
      />

      <CustomerSummary customer={customer} />

      <nav
        className="customer-tabs compact-customer-tabs"
        aria-label="تبويبات الزبون"
      >
        <Link
          to={`/customer/${customerId}/papers`}
          title="الأوراق"
          aria-label="الأوراق"
        >
          ▤
        </Link>

        <Link
          to={`/customer/${customerId}/payments`}
          title="الدفعات"
          aria-label="الدفعات"
        >
          ↓
        </Link>

        <Link
          to={`/customer/${customerId}/report`}
          title="التقرير"
          aria-label="التقرير"
        >
          ◈
        </Link>
      </nav>

      <Routes>
        <Route
          index
          element={<Navigate to="papers" replace />}
        />

        <Route
          path="papers"
          element={<CustomerPapers customer={customer} />}
        />

        <Route
          path="payments"
          element={
            <CustomerPayments customer={customer} />
          }
        />

        <Route
          path="report"
          element={
            <CustomerReport customer={customer} />
          }
        />
      </Routes>
    </main>
  )
}

function CustomerCompactBar({
  customer,
  onSaved,
  onArchived
}) {
  const navigate = useNavigate()
  const [showEditForm, setShowEditForm] =
    useState(false)
  const [showPaperPicker, setShowPaperPicker] =
    useState(false)
  const [name, setName] = useState(customer.name || '')
  const [phone, setPhone] = useState(
    customer.phone || ''
  )
  const [notes, setNotes] = useState(
    customer.notes || ''
  )
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(customer.name || '')
    setPhone(customer.phone || '')
    setNotes(customer.notes || '')
  }, [customer])

  async function saveCustomer(event) {
    event.preventDefault()

    if (!name.trim()) {
      setMessage('اسم الزبون مطلوب')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await updateCustomer({
        customerId: customer.id,
        name,
        phone,
        notes
      })

      setShowEditForm(false)
      setMessage('تم حفظ بيانات الزبون')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function archiveCurrentCustomer() {
    const confirmed = window.confirm(
      `هل تريد أرشفة الزبون: ${customer.name}؟\n\n` +
      'سيختفي من البحث العادي، لكن أوراقه ودفعاته لن تُحذف.'
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await archiveCustomer(customer.id)
      await onArchived()
    } catch (error) {
      setMessage(error.message)
      setSaving(false)
    }
  }

  function openNewPaper() {
    setShowPaperPicker(true)
  }

  function choosePaperSource(pick) {
    setShowPaperPicker(false)

    navigate(
      `/customer/${customer.id}/papers?addPaper=1&pick=${pick}`
    )
  }

  return (
    <section className="customer-compact-bar">
      <div className="customer-compact-main">
        <h2>{customer.name}</h2>

        <div className="customer-compact-actions">
          <button
            type="button"
            className="customer-action-icon add-paper-action"
            onClick={openNewPaper}
            aria-label={`إضافة ورقة للزبون ${customer.name}`}
            title="إضافة ورقة"
          >
            +
          </button>

          <Link
            to="/"
            className="customer-action-icon change-customer-action"
            aria-label="تغيير الزبون"
            title="تغيير الزبون"
          >
            ⌂
          </Link>

          <button
            type="button"
            className="customer-action-icon edit-customer-action"
            onClick={() =>
              setShowEditForm(!showEditForm)
            }
            disabled={saving}
            aria-label="تعديل بيانات الزبون"
            title="تعديل بيانات الزبون"
          >
            ✎
          </button>

          <button
            type="button"
            className="customer-action-icon archive-customer-action"
            onClick={archiveCurrentCustomer}
            disabled={saving}
            aria-label="أرشفة الزبون"
            title="أرشفة الزبون"
          >
            🗃
          </button>
        </div>
      </div>

      {showEditForm && (
        <form
          className="customer-compact-edit-form"
          onSubmit={saveCustomer}
        >
          <label>
            اسم الزبون
            <input
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              required
            />
          </label>

          <label>
            رقم الهاتف
            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value)
              }
            />
          </label>

          <label>
            ملاحظات
            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              rows="3"
            />
          </label>

          <div className="customer-compact-edit-actions">
            <button
              type="submit"
              disabled={saving}
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>

            <button
              type="button"
              className="compact-edit-cancel"
              onClick={() => {
                setShowEditForm(false)
                setName(customer.name || '')
                setPhone(customer.phone || '')
                setNotes(customer.notes || '')
                setMessage('')
              }}
              disabled={saving}
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className="message customer-compact-message">
          {message}
        </p>
      )}

      {showPaperPicker && (
        <div className="modal-backdrop">
          <section className="source-picker-modal">
            <button
              type="button"
              className="close-button"
              onClick={() => setShowPaperPicker(false)}
              aria-label="إغلاق"
              title="إغلاق"
            >
              ×
            </button>

            <h2>إضافة ورقة</h2>

            <div className="source-picker-actions">
              <button
                type="button"
                className="source-camera-button"
                onClick={() => choosePaperSource('camera')}
                aria-label="تصوير الورقة بالكاميرا"
                title="تصوير بالكاميرا"
              >
                📷
              </button>

              <button
                type="button"
                className="source-file-button"
                onClick={() => choosePaperSource('file')}
                aria-label="اختيار صورة من الهاتف"
                title="اختيار صورة من الهاتف"
              >
                🖼
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}function CustomerEditCard({
  customer,
  onSaved,
  onArchived
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState(customer.name || '')
  const [phone, setPhone] = useState(
    customer.phone || ''
  )
  const [notes, setNotes] = useState(
    customer.notes || ''
  )
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(customer.name || '')
    setPhone(customer.phone || '')
    setNotes(customer.notes || '')
  }, [customer])

  async function saveCustomer(event) {
    event.preventDefault()

    if (!name.trim()) {
      setMessage('اسم الزبون مطلوب')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await updateCustomer({
        customerId: customer.id,
        name,
        phone,
        notes
      })

      setMessage('تم حفظ بيانات الزبون')
      setShowForm(false)
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function archiveCurrentCustomer() {
    const confirmed = window.confirm(
      `هل تريد أرشفة الزبون: ${customer.name}؟\n\n` +
      'سيختفي من البحث العادي، لكن أوراقه ودفعاته لن تُحذف.'
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await archiveCustomer(customer.id)
      await onArchived()
    } catch (error) {
      setMessage(error.message)
      setSaving(false)
    }
  }

  async function restoreCurrentCustomer() {
    setSaving(true)
    setMessage('')

    try {
      await restoreCustomer(customer.id)
      setMessage('تم إلغاء أرشفة الزبون')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="customer-edit-card">
      <div className="customer-edit-header">
        <div>
          <h2>بيانات الزبون</h2>
          <p>
            تعديل الاسم أو الهاتف أو الملاحظات، أو أرشفة
            الزبون.
          </p>
        </div>

        <button
          className="edit-customer-button"
          onClick={() => setShowForm(!showForm)}
          disabled={saving}
        >
          {showForm
            ? 'إلغاء التعديل'
            : 'تعديل بيانات الزبون'}
        </button>
      </div>

      {showForm && (
        <form
          className="customer-edit-form"
          onSubmit={saveCustomer}
        >
          <label>
            اسم الزبون
            <input
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              required
            />
          </label>

          <label>
            رقم الهاتف
            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value)
              }
            />
          </label>

          <label>
            ملاحظات
            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              rows="3"
            />
          </label>

          <button type="submit" disabled={saving}>
            {saving
              ? 'جارٍ الحفظ...'
              : 'حفظ بيانات الزبون'}
          </button>
        </form>
      )}

      {customer.is_archived ? (
        <button
          className="restore-customer-button"
          onClick={restoreCurrentCustomer}
          disabled={saving}
        >
          {saving
            ? 'جارٍ إلغاء الأرشفة...'
            : 'إلغاء الأرشفة'}
        </button>
      ) : (
        <button
          className="archive-customer-button"
          onClick={archiveCurrentCustomer}
          disabled={saving}
        >
          {saving
            ? 'جارٍ الأرشفة...'
            : 'أرشفة الزبون'}
        </button>
      )}

      {message && (
        <p className="message">{message}</p>
      )}
    </section>
  )
}

function CustomerSummary({ customer }) {
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        customerId: customer.id,
        includeArchived: true
      })

      setPapers(data || [])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <section className="compact-summary customer-summary">
        <span className="compact-summary-loading">
          جارٍ تحميل الملخص...
        </span>
      </section>
    )
  }

   const visiblePapers = papers.filter(
    (paper) => paper.status !== 'archived'
  )

  const openPapers = visiblePapers.filter(
    (paper) => paper.status === 'open'
  )

  const pricedOpenPapers = openPapers.filter(
    (paper) =>
      paper.total_amount !== null &&
      paper.total_amount !== undefined &&
      Number(paper.total_amount) !== 0
  )

  const unpricedOpenPapersCount =
    openPapers.length - pricedOpenPapers.length

  const openPapersTotalAmount = openPapers.reduce(
    (sum, paper) =>
      sum + Number(paper.total_amount || 0),
    0
  )

  return (
    <section
      className="compact-summary customer-summary"
      aria-label={`ملخص الزبون ${customer.name}`}
    >
      <article className="compact-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          ▤
        </span>
        <span className="compact-summary-label">
          الأوراق
        </span>
        <strong>{openPapers.length}</strong>
      </article>

      <article className="compact-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          ◌
        </span>
        <span className="compact-summary-label">
          غير مسعر
        </span>
        <strong>{unpricedOpenPapersCount}</strong>
      </article>

      <article className="compact-summary-item balance-summary-item">
        <span
          className="compact-summary-icon"
          aria-hidden="true"
        >
          ₿
        </span>
        <span className="compact-summary-label">
          القيمة
        </span>
        <strong>
          {openPapersTotalAmount.toFixed(2)}
        </strong>
      </article>
    </section>
  )
}

function CustomerPapers({ customer }) {
  const navigate = useNavigate()
  const location = useLocation()
  const cameraInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [showPaperSourcePicker, setShowPaperSourcePicker] =
    useState(false)
  const [papers, setPapers] = useState([])
  const [thumbnailUrls, setThumbnailUrls] =
    useState({})
  const [filter, setFilter] = useState('all')
   const [showForm, setShowForm] = useState(
    new URLSearchParams(location.search).get(
      'addPaper'
    ) === '1'
  )
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedPaper, setSelectedPaper] =
    useState(null)
  const [selectedImage, setSelectedImage] =
    useState(null)
  const [imageHistory, setImageHistory] = useState([])
  const [currentPages, setCurrentPages] = useState([])

  const [paperFile, setPaperFile] = useState(null)
  const [paperDate, setPaperDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paperNote, setPaperNote] = useState('')
  const [totalAmount, setTotalAmount] = useState('')

  const [quickAction, setQuickAction] = useState(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [quickPaymentDate, setQuickPaymentDate] =
    useState(new Date().toISOString().slice(0, 10))
  const [quickPaymentNote, setQuickPaymentNote] =
    useState('')
  const [quickImageFile, setQuickImageFile] =
    useState(null)
  const [quickImageDescription, setQuickImageDescription] =
    useState('')
  const [quickArchiveReason, setQuickArchiveReason] =
    useState('')

  const [moveMode, setMoveMode] = useState(false)
  const [selectedPaperIds, setSelectedPaperIds] =
    useState([])
  const [moveStep, setMoveStep] = useState('select')
  const [targetSearch, setTargetSearch] = useState('')
  const [targetCustomers, setTargetCustomers] =
    useState([])
  const [targetCustomer, setTargetCustomer] =
    useState(null)
  const [showPaperWhatsAppOptions, setShowPaperWhatsAppOptions] =
    useState(false)

  useEffect(() => {
    loadPapers()
  }, [customer.id])

    useEffect(() => {
    const params = new URLSearchParams(location.search)

    setShowForm(params.get('addPaper') === '1')
 
  }, [location.search])
useEffect(() => {
  const params = new URLSearchParams(location.search)
  const pick = params.get('pick')

  if (!pick) {
    return
  }

  setShowForm(true)

  window.setTimeout(() => {
    if (pick === 'camera') {
      cameraInputRef.current?.click()
    }

    if (pick === 'file') {
      fileInputRef.current?.click()
    }
  }, 150)

  navigate(
    `/customer/${customer.id}/papers?addPaper=1`,
    { replace: true }
  )
}, [
  customer.id,
  location.search,
  navigate
])


    useEffect(() => {
    const params = new URLSearchParams(location.search)
    const openPaperId = params.get('openPaper')

    if (!openPaperId) {
      return
    }

    const matchingPaper = papers.find(
      (paper) => String(paper.id) === openPaperId
    )

    if (matchingPaper) {
      openDetails(matchingPaper)

      navigate(
        `/customer/${customer.id}/papers`,
        { replace: true }
      )
    }
  }, [
    location.search,
    papers,
    customer.id,
    navigate
  ])

  async function loadPapers() {
    try {
      const data = await getPapers({
        customerId: customer.id,
        includeArchived: true
      })

      setPapers(data || [])

      const entries = await Promise.all(
        (data || []).map(async (paper) => {
          try {
            const url = await createPaperImageUrl(
              paper.image_path
            )

            return [paper.id, url]
          } catch {
            return [paper.id, null]
          }
        })
      )

      setThumbnailUrls(Object.fromEntries(entries))
    } catch (error) {
      setMessage(error.message)
    }
  }

   function closePaperForm() {
    setShowForm(false)

    const params = new URLSearchParams(location.search)

    if (params.get('addPaper') === '1') {
      navigate(
        `/customer/${customer.id}/papers`,
        { replace: true }
      )
    }
  }

  function resetQuickAction() {
    setQuickAction(null)
    setQuickAmount('')
    setQuickPaymentDate(
      new Date().toISOString().slice(0, 10)
    )
    setQuickPaymentNote('')
    setQuickImageFile(null)
    setQuickImageDescription('')
    setQuickArchiveReason('')
  }

  function startMoveMode() {
    setMoveMode(true)
    setSelectedPaperIds([])
    setMoveStep('select')
    setTargetSearch('')
    setTargetCustomers([])
    setTargetCustomer(null)
    setMessage('')
  }

  function cancelMoveMode() {
    setMoveMode(false)
    setSelectedPaperIds([])
    setMoveStep('select')
    setTargetSearch('')
    setTargetCustomers([])
    setTargetCustomer(null)
  }

  function togglePaperSelection(paperId) {
    setSelectedPaperIds((currentIds) => {
      if (currentIds.includes(paperId)) {
        return currentIds.filter((id) => id !== paperId)
      }

      return [...currentIds, paperId]
    })
  }

  async function searchTargetCustomers(searchText) {
    setTargetSearch(searchText)

    const { data, error } = await getCustomers(
      searchText,
      {
        archivedOnly: false
      }
    )

    if (error) {
      setMessage(error.message)
      return
    }

    setTargetCustomers(
      (data || []).filter(
        (item) => item.id !== customer.id
      )
    )
  }

  function continueMoveToTarget() {
    if (selectedPaperIds.length === 0) {
      setMessage('اختر ورقة واحدة على الأقل للنقل')
      return
    }

    setMoveStep('target')
    setTargetSearch('')
    setTargetCustomers([])
    setTargetCustomer(null)
    setMessage('')
  }

  function chooseTargetCustomer(nextCustomer) {
    setTargetCustomer(nextCustomer)
    setMoveStep('confirm')
    setMessage('')
  }

  async function confirmMovePapers() {
    if (!targetCustomer) {
      setMessage('اختر الزبون المنقول إليه')
      return
    }

    setSaving(true)
    setMessage('جارٍ نقل الأوراق...')

    try {
      const movedCount = await movePapersToCustomer({
        paperIds: selectedPaperIds,
        targetCustomerId: targetCustomer.id
      })

      cancelMoveMode()
      setMessage(
        `تم نقل ${movedCount} ورقة إلى ${targetCustomer.name}`
      )

      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function savePaper(event) {
    event.preventDefault()

    if (!paperFile) {
      setMessage('اختر صورة الورقة')
      return
    }

    setSaving(true)
    setMessage('جارٍ حفظ الورقة...')

    try {
      const temporaryId = crypto.randomUUID()

      const imagePath = await uploadPaperImage(
        paperFile,
        temporaryId
      )

      await createPaper({
        customerId: customer.id,
        paperDate,
        imagePath,
        note: paperNote,
        totalAmount
      })

      setPaperFile(null)
      setPaperNote('')
      setTotalAmount('')
      setPaperDate(
        new Date().toISOString().slice(0, 10)
      )
      closePaperForm()
      setMessage('تمت إضافة الورقة')
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function loadImagesForPaper(paper) {
    const history = await getPaperImageHistory(paper.id)

    const currentImages = (history || []).filter(
      (image) => image.is_current
    )

    const currentImagesWithUrls = await Promise.all(
      currentImages.map(async (image) => ({
        ...image,
        url: await createPaperImageUrl(image.image_path)
      }))
    )

    return {
      history: history || [],
      currentImages: currentImagesWithUrls
    }
  }

  async function openDetails(paper) {
    if (moveMode) {
      togglePaperSelection(paper.id)
      return
    }

    try {
      const { history, currentImages } =
        await loadImagesForPaper(paper)

      setSelectedPaper(paper)
      setImageHistory(history)
      setCurrentPages(currentImages)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function refreshSelectedPaperImages() {
    if (!selectedPaper) {
      return
    }

    try {
      const { history, currentImages } =
        await loadImagesForPaper(selectedPaper)

      setImageHistory(history)
      setCurrentPages(currentImages)

      loadPapers()
    } catch (error) {
      setMessage(error.message)
    }
  }

  function openQuickAction(event, type, paper) {
    event.stopPropagation()

    setMessage('')
    setQuickAction({
      type,
      paper
    })

    if (type === 'edit') {
      setQuickAmount(
        paper.total_amount === null
          ? ''
          : String(paper.total_amount)
      )
    }

    if (type === 'payment') {
      setQuickPaymentDate(
        new Date().toISOString().slice(0, 10)
      )
    }
  }

  async function quickClosePaper(event, paper) {
    event.stopPropagation()

    const confirmed = window.confirm(
      `هل تريد إغلاق الورقة بتاريخ ${paper.paper_date}؟`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await closePaper(paper.id)
      setMessage('تم إغلاق الورقة')
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function quickReopenPaper(event, paper) {
    event.stopPropagation()

    const confirmed = window.confirm(
      `هل تريد إعادة فتح الورقة بتاريخ ${paper.paper_date}؟`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await reopenPaper(paper.id)
      setMessage('تمت إعادة فتح الورقة')
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickEdit(event) {
    event.preventDefault()

    if (!quickAction?.paper) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await updatePaperAmount(
        quickAction.paper.id,
        quickAmount
      )

      setMessage('تم حفظ قيمة الورقة')
      resetQuickAction()
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickPayment(event) {
    event.preventDefault()

    if (!quickAction?.paper) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await createPayment({
        paperId: quickAction.paper.id,
        amount: quickAmount,
        paymentDate: quickPaymentDate,
        note: quickPaymentNote
      })

      setMessage('تمت إضافة الدفعة')
      resetQuickAction()
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickImage(event) {
    event.preventDefault()

    if (!quickAction?.paper || !quickImageFile) {
      setMessage('اختر الصورة الجديدة')
      return
    }

    setSaving(true)
    setMessage('جارٍ رفع الصورة الجديدة...')

    try {
      const imagePath = await uploadPaperImage(
        quickImageFile,
        quickAction.paper.id
      )

      await savePaperImageHistory({
        paperId: quickAction.paper.id,
        imagePath,
        description: quickImageDescription
      })

      await updatePaperImagePath(
        quickAction.paper.id,
        imagePath
      )

      setMessage('تم استبدال الصورة وحفظ القديمة')
      resetQuickAction()
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickArchive(event) {
    event.preventDefault()

    if (!quickAction?.paper) {
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await archivePaper(
        quickAction.paper.id,
        quickArchiveReason
      )

      setMessage('تمت أرشفة الورقة')
      resetQuickAction()
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function shareVisiblePapers(includeImageLinks) {
    setMessage('جارٍ تجهيز رسالة WhatsApp...')

    try {
      const text =
        await buildCustomerWhatsAppReport(
          customer,
          visiblePapers,
          { includeImageLinks }
        )

      openWhatsAppMessage(text, customer.phone)

      setMessage(
        includeImageLinks
          ? 'تم تجهيز الرسالة مع روابط الصور'
          : 'تم تجهيز الرسالة بدون روابط الصور'
      )

      setShowPaperWhatsAppOptions(false)
    } catch (error) {
      setMessage(error.message)
    }
  }

    const statusOrder = {
    open: 0,
    closed: 1,
    archived: 2
  }

  const visiblePapers = papers
    .filter((paper) => {
      return filter === 'all'
        ? true
        : paper.status === filter
    })
    .sort((a, b) => {
      if (filter !== 'all') {
        return 0
      }

      const statusDiff =
        (statusOrder[a.status] ?? 3) -
        (statusOrder[b.status] ?? 3)

      if (statusDiff !== 0) {
        return statusDiff
      }

      return String(b.paper_date).localeCompare(
        String(a.paper_date)
      )
    })

  const selectedPapers = papers.filter((paper) =>
    selectedPaperIds.includes(paper.id)
  )

  return (
    <section className="customer-section">
      <input
        ref={cameraInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          setPaperFile(event.target.files?.[0] || null)
        }}
      />

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        onChange={(event) => {
          setPaperFile(event.target.files?.[0] || null)
        }}
      />
<div className="papers-compact-header">
  <div className="papers-compact-title">
    <h2>أوراق {customer.name}</h2>

    <small>
      {visiblePapers.length} ورقة ظاهرة
    </small>
  </div>

  <div className="papers-compact-controls">
    {!moveMode ? (
      <>
        <button
          type="button"
          className="papers-icon-button move-papers-icon"
          onClick={startMoveMode}
          aria-label="نقل أوراق"
          title="نقل أوراق"
        >
          ⇄
        </button>

        <div className="paper-whatsapp-actions">
          <button
            type="button"
            className="papers-icon-button whatsapp-icon-button"
            onClick={() =>
              setShowPaperWhatsAppOptions(
                !showPaperWhatsAppOptions
              )
            }
            aria-label="إرسال تقرير الأوراق عبر WhatsApp"
            title="WhatsApp"
          >
            ☏
          </button>

          {showPaperWhatsAppOptions && (
            <div className="whatsapp-options">
              <button
                type="button"
                className="whatsapp-without-links-button"
                onClick={() => shareVisiblePapers(false)}
                aria-label="إرسال تقرير الأوراق بدون روابط الصور"
                title="إرسال بدون روابط الصور"
              >
                ◌
              </button>

              <button
                type="button"
                className="whatsapp-with-links-button"
                onClick={() => shareVisiblePapers(true)}
                aria-label="إرسال تقرير الأوراق مع روابط الصور"
                title="إرسال مع روابط الصور"
              >
                🔗
              </button>
            </div>
          )}
        </div>

        <button
  type="button"
  className="papers-icon-button add-paper-icon"
  onClick={() => setShowPaperSourcePicker(true)}
  aria-label="إضافة ورقة جديدة"
  title="إضافة ورقة جديدة"
>
  +
</button>
      </>
    ) : (
      <>
        <button
          type="button"
          className="papers-icon-button cancel-move-icon"
          onClick={cancelMoveMode}
          aria-label="إلغاء نقل الأوراق"
          title="إلغاء النقل"
        >
          ×
        </button>

        <button
          type="button"
          className="papers-continue-button"
          onClick={continueMoveToTarget}
          disabled={selectedPaperIds.length === 0}
          aria-label={`متابعة نقل ${selectedPaperIds.length} ورقة`}
          title={`متابعة نقل ${selectedPaperIds.length} ورقة`}
        >
          ✓
        </button>
      </>
    )}
  </div>
</div>
<div
  className="filter-tabs compact-paper-filters"
  aria-label="فلتر الأوراق"
>
  {[
    ['all', '▤', 'كل الأوراق'],
    ['open', '◉', 'الأوراق المفتوحة'],
    ['closed', '✓', 'الأوراق المغلقة'],
    ['archived', '🗃', 'الأوراق المؤرشفة']
  ].map(([value, icon, label]) => (
    <button
      key={value}
      type="button"
      className={
        filter === value
          ? 'filter-button active'
          : 'filter-button'
      }
      onClick={() => setFilter(value)}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  ))}
</div>
      {moveMode && (
        <section className="move-mode-note">
          <strong>وضع نقل الأوراق مفعل.</strong>
          اختر الأوراق التي تريد نقلها، ثم اضغط
          «متابعة النقل».
        </section>
      )}
      {showPaperSourcePicker && (
        <div className="modal-backdrop">
          <section className="source-picker-modal">
            <button
              type="button"
              className="close-button"
              onClick={() =>
                setShowPaperSourcePicker(false)
              }
              aria-label="إغلاق"
              title="إغلاق"
            >
              ×
            </button>

            <h2>إضافة ورقة</h2>

            <div className="source-picker-actions">
              <button
                type="button"
                className="source-camera-button"
                onClick={() => {
                  setShowPaperSourcePicker(false)
                  window.setTimeout(() => {
                    cameraInputRef.current?.click()
                  }, 120)
                  setShowForm(true)
                }}
                aria-label="تصوير الورقة بالكاميرا"
                title="تصوير بالكاميرا"
              >
                📷
              </button>

              <button
                type="button"
                className="source-file-button"
                onClick={() => {
                  setShowPaperSourcePicker(false)
                  window.setTimeout(() => {
                    fileInputRef.current?.click()
                  }, 120)
                  setShowForm(true)
                }}
                aria-label="اختيار صورة من الهاتف"
                title="اختيار صورة من الهاتف"
              >
                🖼
              </button>
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <section className="form-card">
          <div className="form-card-title-row">
            <h2>إضافة ورقة للزبون</h2>

            <button
              type="button"
              className="form-close-button"
              onClick={closePaperForm}
            >
              إغلاق
            </button>
          </div>

          <form onSubmit={savePaper}>
<div className="selected-paper-image">
  <span>صورة الورقة</span>

  {paperFile ? (
    <p>
      تم اختيار الصورة:
      {' '}
      <strong>{paperFile.name}</strong>
    </p>
  ) : (
    <p className="message error">
      لم يتم اختيار صورة. أغلق النموذج ثم اضغط + واختر 📷 أو 🖼.
    </p>
  )}
</div>
            <label>
              تاريخ الورقة
              <input
                type="date"
                value={paperDate}
                onChange={(event) =>
                  setPaperDate(event.target.value)
                }
                required
              />
            </label>

            <label>
              القيمة، اختيارية
              <input
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(event) =>
                  setTotalAmount(event.target.value)
                }
              />
            </label>

            <label>
              ملاحظة
              <textarea
                value={paperNote}
                onChange={(event) =>
                  setPaperNote(event.target.value)
                }
                rows="3"
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving
                ? 'جارٍ الحفظ...'
                : 'حفظ الورقة'}
            </button>
          </form>
        </section>
      )}

      {quickAction && (
        <QuickPaperActionModal
          action={quickAction}
          amount={quickAmount}
          paymentDate={quickPaymentDate}
          paymentNote={quickPaymentNote}
          imageFile={quickImageFile}
          imageDescription={quickImageDescription}
          archiveReason={quickArchiveReason}
          saving={saving}
          setAmount={setQuickAmount}
          setPaymentDate={setQuickPaymentDate}
          setPaymentNote={setQuickPaymentNote}
          setImageFile={setQuickImageFile}
          setImageDescription={setQuickImageDescription}
          setArchiveReason={setQuickArchiveReason}
          onClose={resetQuickAction}
          onSaveEdit={saveQuickEdit}
          onSavePayment={saveQuickPayment}
          onSaveImage={saveQuickImage}
          onSaveArchive={saveQuickArchive}
        />
      )}

      {moveStep === 'target' && (
        <MoveTargetModal
          sourceCustomer={customer}
          search={targetSearch}
          customers={targetCustomers}
          onSearch={searchTargetCustomers}
          onChoose={chooseTargetCustomer}
          onBack={() => setMoveStep('select')}
          onCancel={cancelMoveMode}
        />
      )}

      {moveStep === 'confirm' && targetCustomer && (
        <MoveConfirmModal
          sourceCustomer={customer}
          targetCustomer={targetCustomer}
          papers={selectedPapers}
          saving={saving}
          onBack={() => setMoveStep('target')}
          onCancel={cancelMoveMode}
          onConfirm={confirmMovePapers}
        />
      )}

      {message && (
        <p className="message error">{message}</p>
      )}

      {visiblePapers.length === 0 ? (
        <div className="empty-card">
          لا توجد أوراق ضمن هذا التبويب
        </div>
      ) : (
        <div className="papers-list">
          {visiblePapers.map((paper) => {
            const balance = calculateBalance(
              paper.total_amount,
              paper.payments
            )

            const amountText =
              paper.total_amount === null
                ? 'غير محسوبة'
                : Number(paper.total_amount).toFixed(2)

            const balanceText =
              balance === null
                ? 'غير محسوب'
                : balance.toFixed(2)

            const isSelected = selectedPaperIds.includes(
              paper.id
            )

            return (
              <article
                className={
                  isSelected
                    ? 'paper-card clickable-paper-card selected-paper-card'
                    : 'paper-card clickable-paper-card'
                }
                key={paper.id}
                onClick={() => openDetails(paper)}
              >
                {moveMode && (
                  <label
                    className="paper-select-checkbox"
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        togglePaperSelection(paper.id)
                      }
                    />
                    اختيار
                  </label>
                )}

                                {thumbnailUrls[paper.id] &&
                isPaperImagePdf(paper.image_path) ? (
                    <a
		className="paper-thumbnail pdf-thumbnail-badge"
                    href={thumbnailUrls[paper.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📄 PDF
                  </a>
                ) : thumbnailUrls[paper.id] ? (
                  <img
                    className="paper-thumbnail"
                    src={thumbnailUrls[paper.id]}
                    alt={`صورة ورقة بتاريخ ${paper.paper_date}`}
                  />
                ) : (
                  <div className="paper-thumbnail placeholder-thumbnail">
                    لا توجد صورة
                  </div>
                )}

                <div className="paper-card-content">
                  <h3 className="paper-card-date">
                    {paper.paper_date}
                  </h3>

                  <p>القيمة: {amountText}</p>

                  <p>
                    الدفعات:{' '}
                    {getPaymentsTotal(paper).toFixed(2)}
                  </p>

                  <p>الرصيد: {balanceText}</p>

                  <p>
                    الحالة: {getStatusText(paper.status)}
                  </p>
                </div>

                {!moveMode && (
                  <div
                    className="paper-shortcuts"
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                  >
                    {paper.status !== 'archived' && (
                      <>
                        <button
                          type="button"
                          className="shortcut-edit"
                          onClick={(event) =>
                            openQuickAction(
                              event,
                              'edit',
                              paper
                            )
                          }
                        >
                          تعديل
                        </button>

                        <button
                          type="button"
                          className="shortcut-payment"
                          onClick={(event) =>
                            openQuickAction(
                              event,
                              'payment',
                              paper
                            )
                          }
                        >
                          دفعة
                        </button>

                        <button
                          type="button"
                          className="shortcut-image"
                          onClick={(event) =>
                            openQuickAction(
                              event,
                              'image',
                              paper
                            )
                          }
                        >
                          استبدال
                        </button>

                        {paper.status === 'open' ? (
                          <button
                            type="button"
                            className="shortcut-close"
                            onClick={(event) =>
                              quickClosePaper(event, paper)
                            }
                            disabled={saving}
                          >
                            إغلاق
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="shortcut-reopen"
                            onClick={(event) =>
                              quickReopenPaper(event, paper)
                            }
                            disabled={saving}
                          >
                            فتح
                          </button>
                        )}

                        <button
                          type="button"
                          className="shortcut-archive"
                          onClick={(event) =>
                            openQuickAction(
                              event,
                              'archive',
                              paper
                            )
                          }
                        >
                          أرشفة
                        </button>
                      </>
                    )}

                    {paper.status === 'archived' && (
                      <span className="archived-paper-note">
                        افتح الورقة لإلغاء الأرشفة
                      </span>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {selectedPaper && (
<PaperModal
          paper={selectedPaper}
          imageUrl={selectedImage}
          imageHistory={imageHistory}
          currentPages={currentPages}
          onImagesChanged={refreshSelectedPaperImages}
          onClose={() => {
            setSelectedPaper(null)
            setSelectedImage(null)
            setImageHistory([])
            setCurrentPages([])
          }}
          onSaved={async () => {
            await loadPapers()
            setSelectedPaper(null)
            setSelectedImage(null)
            setImageHistory([])
            setCurrentPages([])
          }}
        />
      )}
    </section>
  )
}
function QuickPaperActionModal({
  action,
  amount,
  paymentDate,
  paymentNote,
  imageFile,
  imageDescription,
  archiveReason,
  saving,
  setAmount,
  setPaymentDate,
  setPaymentNote,
  setImageFile,
  setImageDescription,
  setArchiveReason,
  onClose,
  onSaveEdit,
  onSavePayment,
  onSaveImage,
  onSaveArchive
}) {
  const paper = action.paper

  return (
    <div className="modal-backdrop">
      <section className="quick-action-modal">
        <button
          type="button"
          className="close-button"
          onClick={onClose}
        >
          إغلاق
        </button>

        <h2>
          {getQuickActionTitle(action.type)}
        </h2>

        <p className="quick-action-paper-info">
          الورقة بتاريخ: {paper.paper_date}
        </p>

        {action.type === 'edit' && (
          <form onSubmit={onSaveEdit}>
            <label>
              قيمة الورقة
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                required
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving
                ? 'جارٍ الحفظ...'
                : 'حفظ التعديل'}
            </button>
          </form>
        )}

        {action.type === 'payment' && (
          <form onSubmit={onSavePayment}>
            <label>
              قيمة الدفعة
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                required
              />
            </label>

            <label>
              تاريخ الدفعة
              <input
                type="date"
                value={paymentDate}
                onChange={(event) =>
                  setPaymentDate(event.target.value)
                }
                required
              />
            </label>

            <label>
              ملاحظة
              <textarea
                value={paymentNote}
                onChange={(event) =>
                  setPaymentNote(event.target.value)
                }
                rows="2"
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving
                ? 'جارٍ الحفظ...'
                : 'حفظ الدفعة'}
            </button>
          </form>
        )}

        {action.type === 'image' && (
          <form onSubmit={onSaveImage}>
            <label>
              الصورة الجديدة
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(event) =>
                  setImageFile(
                    event.target.files?.[0] || null
                  )
                }
                required
              />
            </label>

            <label>
              وصف الصورة
              <textarea
                value={imageDescription}
                onChange={(event) =>
                  setImageDescription(event.target.value)
                }
                rows="2"
                placeholder="مثال: تمت إضافة أسعار جديدة"
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving
                ? 'جارٍ رفع الصورة...'
                : 'حفظ الصورة الجديدة'}
            </button>
          </form>
        )}

        {action.type === 'archive' && (
          <form onSubmit={onSaveArchive}>
            <label>
              سبب الأرشفة
              <textarea
                value={archiveReason}
                onChange={(event) =>
                  setArchiveReason(event.target.value)
                }
                rows="3"
                placeholder="مثال: تم إلغاء الطلب"
              />
            </label>

            <button
              type="submit"
              className="archive-button"
              disabled={saving}
            >
              {saving
                ? 'جارٍ الأرشفة...'
                : 'تأكيد الأرشفة'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function MoveTargetModal({
  sourceCustomer,
  search,
  customers,
  onSearch,
  onChoose,
  onBack,
  onCancel
}) {
  return (
    <div className="modal-backdrop">
      <section className="move-modal">
        <button
          type="button"
          className="close-button"
          onClick={onCancel}
        >
          إغلاق
        </button>

        <h2>اختيار الزبون المنقول إليه</h2>

        <p className="move-modal-note">
          الأوراق ستُنقل من الزبون:
          <strong> {sourceCustomer.name}</strong>
        </p>

        <label>
          ابحث عن الزبون الجديد
          <input
            type="search"
            placeholder="اكتب اسم الزبون..."
            value={search}
            onChange={(event) =>
              onSearch(event.target.value)
            }
            autoFocus
          />
        </label>

        {search.trim() && customers.length === 0 && (
          <div className="empty-card">
            لا يوجد زبون نشط مطابق للاسم.
          </div>
        )}

        <div className="move-target-list">
          {customers.map((customer) => (
            <button
              type="button"
              className="move-target-item"
              key={customer.id}
              onClick={() => onChoose(customer)}
            >
              <strong>{customer.name}</strong>

              {customer.phone && (
                <small>{customer.phone}</small>
              )}
            </button>
          ))}
        </div>

        <div className="modal-bottom-actions">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            رجوع
          </button>

          <button
            type="button"
            className="cancel-move-button"
            onClick={onCancel}
          >
            إلغاء النقل
          </button>
        </div>
      </section>
    </div>
  )
}

function MoveConfirmModal({
  sourceCustomer,
  targetCustomer,
  papers,
  saving,
  onBack,
  onCancel,
  onConfirm
}) {
  return (
    <div className="modal-backdrop">
      <section className="move-modal">
        <button
          type="button"
          className="close-button"
          onClick={onCancel}
        >
          إغلاق
        </button>

        <h2>تأكيد نقل الأوراق</h2>

        <div className="move-confirm-details">
          <p>
            من الزبون:
            <strong> {sourceCustomer.name}</strong>
          </p>

          <p>
            إلى الزبون:
            <strong> {targetCustomer.name}</strong>
          </p>

          <p>
            عدد الأوراق المختارة:
            <strong> {papers.length}</strong>
          </p>
        </div>

        <h3>الأوراق التي سيتم نقلها</h3>

        <ul className="move-papers-list">
          {papers.map((paper) => (
            <li key={paper.id}>
              <strong>{paper.paper_date}</strong>
              <span>
                الحالة: {getStatusText(paper.status)}
              </span>
            </li>
          ))}
        </ul>

        <p className="move-warning">
          النقل لا يحذف الصور أو الدفعات أو سجل الصور.
          سيتم فقط تغيير الزبون المرتبط بهذه الأوراق.
        </p>

        <div className="modal-bottom-actions">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
            disabled={saving}
          >
            رجوع
          </button>

          <button
            type="button"
            className="cancel-move-button"
            onClick={onCancel}
            disabled={saving}
          >
            إلغاء
          </button>

          <button
            type="button"
            className="confirm-move-button"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving
              ? 'جارٍ نقل الأوراق...'
              : 'تأكيد نقل الأوراق'}
          </button>
        </div>
      </section>
    </div>
  )
}

function CustomerPayments({ customer }) {
  const [papers, setPapers] = useState([])
  const [selectedPaperId, setSelectedPaperId] =
    useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        customerId: customer.id,
        includeArchived: true
      })

      setPapers(data || [])
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function savePayment(event) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)

    if (!selectedPaperId) {
      setMessage('اختر الورقة')
      return
    }

    try {
      await createPayment({
        paperId: selectedPaperId,
        amount: form.get('amount'),
        paymentDate: form.get('paymentDate'),
        note: form.get('note')
      })

      event.currentTarget.reset()
      setSelectedPaperId('')
      setMessage('تمت إضافة الدفعة')
      await loadPapers()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const payments = papers.flatMap((paper) => {
    return (paper.payments || [])
      .filter((payment) => !payment.is_archived)
      .map((payment) => ({
        ...payment,
        paperDate: paper.paper_date,
        paperStatus: paper.status
      }))
  })

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>دفعات {customer.name}</h2>
          <p>
            كل الدفعات التاريخية، بما فيها دفعات الأوراق
            المغلقة.
          </p>
        </div>
      </div>

      <section className="form-card">
        <h2>إضافة دفعة</h2>

        <form onSubmit={savePayment}>
          <label>
            الورقة
            <select
              value={selectedPaperId}
              onChange={(event) =>
                setSelectedPaperId(event.target.value)
              }
              required
            >
              <option value="">اختر الورقة</option>

              {papers
                .filter(
                  (paper) => paper.status !== 'archived'
                )
                .map((paper) => (
                  <option
                    key={paper.id}
                    value={paper.id}
                  >
                    {paper.paper_date} -{' '}
                    {paper.total_amount ?? 'غير محسوبة'}
                  </option>
                ))}
            </select>
          </label>

          <label>
            قيمة الدفعة
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>

          <label>
            تاريخ الدفعة
            <input
              name="paymentDate"
              type="date"
              defaultValue={
                new Date().toISOString().slice(0, 10)
              }
              required
            />
          </label>

          <label>
            ملاحظة
            <textarea name="note" rows="2" />
          </label>

          <button type="submit">
            حفظ الدفعة
          </button>
        </form>

        {message && (
          <p className="message error">{message}</p>
        )}
      </section>

      <section className="payments-table">
        {payments.length === 0 ? (
          <div className="empty-card">
            لا توجد دفعات
          </div>
        ) : (
          payments.map((payment) => (
            <article
              className="payment-row"
              key={payment.id}
            >
              <div>
                <strong>
                  {Number(payment.amount).toFixed(2)}
                </strong>

                <span>
                  تاريخ الدفعة: {payment.payment_date}
                </span>

                <span>
                  تاريخ الورقة: {payment.paperDate}
                </span>

                <span>
                  حالة الورقة:{' '}
                  {getStatusText(payment.paperStatus)}
                </span>

                {payment.note && (
                  <small>{payment.note}</small>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </section>
  )
}

function CustomerReport({ customer }) {
  const [papers, setPapers] = useState([])
  const [thumbnailUrls, setThumbnailUrls] =
    useState({})
  const [message, setMessage] = useState('')
  const [showWhatsAppOptions, setShowWhatsAppOptions] =
    useState(false)

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        customerId: customer.id,
        includeArchived: false
      })

      setPapers(data || [])

      const entries = await Promise.all(
        (data || []).map(async (paper) => {
          try {
            const url = await createPaperImageUrl(
              paper.image_path
            )

            return [paper.id, url]
          } catch {
            return [paper.id, null]
          }
        })
      )

      setThumbnailUrls(Object.fromEntries(entries))
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function shareReport(includeImageLinks) {
    setMessage('جارٍ تجهيز التقرير...')

    try {
      const openPapers = papers.filter(
        (paper) => paper.status === 'open'
      )

      const text =
        await buildCustomerWhatsAppReport(
          customer,
          openPapers,
          { includeImageLinks }
        )

      openWhatsAppMessage(text, customer.phone)

      setMessage(
        includeImageLinks
          ? 'تم تجهيز التقرير مع روابط الصور'
          : 'تم تجهيز التقرير بدون روابط الصور'
      )

      setShowWhatsAppOptions(false)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const openPapers = papers.filter(
    (paper) => paper.status === 'open'
  )

  const totalOpenPayments = openPapers.reduce(
    (sum, paper) =>
      sum + getPaymentsTotal(paper),
    0
  )

  const finalBalance = openPapers.reduce(
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

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>تقرير {customer.name}</h2>
          <p>
            هذا التقرير يحتوي الأوراق المفتوحة فقط.
          </p>
        </div>

        <div className="whatsapp-actions">
          <button
            className="whatsapp-button"
            onClick={() =>
              setShowWhatsAppOptions(
                !showWhatsAppOptions
              )
            }
          >
            إرسال WhatsApp
          </button>

          {showWhatsAppOptions && (
            <div className="whatsapp-options">
              <button
                className="whatsapp-without-links-button"
                onClick={() => shareReport(false)}
              >
                إرسال بدون روابط الصور
              </button>

              <button
                className="whatsapp-with-links-button"
                onClick={() => shareReport(true)}
              >
                إرسال مع روابط الصور
              </button>
            </div>
          )}
        </div>
      </div>

      {message && (
        <p className="message">{message}</p>
      )}

      <section className="report-summary-card">
        <div>
          <span>دفعات الأوراق المفتوحة</span>
          <strong>{totalOpenPayments.toFixed(2)}</strong>
        </div>

        <div>
          <span>الرصيد النهائي المفتوح</span>
          <strong>{finalBalance.toFixed(2)}</strong>
        </div>
      </section>

      <section className="papers-list">
        {openPapers.length === 0 ? (
          <div className="empty-card">
            لا توجد أوراق مفتوحة
          </div>
        ) : (
          openPapers.map((paper) => {
            const balance = calculateBalance(
              paper.total_amount,
              paper.payments
            )

            const amountText =
              paper.total_amount === null
                ? 'غير محسوبة'
                : Number(paper.total_amount).toFixed(2)

            const balanceText =
              balance === null
                ? 'غير محسوب'
                : balance.toFixed(2)

            return (
              <article
                className="report-paper-row report-paper-with-image"
                key={paper.id}
              >
{thumbnailUrls[paper.id] &&
  isPaperImagePdf(paper.image_path) ? (
    <a
      className="paper-thumbnail pdf-thumbnail-badge"
      href={thumbnailUrls[paper.id]}
      target="_blank"
      rel="noopener noreferrer"
    >
      📄 PDF
    </a>
                ) : thumbnailUrls[paper.id] ? (
                  <img
                    className="report-paper-thumbnail"
                    src={thumbnailUrls[paper.id]}
                    alt={`صورة ورقة بتاريخ ${paper.paper_date}`}
                  />
                ) : (
                  <div className="report-paper-thumbnail placeholder-thumbnail">
                    لا توجد صورة
                  </div>
                )}

                <div className="report-paper-content">
                  <strong>
                    التاريخ: {paper.paper_date}
                  </strong>

                  <span>
                    القيمة: {amountText}
                  </span>

                  <span>
                    الدفعات:{' '}
                    {getPaymentsTotal(paper).toFixed(2)}
                  </span>

                  <strong>
                    الرصيد: {balanceText}
                  </strong>
                </div>
              </article>
            )
          })
        )}
      </section>
    </section>
  )
}

function PaperModal({
  currentPages,
  onImagesChanged,
  paper,
  imageUrl,
  imageHistory,
  onClose,
  onSaved
}) {
  const [showAmountForm, setShowAmountForm] =
    useState(false)
  const [showPaymentForm, setShowPaymentForm] =
    useState(false)
  const [showImageForm, setShowImageForm] =
    useState(false)
  const [showArchiveForm, setShowArchiveForm] =
    useState(false)

  const [amount, setAmount] = useState(
    paper.total_amount === null
      ? ''
      : String(paper.total_amount)
  )

  const [paymentAmount, setPaymentAmount] =
    useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paymentNote, setPaymentNote] = useState('')

  const [newImageFile, setNewImageFile] =
    useState(null)
  const [newImageDescription, setNewImageDescription] =
    useState('')

  const [archiveReason, setArchiveReason] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const cameraInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const [paperDate, setPaperDate] = useState(
    paper.paper_date
  )

    async function saveAmount(event) {
    event.preventDefault()
    setSaving(true)

    try {
      await updatePaperAmountAndDate(paper.id, {
        totalAmount: amount,
        paperDate
      })
      setMessage('تم حفظ قيمة الورقة وتاريخها')
      setShowAmountForm(false)
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function savePayment(event) {
    event.preventDefault()
    setSaving(true)

    try {
      await createPayment({
        paperId: paper.id,
        amount: paymentAmount,
        paymentDate,
        note: paymentNote
      })

      setMessage('تمت إضافة الدفعة')
      setPaymentAmount('')
      setPaymentNote('')
      setShowPaymentForm(false)
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function replaceImage(event) {
    event.preventDefault()

    if (!newImageFile) {
      setMessage('اختر الصورة الجديدة')
      return
    }

    setSaving(true)
    setMessage('جارٍ رفع الصورة الجديدة...')

    try {
      const imagePath = await uploadPaperImage(
        newImageFile,
        paper.id
      )

      await savePaperImageHistory({
        paperId: paper.id,
        imagePath,
        description: newImageDescription
      })

      await updatePaperImagePath(
        paper.id,
        imagePath
      )

      setMessage('تم استبدال الصورة وحفظ القديمة')
      setShowImageForm(false)
      setNewImageFile(null)
      setNewImageDescription('')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

    const [showAddPageForm, setShowAddPageForm] =
    useState(false)

  async function addPage(event) {
    event.preventDefault()

    if (!newImageFile) {
      setMessage('اختر الصورة أو الملف الجديد')
      return
    }

    setSaving(true)
    setMessage('جارٍ رفع الصفحة الجديدة...')

    try {
      const imagePath = await uploadPaperImage(
        newImageFile,
        paper.id
      )

      const result = await addPaperPage({
        paperId: paper.id,
        imagePath,
        description: newImageDescription
      })

      if (result.becameCover) {
        await updatePaperImagePath(paper.id, imagePath)
      }

      setMessage('تمت إضافة الصفحة')
      setShowAddPageForm(false)
      setNewImageFile(null)
      setNewImageDescription('')
      await onImagesChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deletePage(imageId) {
    const confirmed = window.confirm(
      'هل تريد حذف هذه الصفحة؟'
    )

    if (!confirmed) {
      return
    }

    setSaving(true)

    try {
      const result = await removePaperImage({
        paperId: paper.id,
        imageId
      })

      if (result.newCoverPath !== undefined) {
        await updatePaperImagePath(
          paper.id,
          result.newCoverPath
        )
      }

      setMessage('تم حذف الصفحة')
      await onImagesChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function makeCover(imageId) {
    setSaving(true)

    try {
      const newCoverPath = await setPaperCoverImage({
        paperId: paper.id,
        imageId
      })

      await updatePaperImagePath(paper.id, newCoverPath)

      setMessage('تم تعيين الصفحة الرئيسية')
      await onImagesChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function closeCurrentPaper() {
    setSaving(true)

    try {
      await closePaper(paper.id)
      setMessage('تم إغلاق الورقة')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function reopenCurrentPaper() {
    setSaving(true)

    try {
      await reopenPaper(paper.id)
      setMessage('تمت إعادة فتح الورقة')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function archiveCurrentPaper() {
    setSaving(true)

    try {
      await archivePaper(paper.id, archiveReason)
      setMessage('تمت أرشفة الورقة')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function restoreArchivedPaper() {
    setSaving(true)

    try {
      await restorePaper(paper.id)
      setMessage(
        'تم إلغاء الأرشفة وعادت الورقة مفتوحة'
      )
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function openHistoryImage(imagePath) {
    try {
      const url = await createPaperImageUrl(imagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setMessage('فشل فتح الصورة')
    }
  }

  const balance = calculateBalance(
    paper.total_amount,
    paper.payments
  )

  const amountText =
    paper.total_amount === null
      ? 'غير محسوبة'
      : Number(paper.total_amount).toFixed(2)

  const balanceText =
    balance === null
      ? 'غير محسوب'
      : balance.toFixed(2)

  return (
    <div className="modal-backdrop">
      <section className="paper-details-modal">
        <button
          className="close-button"
          onClick={onClose}
        >
          إغلاق
        </button>

        <h2>تفاصيل الورقة</h2>

        {currentPages.length === 0 ? (
          <p className="message">لا توجد صور لهذه الورقة</p>
        ) : (
          <div className="paper-pages-gallery">
            {currentPages.map((page, index) => (
              <div
                className="paper-page-item"
                key={page.id}
              >
                                {isPaperImagePdf(page.image_path) ? (
                    <a
                    className="paper-pdf-link"
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📄 فتح ملف PDF (صفحة {index + 1})
                  </a>
                ) : (
                  <img
                    className="paper-image"
                    src={page.url}
                    alt={`صفحة ${index + 1}`}
                  />
                )}

                <div className="paper-page-actions">
                  <span className="paper-page-label">
                    {page.is_cover
                      ? 'الصفحة الرئيسية'
                      : `صفحة ${index + 1}`}
                  </span>

                  {!page.is_cover && (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => makeCover(page.id)}
                      disabled={saving}
                    >
                      تعيين كرئيسية
                    </button>
                  )}

                  <button
                    type="button"
                    className="small-button danger-button"
                    onClick={() => deletePage(page.id)}
                    disabled={saving}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p>التاريخ: {paper.paper_date}</p>
        <p>القيمة: {amountText}</p>

        <p>
          الدفعات:{' '}
          {getPaymentsTotal(paper).toFixed(2)}
        </p>

        <p>الرصيد: {balanceText}</p>

        <p>
          الحالة: {getStatusText(paper.status)}
        </p>

        {paper.status === 'archived' ? (
          <>
            <p className="archive-info">
              هذه الورقة مؤرشفة. عند إلغاء الأرشفة ستعود
              كورقة مفتوحة.
            </p>

            <button
              className="restore-button"
              onClick={restoreArchivedPaper}
              disabled={saving}
            >
              {saving
                ? 'جارٍ إلغاء الأرشفة...'
                : 'إلغاء الأرشفة وإعادة فتح الورقة'}
            </button>
          </>
        ) : (
          <>
            <button
              className="amount-button"
              onClick={() =>
                setShowAmountForm(!showAmountForm)
              }
            >
              {paper.total_amount === null
                ? 'إضافة قيمة الورقة'
                : 'تعديل قيمة الورقة'}
            </button>

                        {showAmountForm && (
              <form
                className="amount-form"
                onSubmit={saveAmount}
              >
                <label>
                  قيمة الورقة
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(event) =>
                      setAmount(event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  تاريخ الورقة
                  <input
                    type="date"
                    value={paperDate}
                    onChange={(event) =>
                      setPaperDate(event.target.value)
                    }
                    required
                  />
                </label>

                <button type="submit" disabled={saving}>
                  حفظ القيمة والتاريخ
                </button>
              </form>
            )}

            <div className="status-actions">
              {paper.status === 'open' && (
                <button
                  className="close-paper-button"
                  onClick={closeCurrentPaper}
                  disabled={saving}
                >
                  {saving
                    ? 'جارٍ الإغلاق...'
                    : 'إغلاق الورقة'}
                </button>
              )}

              {paper.status === 'closed' && (
                <button
                  className="reopen-paper-button"
                  onClick={reopenCurrentPaper}
                  disabled={saving}
                >
                  {saving
                    ? 'جارٍ الفتح...'
                    : 'إعادة فتح الورقة'}
                </button>
              )}

              <button
                className="archive-button"
                onClick={() =>
                  setShowArchiveForm(!showArchiveForm)
                }
                disabled={saving}
              >
                أرشفة الورقة
              </button>
            </div>

            {showArchiveForm && (
              <form
                className="archive-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  archiveCurrentPaper()
                }}
              >
                <label>
                  سبب الأرشفة
                  <textarea
                    value={archiveReason}
                    onChange={(event) =>
                      setArchiveReason(event.target.value)
                    }
                    rows="3"
                    placeholder="مثال: تم إلغاء الطلب"
                  />
                </label>

                <button
                  type="submit"
                  className="archive-button"
                  disabled={saving}
                >
                  {saving
                    ? 'جارٍ الأرشفة...'
                    : 'تأكيد الأرشفة'}
                </button>
              </form>
            )}

            <button
              className="payment-button"
              onClick={() =>
                setShowPaymentForm(!showPaymentForm)
              }
            >
              {showPaymentForm
                ? 'إلغاء'
                : 'إضافة دفعة'}
            </button>

            {showPaymentForm && (
              <form
                className="payment-form"
                onSubmit={savePayment}
              >
                <label>
                  قيمة الدفعة
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) =>
                      setPaymentAmount(event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  تاريخ الدفعة
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(event) =>
                      setPaymentDate(event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  ملاحظة
                  <textarea
                    value={paymentNote}
                    onChange={(event) =>
                      setPaymentNote(event.target.value)
                    }
                    rows="2"
                  />
                </label>

                <button type="submit" disabled={saving}>
                  {saving
                    ? 'جارٍ الحفظ...'
                    : 'حفظ الدفعة'}
                </button>
              </form>
            )}

            <button
              className="image-button"
              onClick={() =>
                setShowImageForm(!showImageForm)
              }
            >
              {showImageForm
                ? 'إلغاء تغيير الصورة'
                : 'استبدال كل الصور'}
            </button>

            {showImageForm && (
              <form
                className="image-form"
                onSubmit={replaceImage}
              >
                <div className="paper-image-picker">
                  <span className="paper-image-picker-label">
                    صورة أو ملف PDF جديد للورقة
                  </span>

                  <div className="paper-image-picker-actions">
                    <button
                      type="button"
                      className="camera-picker-button"
                      onClick={() =>
                        cameraInputRef.current?.click()
                      }
                      aria-label="تصوير الورقة بالكاميرا"
                      title="تصوير بالكاميرا"
                    >
                      📷
                    </button>

                    <button
                      type="button"
                      className="file-picker-button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      aria-label="اختيار صورة أو PDF من الهاتف"
                      title="اختيار صورة أو PDF"
                    >
                      🖼
                    </button>
                  </div>

                  

                  <p className="selected-image-name">
                    {newImageFile
                      ? `الملف المختار: ${newImageFile.name}`
                      : 'اختر طريقة إضافة الصورة أو الـPDF.'}
                  </p>
                </div>

                <label>
                  وصف الصورة
                  <textarea
                    value={newImageDescription}
                    onChange={(event) =>
                      setNewImageDescription(
                        event.target.value
                      )
                    }
                    rows="2"
                    placeholder="مثال: تمت إضافة أسعار جديدة"
                  />
                </label>

                <button type="submit" disabled={saving}>
                  {saving
                    ? 'جارٍ رفع الملف...'
                    : 'حفظ الصورة الجديدة'}
                </button>
              </form>
            )}

            <input
              ref={cameraInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) =>
                setNewImageFile(
                  event.target.files?.[0] || null
                )
              }
            />

            <input
              ref={fileInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) =>
                setNewImageFile(
                  event.target.files?.[0] || null
                )
              }
            />            
<button
              className="image-button"
              onClick={() =>
                setShowAddPageForm(!showAddPageForm)
              }
            >
              {showAddPageForm
                ? 'إلغاء إضافة صفحة'
                : '+ إضافة صفحة جديدة'}
            </button>

            {showAddPageForm && (
              <form
                className="image-form"
                onSubmit={addPage}
              >
                <div className="paper-image-picker">
                  <span className="paper-image-picker-label">
                    صفحة جديدة (صورة أو PDF)
                  </span>

                  <div className="paper-image-picker-actions">
                    <button
                      type="button"
                      className="camera-picker-button"
                      onClick={() =>
                        cameraInputRef.current?.click()
                      }
                      aria-label="تصوير صفحة جديدة بالكاميرا"
                      title="تصوير بالكاميرا"
                    >
                      📷
                    </button>

                    <button
                      type="button"
                      className="file-picker-button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      aria-label="اختيار صفحة جديدة من الهاتف"
                      title="اختيار صورة أو PDF"
                    >
                      🖼
                    </button>
                  </div>

                  <p className="selected-image-name">
                    {newImageFile
                      ? `الملف المختار: ${newImageFile.name}`
                      : 'اختر طريقة إضافة الصفحة الجديدة.'}
                  </p>
                </div>

                <label>
                  وصف الصفحة
                  <textarea
                    value={newImageDescription}
                    onChange={(event) =>
                      setNewImageDescription(
                        event.target.value
                      )
                    }
                    rows="2"
                    placeholder="مثال: صفحة 2 من الفاتورة"
                  />
                </label>

                <button type="submit" disabled={saving}>
                  {saving
                    ? 'جارٍ رفع الصفحة...'
                    : 'حفظ الصفحة الجديدة'}
                </button>
              </form>
            )}
          </>
        )}


        <h3>صور قديمة (مستبدلة)</h3>

        {imageHistory.filter((image) => !image.is_current).length === 0 ? (
          <p>لا يوجد سجل صور قديم</p>
        ) : (
          <ul className="image-history-list">
            {imageHistory
              .filter((image) => !image.is_current)
              .map((image) => (
              <li key={image.id}>
                <div>
                  <span>
                    {new Date(
                      image.created_at
                    ).toLocaleString('ar-LB')}
                  </span>

                  <small>
                    {image.description ||
                      image.note ||
                      'صورة بدون وصف'}
                  </small>
                </div>

                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    openHistoryImage(image.image_path)
                  }
                >
                  {isPaperImagePdf(image.image_path)
                    ? 'فتح PDF'
                    : 'فتح الصورة'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3>سجل الصور</h3>
        {imageHistory.length === 0 ? (
          <p>لا يوجد سجل صور قديم</p>
        ) : (
          <ul className="image-history-list">
            {imageHistory.map((image) => (
              <li key={image.id}>
                <div>
                  <span>
                    {new Date(
                      image.created_at
                    ).toLocaleString('ar-LB')}
                  </span>

                  <small>
                    {image.description ||
                      image.note ||
                      'صورة بدون وصف'}
                  </small>
                </div>

                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    openHistoryImage(image.image_path)
                  }
                >
                  {isPaperImagePdf(image.image_path)
                    ? 'فتح PDF'
                    : 'فتح الصورة'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {message && (
          <p className="message">{message}</p>
        )}
      </section>
    </div>
  )
}

function getQuickActionTitle(type) {
  if (type === 'edit') {
    return 'تعديل قيمة الورقة'
  }

  if (type === 'payment') {
    return 'إضافة دفعة'
  }

  if (type === 'image') {
    return 'استبدال الصورة'
  }

  if (type === 'archive') {
    return 'أرشفة الورقة'
  }

  return 'إجراء الورقة'
}

function getPaymentsTotal(paper) {
  return (paper.payments || [])
    .filter((payment) => !payment.is_archived)
    .reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0
    )
}

function getStatusText(status) {
  if (status === 'open') return 'مفتوحة'
  if (status === 'closed') return 'مغلقة'
  if (status === 'archived') return 'مؤرشفة'
  return status
}

export default App