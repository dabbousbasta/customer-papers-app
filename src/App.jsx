import { useEffect, useMemo, useState } from 'react'
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
  createCustomer,
  getCustomers,
  updateCustomer
} from './lib/customers'
import {
  archivePaper,
  calculateBalance,
  closePaper,
  createPaper,
  getPapers,
  reopenPaper,
  updatePaperImagePath
} from './lib/papers'
import {
  createPaperImageUrl,
  getPaperImageHistory,
  savePaperImageHistory,
  uploadPaperImage
} from './lib/storage'
import {
  createPayment,
  updatePayment
} from './lib/payments'
import { getDashboardData } from './lib/reports'
import {
  buildCustomerWhatsAppReport,
  openWhatsAppMessage
} from './lib/whatsapp'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()

      if (!mounted) return

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
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user?.id) {
        setProfile(null)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single()

      setProfile(data || null)
    }

    loadProfile()
  }, [session])

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  if (loading) {
    return (
      <main dir="rtl">
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
            profile={profile}
            signOut={signOut}
          />
        }
      />

      <Route
        path="/customer/:customerId/*"
        element={
          <CustomerWorkspace
            session={session}
            profile={profile}
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
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      })

    if (error) {
      setMessage(`فشل تسجيل الدخول: ${error.message}`)
    }

    setLoading(false)
  }

  return (
    <main dir="rtl" className="auth-page">
      <section className="auth-card">
        <h1>نظام أوراق الزبائن</h1>
        <p>تسجيل الدخول</p>

        <form onSubmit={signIn}>
          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />
          </label>

          <label>
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading
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

function AppHeader({
  profile,
  session,
  signOut,
  title,
  showBack = false
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title || 'نظام أوراق الزبائن'}</h1>

        <p>
          مرحبًا {profile?.display_name || session.user.email}
        </p>
      </div>

      <div className="topbar-actions">
        {showBack && (
          <Link
            to="/"
            className="topbar-link"
          >
            اختيار زبون آخر
          </Link>
        )}

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
  profile,
  signOut
}) {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers(searchText = '') {
    setLoading(true)

    const { data, error } =
      await getCustomers(searchText)

    if (error) {
      setMessage(`فشل تحميل الزبائن: ${error.message}`)
    } else {
      setCustomers(data || [])
    }

    setLoading(false)
  }

  async function saveCustomer(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const customer = await createCustomer({
        name,
        phone,
        notes
      })

      setMessage('تمت إضافة الزبون')
      setName('')
      setPhone('')
      setNotes('')
      setShowForm(false)
      await loadCustomers(search)
      navigate(`/customer/${customer.id}`)
    } catch (error) {
      setMessage(
        error.message || 'حدث خطأ أثناء إضافة الزبون'
      )
    } finally {
      setSaving(false)
    }
  }

  const visibleCustomers = useMemo(() => {
    const text = search.trim().toLowerCase()

    if (!text) {
      return customers
    }

    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(text)
    )
  }, [customers, search])

  return (
    <main dir="rtl" className="app-page">
      <AppHeader
        profile={profile}
        session={session}
        signOut={signOut}
        title="اختيار الزبون"
      />

      <section className="customer-start-card">
        <h2>ابدأ باختيار الزبون</h2>
        <p>
          بعد اختيار الزبون ستظهر كل أوراقه ودفعاته وتقاريره.
        </p>

        <button
          onClick={() => setShowForm(!showForm)}
        >
          {showForm
            ? 'إلغاء إضافة زبون'
            : 'إضافة زبون جديد'}
        </button>
      </section>

      {showForm && (
        <section className="form-card">
          <h2>إضافة زبون جديد</h2>

          <form onSubmit={saveCustomer}>
            <label>
              اسم الزبون
              <input
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                required
              />
            </label>

            <label>
              الهاتف
              <input
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
              {saving ? 'جارٍ الحفظ...' : 'حفظ الزبون'}
            </button>
          </form>
        </section>
      )}

      <section className="customer-picker">
        <div className="section-header">
          <div>
            <h2>الزبائن</h2>
            <p>
              عدد الزبائن: {visibleCustomers.length}
            </p>
          </div>
        </div>

        <section className="search-box">
          <input
            type="search"
            placeholder="ابحث عن اسم الزبون..."
            value={search}
            onChange={async (event) => {
              const value = event.target.value
              setSearch(value)
              await loadCustomers(value)
            }}
          />
        </section>

        {message && <p className="message">{message}</p>}

        {loading ? (
          <div className="empty-card">
            جارٍ تحميل الزبائن...
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="empty-card">
            لا يوجد زبائن مطابقون للبحث
          </div>
        ) : (
          <div className="customer-picker-list">
            {visibleCustomers.map((customer) => (
              <button
                className="customer-picker-item"
                key={customer.id}
                onClick={() =>
                  navigate(`/customer/${customer.id}`)
                }
              >
                <span>{customer.name}</span>

                {customer.phone && (
                  <small>{customer.phone}</small>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function CustomerWorkspace({
  session,
  profile,
  signOut
}) {
  const { customerId } = useParams()
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

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
      setCustomer(null)
    } else {
      setCustomer(data)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <main dir="rtl">
        <p>جارٍ تحميل الزبون...</p>
      </main>
    )
  }

  if (!customer) {
    return (
      <main dir="rtl" className="app-page">
        <AppHeader
          profile={profile}
          session={session}
          signOut={signOut}
          title="الزبون غير موجود"
          showBack
        />

        <div className="empty-card">
          لم يتم العثور على هذا الزبون.
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="app-page">
      <AppHeader
        profile={profile}
        session={session}
        signOut={signOut}
        title={customer.name}
        showBack
      />

      <section className="customer-context-card">
        <div>
          <span>الزبون المحدد</span>
          <h2>{customer.name}</h2>

          {customer.phone && (
            <p>الهاتف: {customer.phone}</p>
          )}
        </div>

        <Link
          to="/"
          className="change-customer-button"
        >
          تغيير الزبون
        </Link>
      </section>

      <nav className="customer-tabs">
        <Link to={`/customer/${customerId}`}>
          ملخص
        </Link>

        <Link to={`/customer/${customerId}/papers`}>
          الأوراق
        </Link>

        <Link to={`/customer/${customerId}/payments`}>
          الدفعات
        </Link>

        <Link to={`/customer/${customerId}/report`}>
          التقرير
        </Link>

        <Link to={`/customer/${customerId}/activity`}>
          النشاط
        </Link>
      </nav>

      <Routes>
        <Route
          index
          element={
            <CustomerSummary
              customer={customer}
              session={session}
            />
          }
        />

        <Route
          path="papers"
          element={
            <CustomerPapers
              customer={customer}
              session={session}
            />
          }
        />

        <Route
          path="payments"
          element={
            <CustomerPayments
              customer={customer}
              session={session}
            />
          }
        />

        <Route
          path="report"
          element={
            <CustomerReport
              customer={customer}
              session={session}
            />
          }
        />

        <Route
          path="activity"
          element={
            <CustomerActivity
              customer={customer}
            />
          }
        />
      </Routes>
    </main>
  )
}

function CustomerSummary({
  customer,
  session
}) {
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        includeArchived: true,
        customerId: customer.id
      })

      setPapers(data)
    } finally {
      setLoading(false)
    }
  }

  const openPapers = papers.filter(
    (paper) => paper.status === 'open'
  )

  const calculatedPapers = openPapers.filter(
    (paper) =>
      paper.total_amount !== null &&
      paper.total_amount !== undefined
  )

  const totalRemaining = calculatedPapers.reduce(
    (sum, paper) =>
      sum +
      calculateBalance(
        paper.total_amount,
        paper.payments
      ),
    0
  )

  const paymentsTotal = papers.reduce(
    (sum, paper) =>
      sum +
      (paper.payments || [])
        .filter((payment) => !payment.is_archived)
        .reduce(
          (paymentSum, payment) =>
            paymentSum + Number(payment.amount || 0),
          0
        ),
    0
  )

  if (loading) {
    return (
      <div className="empty-card">
        جارٍ تحميل ملخص الزبون...
      </div>
    )
  }

  return (
    <section className="customer-summary">
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
          <span>إجمالي الدفعات</span>
          <strong>{paymentsTotal.toFixed(2)}</strong>
        </article>

        <article className="summary-card">
          <span>الرصيد المفتوح</span>
          <strong>{totalRemaining.toFixed(2)}</strong>
        </article>
      </div>

      <div className="customer-summary-actions">
        <Link
          className="primary-link"
          to={`/customer/${customer.id}/papers`}
        >
          فتح أوراق الزبون
        </Link>

        <Link
          className="secondary-link"
          to={`/customer/${customer.id}/report`}
        >
          فتح التقرير
        </Link>
      </div>
    </section>
  )
}

function CustomerPapers({
  customer
}) {
  const [papers, setPapers] = useState([])
  const [filter, setFilter] = useState('all')
  const [selectedPaper, setSelectedPaper] =
    useState(null)
  const [selectedPaperImage, setSelectedPaperImage] =
    useState(null)
  const [imageHistory, setImageHistory] =
    useState([])
  const [showAddForm, setShowAddForm] =
    useState(false)
  const [paperFile, setPaperFile] = useState(null)
  const [paperDate, setPaperDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paperNote, setPaperNote] = useState('')
  const [totalAmount, setTotalAmount] =
    useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        includeArchived: true,
        customerId: customer.id
      })

      setPapers(data)
    } catch (error) {
      setMessage(`فشل تحميل الأوراق: ${error.message}`)
    }
  }

  const visiblePapers = papers.filter((paper) => {
    if (filter === 'all') return true
    return paper.status === filter
  })

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
      setPaperDate(
        new Date().toISOString().slice(0, 10)
      )
      setPaperNote('')
      setTotalAmount('')
      setShowAddForm(false)
      setMessage('تمت إضافة الورقة')
      await loadPapers()
    } catch (error) {
      setMessage(
        error.message || 'حدث خطأ أثناء إضافة الورقة'
      )
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
      setSelectedPaperImage(imageUrl)
      setImageHistory(history)
    } catch (error) {
      setMessage(`فشل فتح الورقة: ${error.message}`)
    }
  }

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>أوراق {customer.name}</h2>
          <p>عدد النتائج: {visiblePapers.length}</p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm
            ? 'إلغاء'
            : 'إضافة ورقة'}
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

      {showAddForm && (
        <section className="form-card">
          <h2>إضافة ورقة للزبون</h2>

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
              ملاحظة، اختيارية
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

      {message && <p className="message">{message}</p>}

      {visiblePapers.length === 0 ? (
        <div className="empty-card">
          لا توجد أوراق في هذا القسم
        </div>
      ) : (
        <div className="papers-list">
          {visiblePapers.map((paper) => {
            const balance = calculateBalance(
              paper.total_amount,
              paper.payments
            )

            return (
              <article
                className="paper-card"
                key={paper.id}
              >
                <div>
                  <h3>{paper.paper_date}</h3>

                  <p>
                    القيمة:{' '}
                    {paper.total_amount === null
                      ? 'غير محسوبة'
                      : paper.total_amount}
                  </p>

                  <p>
                    الدفعات:{' '}
                    {getPaymentsTotal(paper).toFixed(2)}
                  </p>

                  <p>
                    الرصيد:{' '}
                    {balance === null
                      ? 'غير محسوب'
                      : balance.toFixed(2)}
                  </p>

                  <p>
                    الحالة:{' '}
                    {getStatusText(paper.status)}
                  </p>
                </div>

                <button
                  className="details-button"
                  onClick={() => openDetails(paper)}
                >
                  التفاصيل
                </button>
              </article>
            )
          })}
        </div>
      )}

      {selectedPaper && (
        <PaperDetailsModal
          paper={selectedPaper}
          imageUrl={selectedPaperImage}
          imageHistory={imageHistory}
          onClose={() => {
            setSelectedPaper(null)
            setSelectedPaperImage(null)
            setImageHistory([])
          }}
          onChanged={async () => {
            await loadPapers()
            setSelectedPaper(null)
            setSelectedPaperImage(null)
            setImageHistory([])
          }}
        />
      )}
    </section>
  )
}

function CustomerPayments({
  customer
}) {
  const [papers, setPapers] = useState([])
  const [selectedPaperId, setSelectedPaperId] =
    useState('')

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    const data = await getPapers({
      includeArchived: true,
      customerId: customer.id
    })

    setPapers(data)
  }

  const payments = papers.flatMap((paper) =>
    (paper.payments || [])
      .filter((payment) => !payment.is_archived)
      .map((payment) => ({
        ...payment,
        paperDate: paper.paper_date,
        paperId: paper.id
      }))
  )

  const selectedPaper = papers.find(
    (paper) => paper.id === selectedPaperId
  )

  async function addPayment(event) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)
    const amount = form.get('amount')
    const paymentDate = form.get('paymentDate')
    const note = form.get('note')

    if (!selectedPaperId) {
      return
    }

    await createPayment({
      paperId: selectedPaperId,
      amount,
      paymentDate,
      note
    })

    event.currentTarget.reset()
    await loadPapers()
  }

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>دفعات {customer.name}</h2>
          <p>عدد الدفعات: {payments.length}</p>
        </div>
      </div>

      <section className="form-card">
        <h2>إضافة دفعة</h2>

        <form onSubmit={addPayment}>
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
                .filter((paper) => paper.status !== 'archived')
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
      </section>

      {payments.length === 0 ? (
        <div className="empty-card">
          لا توجد دفعات لهذا الزبون
        </div>
      ) : (
        <div className="payments-table">
          {payments.map((payment) => (
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

                {payment.note && (
                  <small>{payment.note}</small>
                )}
              </div>

              <span className="payment-status">
                مسجلة
              </span>
            </article>
          ))}
        </div>
      )}

      {selectedPaper && (
        <p className="message">
          الورقة المحددة: {selectedPaper.paper_date}
        </p>
      )}
    </section>
  )
}

function CustomerReport({
  customer
}) {
  const [papers, setPapers] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        includeArchived: false,
        customerId: customer.id
      })

      setPapers(data)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function shareReport() {
    setMessage('جارٍ تجهيز التقرير...')

    try {
      const text = await buildCustomerWhatsAppReport(
        customer,
        papers
      )

      openWhatsAppMessage(text)
      setMessage('تم تجهيز تقرير WhatsApp')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const openPapers = papers.filter(
    (paper) => paper.status === 'open'
  )

  const totalRemaining = openPapers.reduce(
    (sum, paper) => {
      const balance = calculateBalance(
        paper.total_amount,
        paper.payments
      )

      return sum + (balance === null ? 0 : balance)
    },
    0
  )

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>تقرير {customer.name}</h2>
          <p>الأوراق المفتوحة فقط</p>
        </div>

        <button
          className="whatsapp-button"
          onClick={shareReport}
        >
          إرسال عبر WhatsApp
        </button>
      </div>

      {message && <p className="message">{message}</p>}

      <section className="report-summary-card">
        <span>الرصيد النهائي</span>
        <strong>{totalRemaining.toFixed(2)}</strong>
      </section>

      {openPapers.length === 0 ? (
        <div className="empty-card">
          لا توجد أوراق مفتوحة
        </div>
      ) : (
        <div className="papers-list">
          {openPapers.map((paper) => {
            const paymentsTotal = getPaymentsTotal(paper)
            const balance = calculateBalance(
              paper.total_amount,
              paper.payments
            )

            return (
              <article
                className="report-paper-row"
                key={paper.id}
              >
                <span>
                  التاريخ: {paper.paper_date}
                </span>

                <span>
                  القيمة:{' '}
                  {paper.total_amount === null
                    ? 'غير محسوبة'
                    : paper.total_amount}
                </span>

                <span>
                  الدفعات: {paymentsTotal.toFixed(2)}
                </span>

                <strong>
                  الرصيد:{' '}
                  {balance === null
                    ? 'غير محسوب'
                    : balance.toFixed(2)}
                </strong>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CustomerActivity({
  customer
}) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActivity()
  }, [customer.id])

  async function loadActivity() {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .or(
        `entity_id.eq.${customer.id}`
      )
      .order('created_at', {
        ascending: false
      })

    if (!error) {
      setLogs(data || [])
    }

    setLoading(false)
  }

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>نشاط {customer.name}</h2>
          <p>سجل العمليات</p>
        </div>
      </div>

      {loading ? (
        <div className="empty-card">
          جارٍ تحميل النشاط...
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-card">
          لا يوجد نشاط لهذا الزبون
        </div>
      ) : (
        <div className="activity-list">
          {logs.map((log) => (
            <article
              className="activity-row"
              key={log.id}
            >
              <strong>{log.action}</strong>

              <span>
                {new Date(
                  log.created_at
                ).toLocaleString('ar-LB')}
              </span>

              <small>
                {log.entity_type}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function PaperDetailsModal({
  paper,
  imageUrl,
  imageHistory,
  onClose,
  onChanged
}) {
  const [showPaymentForm, setShowPaymentForm] =
    useState(false)
  const [showImageForm, setShowImageForm] =
    useState(false)
  const [showArchiveForm, setShowArchiveForm] =
    useState(false)

  const [paymentAmount, setPaymentAmount] =
    useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paymentNote, setPaymentNote] =
    useState('')

  const [newImageFile, setNewImageFile] =
    useState(null)
  const [newImageDescription, setNewImageDescription] =
    useState('')
  const [archiveReason, setArchiveReason] =
    useState('')

  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

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

      setPaymentAmount('')
      setPaymentNote('')
      setShowPaymentForm(false)
      setMessage('تمت إضافة الدفعة')
      await onChanged()
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

    try {
      const path = await uploadPaperImage(
        newImageFile,
        paper.id
      )

      await savePaperImageHistory({
        paperId: paper.id,
        imagePath: path,
        description: newImageDescription
      })

      await updatePaperImagePath(
        paper.id,
        path
      )

      setMessage('تم استبدال الصورة')
      setShowImageForm(false)
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(action) {
    setSaving(true)

    try {
      if (action === 'close') {
        await closePaper(paper.id)
      }

      if (action === 'reopen') {
        await reopenPaper(paper.id)
      }

      setMessage('تم تحديث الحالة')
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function archive() {
    setSaving(true)

    try {
      await archivePaper(
        paper.id,
        archiveReason
      )

      setMessage('تمت أرشفة الورقة')
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const paymentsTotal = getPaymentsTotal(paper)
  const balance = calculateBalance(
    paper.total_amount,
    paper.payments
  )

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

        <p>
          القيمة:{' '}
          {paper.total_amount === null
            ? 'غير محسوبة'
            : paper.total_amount}
        </p>

        <p>
          الدفعات: {paymentsTotal.toFixed(2)}
        </p>

        <p>
          الرصيد:{' '}
          {balance === null
            ? 'غير محسوب'
            : balance.toFixed(2)}
        </p>

        <p>
          الحالة: {getStatusText(paper.status)}
        </p>

        {paper.note && (
          <p>الملاحظة: {paper.note}</p>
        )}

        <div className="status-actions">
          {paper.status === 'open' && (
            <button
              className="close-paper-button"
              onClick={() =>
                changeStatus('close')
              }
              disabled={saving}
            >
              إغلاق الورقة
            </button>
          )}

          {paper.status === 'closed' && (
            <button
              className="reopen-paper-button"
              onClick={() =>
                changeStatus('reopen')
              }
              disabled={saving}
            >
              إعادة فتح الورقة
            </button>
          )}

          {paper.status !== 'archived' && (
            <button
              className="archive-button"
              onClick={() =>
                setShowArchiveForm(!showArchiveForm)
              }
              disabled={saving}
            >
              أرشفة الورقة
            </button>
          )}
        </div>

        {showArchiveForm && (
          <section className="archive-form">
            <label>
              سبب الأرشفة
              <textarea
                value={archiveReason}
                onChange={(event) =>
                  setArchiveReason(event.target.value)
                }
                rows="3"
              />
            </label>

            <button
              className="archive-button"
              onClick={archive}
              disabled={saving}
            >
              تأكيد الأرشفة
            </button>
          </section>
        )}

        {paper.status !== 'archived' && (
          <>
            <button
              className="payment-button"
              onClick={() =>
                setShowPaymentForm(!showPaymentForm)
              }
            >
              {showPaymentForm
                ? 'إلغاء إضافة دفعة'
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
                      setPaymentAmount(
                        event.target.value
                      )
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
                      setPaymentDate(
                        event.target.value
                      )
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

                <button
                  type="submit"
                  disabled={saving}
                >
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

                <button
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? 'جارٍ الرفع...'
                    : 'حفظ الصورة الجديدة'}
                </button>
              </form>
            )}
          </>
        )}

        <h3>الدفعات</h3>

        {paper.payments?.filter(
          (payment) => !payment.is_archived
        ).length ? (
          <ul className="payments-list">
            {paper.payments
              .filter(
                (payment) => !payment.is_archived
              )
              .map((payment) => (
                <li key={payment.id}>
                  <div>
                    <span>
                      {payment.payment_date} —{' '}
                      {Number(payment.amount).toFixed(2)}
                    </span>

                    {payment.note && (
                      <small>{payment.note}</small>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <p>لا توجد دفعات</p>
        )}

        <h3>سجل الصور</h3>

        {imageHistory.length === 0 ? (
          <p>لا يوجد سجل صور</p>
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