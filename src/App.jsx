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
import { getCustomers } from './lib/customers'
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

  async function loadCustomers(searchText) {
    setLoading(true)

    const { data, error } =
      await getCustomers(searchText)

    if (error) {
      setMessage(error.message)
    } else {
      setCustomers(data || [])
    }

    setLoading(false)
  }

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
      ) : customers.length === 0 ? (
        <div className="empty-card">
          لا يوجد زبائن
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
          element={
            <CustomerSummary customer={customer} />
          }
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

  const totalOpenPayments = openPapers.reduce(
    (sum, paper) => {
      return sum + getPaymentsTotal(paper)
    },
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
        الملخص المالي أعلاه يحسب الأوراق المفتوحة فقط.
        الأوراق المغلقة والمؤرشفة لا تدخل في الرصيد أو
        إجمالي الدفعات المفتوح.
      </p>

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
  const [imageHistory, setImageHistory] = useState([])

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

      const history = await getPaperImageHistory(
        paper.id
      )

      setSelectedPaper(paper)
      setSelectedImage(imageUrl)
      setImageHistory(history)
    } catch (error) {
      setMessage(error.message)
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

            const amountText =
              paper.total_amount === null
                ? 'غير محسوبة'
                : paper.total_amount

            const balanceText =
              balance === null
                ? 'غير محسوب'
                : balance.toFixed(2)

            return (
              <article
                className="paper-card"
                key={paper.id}
              >
                <div>
                  <h3>{paper.paper_date}</h3>
                  <p>القيمة: {amountText}</p>

                  <p>
                    الدفعات:{' '}
                    {getPaymentsTotal(paper).toFixed(2)}
                  </p>

                  <p>الرصيد: {balanceText}</p>

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
      const openPapers = papers.filter(
        (paper) => paper.status === 'open'
      )

      const text =
        await buildCustomerWhatsAppReport(
          customer,
          openPapers
        )

      openWhatsAppMessage(text)
      setMessage('تم تجهيز تقرير الأوراق المفتوحة')
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
                : paper.total_amount

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
      await archivePaper(
        paper.id,
        archiveReason
      )

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
      window.open(url, '_blank')
    } catch (error) {
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
      : paper.total_amount

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