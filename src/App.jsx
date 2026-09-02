import { useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams
} from 'react-router-dom'
import { supabase } from './lib/supabase'
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
  reopenPaper,
  restorePaper,
  updatePaperAmount,
  updatePaperImagePath
} from './lib/papers'
import {
  createPaperImageUrl,
  getPaperImageHistory,
  savePaperImageHistory,
  uploadPaperImage
} from './lib/storage'
import { createPayment } from './lib/payments'
import {
  buildCustomerWhatsAppReport,
  openWhatsAppMessage
} from './lib/whatsapp'

const RECENT_CUSTOMERS_KEY =
  'customer-papers-recent-customers'

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
  return (
    <header className="topbar">
      <div>
        <Link to="/" className="app-brand-link">
          دبوس البسطة
        </Link>

        <h1>{title}</h1>
        <p>{session.user.email}</p>
      </div>

      <div className="topbar-actions">
        <Link
          to="/"
          className="topbar-link"
        >
          اختيار زبون آخر
        </Link>

        <button
          onClick={signOut}
          className="secondary-button"
        >
          تسجيل الخروج
        </button>
      </div>
    </header>
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

  useEffect(() => {
    loadCustomers('', false)
    loadRecentCustomers()
  }, [])

  async function loadCustomers(
    searchText,
    archivedOnly = showArchived
  ) {
    setLoading(true)

    const { data, error } =
      await getCustomers(searchText, {
        archivedOnly
      })

    if (error) {
      setMessage(error.message)
    } else {
      setCustomers(data || [])
    }

    setLoading(false)
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

    saveRecentCustomer(customer)

    navigate(
      `/customer/${customer.id}/papers?addPaper=1`
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

  return (
    <main dir="rtl" className="app-page">
      <Header
        session={session}
        signOut={signOut}
        title="اختيار الزبون"
      />

      <section className="customer-start-card">
        <div>
          <h2>
            {showArchived
              ? 'أرشيف الزبائن'
              : 'اختر الزبون للبدء'}
          </h2>

          <p>
            {showArchived
              ? 'تظهر هنا الزبائن المؤرشفون فقط.'
              : 'بعد الاختيار ستظهر كل أوراقه ودفعاته وتقاريره.'}
          </p>
        </div>

        <div className="customer-start-actions">
          {!showArchived && (
            <button
              className="new-customer-button"
              onClick={() =>
                setShowNewCustomerForm(
                  !showNewCustomerForm
                )
              }
            >
              {showNewCustomerForm
                ? 'إلغاء إضافة زبون'
                : 'إضافة زبون جديد'}
            </button>
          )}

          <button
            className="archive-customer-list-button"
            onClick={changeArchivedView}
          >
            {showArchived
              ? 'العودة إلى الزبائن النشطين'
              : 'أرشيف الزبائن'}
          </button>
        </div>
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

      {!showArchived &&
        recentCustomers.length > 0 && (
          <section className="recent-customers-section">
            <div className="section-header">
              <div>
                <h2>آخر الزبائن المستخدمين</h2>
                <p>
                  آخر 8 زبائن تم فتحهم على هذا الجهاز.
                </p>
              </div>

              <button
                className="clear-recent-button"
                onClick={clearRecentCustomers}
              >
                مسح القائمة
              </button>
            </div>

            <div className="recent-customers-list">
              {recentCustomers.map((customer) => (
                <article
                  className="recent-customer-card"
                  key={customer.id}
                >
                  <button
                    className="recent-customer-main"
                    onClick={() =>
                      openCustomer(customer)
                    }
                  >
                    <strong>{customer.name}</strong>

                    {customer.phone && (
                      <small>{customer.phone}</small>
                    )}
                  </button>

                  <button
                    className="recent-paper-button"
                    onClick={() =>
                      openQuickPaper(customer)
                    }
                  >
                    ورقة جديدة
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

      <section className="search-box">
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
        />
      </section>

      {message && (
        <p className="message error">{message}</p>
      )}

      {loading ? (
        <div className="empty-card">
          جارٍ تحميل الزبائن...
        </div>
      ) : customers.length === 0 ? (
        <div className="empty-card">
          {showArchived
            ? 'لا يوجد زبائن مؤرشفون'
            : 'لا يوجد زبائن نشطون'}
        </div>
      ) : (
        <section className="customer-picker-list">
          {customers.map((customer) => (
            <article
              className="customer-picker-card"
              key={customer.id}
            >
              <button
                className="customer-picker-item"
                onClick={() => openCustomer(customer)}
              >
                <strong>{customer.name}</strong>

                {customer.phone && (
                  <small>{customer.phone}</small>
                )}
              </button>

              {showArchived ? (
                <button
                  className="restore-customer-button"
                  onClick={() =>
                    restoreArchivedCustomer(customer)
                  }
                >
                  إلغاء الأرشفة
                </button>
              ) : (
                <button
                  className="quick-paper-button"
                  onClick={() =>
                    openQuickPaper(customer)
                  }
                >
                  ورقة جديدة
                </button>
              )}
            </article>
          ))}
        </section>
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

      <section className="customer-context-card">
        <div>
          <span>الزبون المحدد</span>
          <h2>{customer.name}</h2>

          {customer.phone && (
            <p>الهاتف: {customer.phone}</p>
          )}

          {customer.notes && (
            <p>ملاحظات: {customer.notes}</p>
          )}
        </div>

        <Link
          to="/"
          className="change-customer-button"
        >
          تغيير الزبون
        </Link>
      </section>

      <CustomerEditCard
        customer={customer}
        onSaved={handleCustomerSaved}
        onArchived={handleCustomerArchived}
      />

      <CustomerSummary customer={customer} />

      <nav className="customer-tabs compact-customer-tabs">
        <Link
          to={`/customer/${customerId}/papers`}
        >
          الأوراق
        </Link>

        <Link
          to={`/customer/${customerId}/payments`}
        >
          الدفعات
        </Link>

        <Link
          to={`/customer/${customerId}/report`}
        >
          التقرير
        </Link>
      </nav>

      <Routes>
        <Route
          index
          element={<Navigate to="papers" replace />}
        />

        <Route
          path="papers"
          element={
            <CustomerPapers customer={customer} />
          }
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

function CustomerEditCard({
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
      <div className="empty-card">
        جارٍ تحميل الملخص...
      </div>
    )
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
    <section className="customer-summary-fixed">
      <div className="summary-cards">
        <article className="summary-card">
          <span>كل الأوراق</span>
          <strong>{papers.length}</strong>
        </article>

        <article className="summary-card">
          <span>الأوراق المفتوحة</span>
          <strong>{openPapers.length}</strong>
        </article>

        <article className="summary-card">
          <span>دفعات الأوراق المفتوحة</span>
          <strong>
            {totalOpenPayments.toFixed(2)}
          </strong>
        </article>

        <article className="summary-card total-summary-card">
          <span>الرصيد النهائي المفتوح</span>
          <strong>{finalBalance.toFixed(2)}</strong>
        </article>
      </div>

      <p className="summary-note">
        الملخص المالي يحسب الأوراق المفتوحة فقط.
      </p>
    </section>
  )
}

function CustomerPapers({ customer }) {
  const navigate = useNavigate()
  const [papers, setPapers] = useState([])
  const [thumbnailUrls, setThumbnailUrls] =
    useState({})
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(
    new URLSearchParams(
      window.location.search
    ).get('addPaper') === '1'
  )
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedPaper, setSelectedPaper] =
    useState(null)
  const [selectedImage, setSelectedImage] =
    useState(null)
  const [imageHistory, setImageHistory] = useState([])

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

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    )

    if (params.get('addPaper') === '1') {
      setShowForm(true)
    }
  }, [customer.id])

  function closePaperForm() {
    setShowForm(false)

    const params = new URLSearchParams(
      window.location.search
    )

    if (params.get('addPaper') === '1') {
      navigate(
        `/customer/${customer.id}/papers`,
        { replace: true }
      )
    }
  }

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

  async function openDetails(paper) {
    try {
      const imageUrl = await createPaperImageUrl(
        paper.image_path
      )

      const history = await getPaperImageHistory(
        paper.id
      )

      setSelectedPaper(paper)
      setSelectedImage(imageUrl)
      setImageHistory(history || [])
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

  const visiblePapers = papers.filter((paper) => {
    return filter === 'all'
      ? true
      : paper.status === filter
  })

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>أوراق {customer.name}</h2>
          <p>عدد النتائج: {visiblePapers.length}</p>
        </div>

        <button
          onClick={() => {
            setShowForm(true)
          }}
        >
          إضافة ورقة
        </button>
      </div>

      <div className="filter-tabs">
        {[
          ['all', 'كل الأوراق'],
          ['open', 'مفتوحة'],
          ['closed', 'مغلقة'],
          ['archived', 'مؤرشفة']
        ].map(([value, label]) => (
          <button
            key={value}
            className={
              filter === value
                ? 'filter-button active'
                : 'filter-button'
            }
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

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
            <label>
              صورة الورقة
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) =>
                  setPaperFile(
                    event.target.files?.[0] || null
                  )
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

      {message && (
        <p className="message error">{message}</p>
      )}

      {visiblePapers.length === 0 ? (
        <div className="empty-card">
          لا توجد أوراق
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

            return (
              <article
                className="paper-card clickable-paper-card"
                key={paper.id}
                onClick={() => openDetails(paper)}
              >
                {thumbnailUrls[paper.id] ? (
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
          onClose={() => {
            setSelectedPaper(null)
            setSelectedImage(null)
            setImageHistory([])
          }}
          onSaved={async () => {
            await loadPapers()
            setSelectedPaper(null)
            setSelectedImage(null)
            setImageHistory([])
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
                accept="image/*"
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

      openWhatsAppMessage(text)

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
                className="report-paper-row"
                key={paper.id}
              >
                <span>
                  التاريخ: {paper.paper_date}
                </span>

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
              </article>
            )
          })
        )}
      </section>
    </section>
  )
}

function PaperModal({
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

  async function saveAmount(event) {
    event.preventDefault()
    setSaving(true)

    try {
      await updatePaperAmount(paper.id, amount)
      setMessage('تم حفظ قيمة الورقة')
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

        {imageUrl && (
          <img
            className="paper-image"
            src={imageUrl}
            alt="صورة الورقة"
          />
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

                <button type="submit" disabled={saving}>
                  حفظ القيمة
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
                : 'استبدال الصورة'}
            </button>

            {showImageForm && (
              <form
                className="image-form"
                onSubmit={replaceImage}
              >
                <label>
                  الصورة الجديدة
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) =>
                      setNewImageFile(
                        event.target.files?.[0] || null
                      )
                    }
                    required
                  />
                </label>

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
                    ? 'جارٍ رفع الصورة...'
                    : 'حفظ الصورة الجديدة'}
                </button>
              </form>
            )}
          </>
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
                  فتح الصورة
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