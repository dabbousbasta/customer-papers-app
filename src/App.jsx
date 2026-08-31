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
  createCustomer,
  getCustomers
} from './lib/customers'
import {
  calculateBalance,
  createPaper,
  getPapers,
  updatePaperAmount
} from './lib/papers'
import {
  createPaperImageUrl,
  uploadPaperImage
} from './lib/storage'
import { createPayment } from './lib/payments'
import {
  buildCustomerWhatsAppReport,
  openWhatsAppMessage
} from './lib/whatsapp'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data } =
        await supabase.auth.getSession()

      if (active) {
        setSession(data.session)
        setLoading(false)
      }
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
        <h1>نظام أوراق الزبائن</h1>
        <p>تسجيل الدخول</p>

        <form onSubmit={login}>
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
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCustomers('')
  }, [])

  async function loadCustomers(value) {
    setLoading(true)

    const { data, error } =
      await getCustomers(value)

    if (error) {
      setMessage(error.message)
    } else {
      setCustomers(data || [])
    }

    setLoading(false)
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name
        .toLowerCase()
        .includes(search.toLowerCase())
  )

  return (
    <main dir="rtl" className="app-page">
      <Header
        session={session}
        signOut={signOut}
        title="اختيار الزبون"
      />

      <section className="customer-start-card">
        <h2>اختر الزبون للبدء</h2>
        <p>
          بعد الاختيار ستظهر كل أوراقه ودفعاته وتقاريره.
        </p>
      </section>

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

      {message && (
        <p className="message error">{message}</p>
      )}

      {loading ? (
        <div className="empty-card">
          جارٍ تحميل الزبائن...
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="empty-card">
          لا يوجد زبائن
        </div>
      ) : (
        <section className="customer-picker-list">
          {filteredCustomers.map((customer) => (
            <article
              className="customer-picker-card"
              key={customer.id}
            >
              <button
                className="customer-picker-item"
                onClick={() =>
                  navigate(
                    `/customer/${customer.id}`
                  )
                }
              >
                <strong>{customer.name}</strong>

                {customer.phone && (
                  <small>{customer.phone}</small>
                )}
              </button>

              <button
                className="quick-paper-button"
                onClick={() =>
                  navigate(
                    `/customer/${customer.id}/papers`
                  )
                }
              >
                إضافة ورقة
              </button>
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
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCustomer()
  }, [customerId])

  async function loadCustomer() {
    setLoading(true)

    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    setCustomer(data || null)
    setLoading(false)
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
          الملخص
        </Link>

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
          element={<CustomerSummary customer={customer} />}
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
          element={<CustomerReport customer={customer} />}
        />
      </Routes>
    </main>
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

      setPapers(data)
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

  const finalBalance = openPapers.reduce(
    (sum, paper) => {
      const balance = calculateBalance(
        paper.total_amount,
        paper.payments
      )

      return sum + (balance === null ? 0 : balance)
    },
    0
  )

  const totalPayments = papers.reduce(
    (sum, paper) =>
      sum + getPaymentsTotal(paper),
    0
  )

  return (
    <section className="customer-section">
      <div className="summary-cards">
        <article className="summary-card">
          <span>كل الأوراق</span>
          <strong>{papers.length}</strong>
        </article>

        <article className="summary-card">
          <span>المفتوحة</span>
          <strong>{openPapers.length}</strong>
        </article>

        <article className="summary-card">
          <span>إجمالي الدفعات</span>
          <strong>{totalPayments.toFixed(2)}</strong>
        </article>

        <article className="summary-card total-summary-card">
          <span>الرصيد النهائي</span>
          <strong>{finalBalance.toFixed(2)}</strong>
        </article>
      </div>

      <div className="customer-summary-actions">
        <Link
          className="primary-link"
          to={`/customer/${customer.id}/papers`}
        >
          أوراق الزبون
        </Link>

        <Link
          className="secondary-link"
          to={`/customer/${customer.id}/report`}
        >
          التقرير
        </Link>
      </div>
    </section>
  )
}

function CustomerPapers({ customer }) {
  const [papers, setPapers] = useState([])
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedPaper, setSelectedPaper] =
    useState(null)
  const [selectedImage, setSelectedImage] =
    useState(null)

  const [paperFile, setPaperFile] = useState(null)
  const [paperDate, setPaperDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paperNote, setPaperNote] = useState('')
  const [totalAmount, setTotalAmount] =
    useState('')

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        customerId: customer.id,
        includeArchived: true
      })

      setPapers(data)
    } catch (error) {
      setMessage(error.message)
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
      setShowForm(false)
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

      setSelectedPaper(paper)
      setSelectedImage(imageUrl)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const visiblePapers = papers.filter((paper) => {
    if (filter === 'all') return true
    return paper.status === filter
  })

  return (
    <section className="customer-section">
      <div className="section-header">
        <div>
          <h2>أوراق {customer.name}</h2>
          <p>
            عدد النتائج: {visiblePapers.length}
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
        >
          {showForm
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

      {showForm && (
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
        <PaperModal
          paper={selectedPaper}
          imageUrl={selectedImage}
          onClose={() => {
            setSelectedPaper(null)
            setSelectedImage(null)
          }}
          onSaved={async () => {
            await loadPapers()
            setSelectedPaper(null)
            setSelectedImage(null)
          }}
        />
      )}
    </section>
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

      setPapers(data)
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

  const payments = papers.flatMap((paper) =>
    (paper.payments || [])
      .filter((payment) => !payment.is_archived)
      .map((payment) => ({
        ...payment,
        paperDate: paper.paper_date
      }))
  )

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

  useEffect(() => {
    loadPapers()
  }, [customer.id])

  async function loadPapers() {
    try {
      const data = await getPapers({
        customerId: customer.id,
        includeArchived: false
      })

      setPapers(data)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function shareReport() {
    setMessage('جارٍ تجهيز التقرير...')

    try {
      const text =
        await buildCustomerWhatsAppReport(
          customer,
          papers
        )

      openWhatsAppMessage(text)
      setMessage('تم تجهيز التقرير')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const openPapers = papers.filter(
    (paper) => paper.status === 'open'
  )

  const finalBalance = openPapers.reduce(
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
          <p>الأوراق المفتوحة</p>
        </div>

        <button
          className="whatsapp-button"
          onClick={shareReport}
        >
          إرسال WhatsApp
        </button>
      </div>

      {message && (
        <p className="message">{message}</p>
      )}

      <section className="report-summary-card">
        <span>الرصيد النهائي</span>
        <strong>{finalBalance.toFixed(2)}</strong>
      </section>

      {openPapers.map((paper) => {
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
              الدفعات:{' '}
              {getPaymentsTotal(paper).toFixed(2)}
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
    </section>
  )
}

function PaperModal({
  paper,
  imageUrl,
  onClose,
  onSaved
}) {
  const [showAmountForm, setShowAmountForm] =
    useState(false)
  const [showPaymentForm, setShowPaymentForm] =
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
  const [paymentNote, setPaymentNote] =
    useState('')
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
          الدفعات:{' '}
          {getPaymentsTotal(paper).toFixed(2)}
        </p>

        <p>
          الرصيد:{' '}
          {balance === null
            ? 'غير محسوب'
            : balance.toFixed(2)}
        </p>

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
              {saving ? 'جارٍ الحفظ...' : 'حفظ الدفعة'}
            </button>
          </form>
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