import { useEffect, useMemo, useState } from 'react'
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

  const [activeTab, setActiveTab] = useState('dashboard')
  const [paperFilter, setPaperFilter] = useState('all')
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] =
    useState(null)

  const [customers, setCustomers] = useState([])
  const [papers, setPapers] = useState([])
  const [customerReports, setCustomerReports] =
    useState([])

  const [dashboard, setDashboard] = useState({
    customersCount: 0,
    openPapersCount: 0,
    uncalculatedPapersCount: 0,
    customersWithOpenPapersCount: 0,
    totalRemaining: 0
  })

  const [search, setSearch] = useState('')
  const [customerSearch, setCustomerSearch] =
    useState('')

  const [showCustomerForm, setShowCustomerForm] =
    useState(false)
  const [showPaperForm, setShowPaperForm] =
    useState(false)
  const [editingCustomer, setEditingCustomer] =
    useState(null)

  const [selectedPaper, setSelectedPaper] =
    useState(null)
  const [selectedPaperImage, setSelectedPaperImage] =
    useState(null)

  const [showPaymentForm, setShowPaymentForm] =
    useState(false)
  const [editingPayment, setEditingPayment] =
    useState(null)

  const [showImageForm, setShowImageForm] =
    useState(false)
  const [newImageFile, setNewImageFile] =
    useState(null)
  const [newImageDescription, setNewImageDescription] =
    useState('')
  const [imageHistory, setImageHistory] =
    useState([])

  const [showArchiveForm, setShowArchiveForm] =
    useState(false)
  const [archiveReason, setArchiveReason] =
    useState('')

  const [customerName, setCustomerName] =
    useState('')
  const [customerPhone, setCustomerPhone] =
    useState('')
  const [customerNotes, setCustomerNotes] =
    useState('')

  const [selectedCustomerId, setSelectedCustomerId] =
    useState('')
  const [paperDate, setPaperDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paperFile, setPaperFile] = useState(null)
  const [paperNote, setPaperNote] = useState('')
  const [totalAmount, setTotalAmount] =
    useState('')

  const [paymentAmount, setPaymentAmount] =
    useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paymentNote, setPaymentNote] =
    useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    async function initialize() {
      const { data, error } =
        await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        setMessage(`فشل تحميل الجلسة: ${error.message}`)
      }

      setSession(data.session)
      setLoading(false)

      if (data.session) {
        await loadAllData()
      }
    }

    initialize()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)

        if (newSession) {
          await loadAllData()
        } else {
          setProfile(null)
          setCustomers([])
          setPapers([])
          setCustomerReports([])
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function loadAllData() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      await loadProfile(user.id)
    }

    await loadCustomers('')
    await loadPapers()
    await loadDashboard()
  }

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
    }
  }

  async function loadCustomers(searchText = '') {
    const { data, error } =
      await getCustomers(searchText)

    if (error) {
      setMessage(`فشل تحميل الزبائن: ${error.message}`)
      return
    }

    setCustomers(data || [])
  }

  async function loadPapers() {
    try {
      const data = await getPapers({
        includeArchived: true
      })

      setPapers(data)
    } catch (error) {
      setMessage(`فشل تحميل الأوراق: ${error.message}`)
    }
  }

  async function loadDashboard() {
    try {
      const data = await getDashboardData()

      setDashboard({
        customersCount: data.customersCount,
        openPapersCount: data.openPapersCount,
        uncalculatedPapersCount:
          data.uncalculatedPapersCount,
        customersWithOpenPapersCount:
          data.customersWithOpenPapersCount,
        totalRemaining: data.totalRemaining
      })

      setCustomerReports(data.customerReports)
    } catch (error) {
      setMessage(`فشل تحميل التقارير: ${error.message}`)
    }
  }

  async function refreshData() {
    await loadPapers()
    await loadDashboard()
  }

  async function refreshSelectedPaper(paperId) {
    const updatedPapers = await getPapers({
      includeArchived: true
    })

    setPapers(updatedPapers)

    const updatedPaper = updatedPapers.find(
      (paper) => paper.id === paperId
    )

    if (!updatedPaper) {
      setSelectedPaper(null)
      return
    }

    setSelectedPaper(updatedPaper)

    const imageUrl = await createPaperImageUrl(
      updatedPaper.image_path
    )

    setSelectedPaperImage(imageUrl)

    const history = await getPaperImageHistory(paperId)
    setImageHistory(history)

    await loadDashboard()
  }

  async function openPaperDetails(paper) {
    try {
      setMessage('جارٍ تحميل التفاصيل...')

      const imageUrl = await createPaperImageUrl(
        paper.image_path
      )

      const history = await getPaperImageHistory(
        paper.id
      )

      setSelectedPaper(paper)
      setSelectedPaperImage(imageUrl)
      setImageHistory(history)
      setShowPaymentForm(false)
      setShowImageForm(false)
      setShowArchiveForm(false)
      setMessage('')
    } catch (error) {
      setMessage(`فشل تحميل التفاصيل: ${error.message}`)
    }
  }

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

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setCustomers([])
    setPapers([])
    setCustomerReports([])
  }

  function resetCustomerForm() {
    setCustomerName('')
    setCustomerPhone('')
    setCustomerNotes('')
    setEditingCustomer(null)
  }

  function resetPaperForm() {
    setSelectedCustomerId('')
    setPaperDate(new Date().toISOString().slice(0, 10))
    setPaperFile(null)
    setPaperNote('')
    setTotalAmount('')
  }

  function resetPaymentForm() {
    setPaymentAmount('')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentNote('')
    setEditingPayment(null)
  }

  function resetImageForm() {
    setNewImageFile(null)
    setNewImageDescription('')
  }

  function resetArchiveForm() {
    setArchiveReason('')
    setShowArchiveForm(false)
  }

  function openAddCustomer() {
    resetCustomerForm()
    setShowCustomerForm(true)
    setShowPaperForm(false)
    setActiveTab('customers')
    setMessage('')
  }

  function openEditCustomer(customer) {
    setEditingCustomer(customer)
    setCustomerName(customer.name || '')
    setCustomerPhone(customer.phone || '')
    setCustomerNotes(customer.notes || '')
    setShowCustomerForm(true)
    setShowPaperForm(false)
    setActiveTab('customers')
    setMessage('')
  }

  function openAddPaper() {
    resetPaperForm()
    setShowPaperForm(true)
    setShowCustomerForm(false)
    setActiveTab('papers')
    setMessage('')
  }

  function openAddPayment() {
    resetPaymentForm()
    setShowPaymentForm(true)
    setMessage('')
  }

  function openEditPayment(payment) {
    setEditingPayment(payment)
    setPaymentAmount(payment.amount || '')
    setPaymentDate(payment.payment_date || '')
    setPaymentNote(payment.note || '')
    setShowPaymentForm(true)
    setMessage('')
  }

  function openReplaceImage() {
    resetImageForm()
    setShowImageForm(true)
    setMessage('')
  }

  async function saveCustomer(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, {
          name: customerName,
          phone: customerPhone,
          notes: customerNotes
        })

        setMessage('تم تعديل بيانات الزبون')
      } else {
        await createCustomer({
          name: customerName,
          phone: customerPhone,
          notes: customerNotes
        })

        setMessage('تمت إضافة الزبون')
      }

      resetCustomerForm()
      setShowCustomerForm(false)
      await loadCustomers(customerSearch)
      await loadDashboard()
    } catch (error) {
      setMessage(error.message || 'حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  async function savePaper(event) {
    event.preventDefault()

    if (!selectedCustomerId) {
      setMessage('اختر الزبون')
      return
    }

    if (!paperFile) {
      setMessage('اختر صورة الورقة')
      return
    }

    setSaving(true)
    setMessage('جارٍ حفظ الورقة...')

    try {
      const temporaryPaperId = crypto.randomUUID()

      const imagePath = await uploadPaperImage(
        paperFile,
        temporaryPaperId
      )

      await createPaper({
        customerId: selectedCustomerId,
        paperDate,
        imagePath,
        note: paperNote,
        totalAmount
      })

      resetPaperForm()
      setShowPaperForm(false)
      setMessage('تمت إضافة الورقة بنجاح')

      await refreshData()
    } catch (error) {
      setMessage(error.message || 'حدث خطأ أثناء حفظ الورقة')
    } finally {
      setSaving(false)
    }
  }

  async function savePayment(event) {
    event.preventDefault()

    if (!selectedPaper) {
      setMessage('لم يتم اختيار ورقة')
      return
    }

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setMessage('أدخل قيمة دفعة أكبر من صفر')
      return
    }

    setSaving(true)
    setMessage('جارٍ حفظ الدفعة...')

    try {
      const wasEditing = Boolean(editingPayment)

      if (wasEditing) {
        await updatePayment(editingPayment.id, {
          amount: paymentAmount,
          paymentDate,
          note: paymentNote
        })
      } else {
        await createPayment({
          paperId: selectedPaper.id,
          amount: paymentAmount,
          paymentDate,
          note: paymentNote
        })
      }

      await refreshSelectedPaper(selectedPaper.id)

      resetPaymentForm()
      setShowPaymentForm(false)
      setMessage(
        wasEditing
          ? 'تم تعديل الدفعة بنجاح'
          : 'تمت إضافة الدفعة بنجاح'
      )
    } catch (error) {
      setMessage(error.message || 'حدث خطأ أثناء حفظ الدفعة')
    } finally {
      setSaving(false)
    }
  }

  async function saveNewImage(event) {
    event.preventDefault()

    if (!selectedPaper) {
      setMessage('لم يتم اختيار ورقة')
      return
    }

    if (!newImageFile) {
      setMessage('اختر الصورة الجديدة')
      return
    }

    setSaving(true)
    setMessage('جارٍ رفع الصورة الجديدة...')

    try {
      const newImagePath = await uploadPaperImage(
        newImageFile,
        selectedPaper.id
      )

      await savePaperImageHistory({
        paperId: selectedPaper.id,
        imagePath: newImagePath,
        description: newImageDescription
      })

      await updatePaperImagePath(
        selectedPaper.id,
        newImagePath
      )

      await refreshSelectedPaper(selectedPaper.id)

      resetImageForm()
      setShowImageForm(false)
      setMessage(
        'تم استبدال الصورة وحفظ الصورة القديمة'
      )
    } catch (error) {
      setMessage(
        error.message || 'حدث خطأ أثناء استبدال الصورة'
      )
    } finally {
      setSaving(false)
    }
  }

  async function saveArchive(event) {
    event.preventDefault()

    if (!selectedPaper) {
      setMessage('لم يتم اختيار ورقة')
      return
    }

    setSaving(true)
    setMessage('جارٍ أرشفة الورقة...')

    try {
      await archivePaper(
        selectedPaper.id,
        archiveReason
      )

      await refreshData()

      setSelectedPaper(null)
      setSelectedPaperImage(null)
      setImageHistory([])
      resetArchiveForm()

      setMessage('تمت أرشفة الورقة')
    } catch (error) {
      setMessage(error.message || 'حدث خطأ أثناء الأرشفة')
    } finally {
      setSaving(false)
    }
  }

  async function changePaperStatus(action) {
    if (!selectedPaper) return

    setSaving(true)
    setMessage('جارٍ تحديث حالة الورقة...')

    try {
      if (action === 'close') {
        await closePaper(selectedPaper.id)
      }

      if (action === 'reopen') {
        await reopenPaper(selectedPaper.id)
      }

      await refreshSelectedPaper(selectedPaper.id)
      setMessage('تم تحديث حالة الورقة')
    } catch (error) {
      setMessage(
        error.message || 'حدث خطأ أثناء تحديث الحالة'
      )
    } finally {
      setSaving(false)
    }
  }

  async function shareCustomerReport(customerId) {
    const customer = customers.find(
      (item) => item.id === customerId
    )

    if (!customer) {
      setMessage('لم يتم العثور على الزبون')
      return
    }

    setMessage('جارٍ تجهيز التقرير...')

    try {
      const customerPapers = papers.filter(
        (paper) => paper.customer_id === customerId
      )

      const text = await buildCustomerWhatsAppReport(
        customer,
        customerPapers
      )

      openWhatsAppMessage(text)
      setMessage('تم تجهيز رسالة WhatsApp')
    } catch (error) {
      setMessage(
        error.message || 'فشل تجهيز التقرير'
      )
    }
  }

  async function openCustomerHistory(customer) {
    setSelectedHistoryCustomer(customer)
    setActiveTab('customer-history')
    setPaperFilter('all')
    setMessage('')
  }

  async function openOldImage(imagePath) {
    try {
      const imageUrl = await createPaperImageUrl(
        imagePath
      )

      window.open(imageUrl, '_blank')
    } catch (error) {
      setMessage(`فشل فتح الصورة: ${error.message}`)
    }
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

  function formatAmount(value) {
    return Number(value || 0).toFixed(2)
  }

  const filteredCustomers = useMemo(() => {
    const text = customerSearch.trim().toLowerCase()

    if (!text) {
      return customers
    }

    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(text)
    )
  }, [customers, customerSearch])

  const visiblePapers = useMemo(() => {
    if (activeTab === 'customer-history') {
      if (!selectedHistoryCustomer) {
        return []
      }

      return papers.filter(
        (paper) =>
          paper.customer_id === selectedHistoryCustomer.id
      )
    }

    if (paperFilter === 'open') {
      return papers.filter(
        (paper) => paper.status === 'open'
      )
    }

    if (paperFilter === 'closed') {
      return papers.filter(
        (paper) => paper.status === 'closed'
      )
    }

    if (paperFilter === 'archived') {
      return papers.filter(
        (paper) => paper.status === 'archived'
      )
    }

    return papers.filter(
      (paper) => paper.status !== 'archived'
    )
  }, [
    activeTab,
    paperFilter,
    papers,
    selectedHistoryCustomer
  ])

  if (loading) {
    return (
      <main dir="rtl">
        <p>جارٍ التحميل...</p>
      </main>
    )
  }

  if (!session) {
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

            <button type="submit">
              تسجيل الدخول
            </button>
          </form>

          {message && (
            <p className="message error">{message}</p>
          )}
        </section>
      </main>
    )
  }

  return (
    <main dir="rtl" className="app-page">
      <header className="topbar">
        <div>
          <h1>نظام أوراق الزبائن</h1>
          <p>
            مرحبًا {profile?.display_name || session.user.email}
          </p>
        </div>

        <button
          onClick={signOut}
          className="secondary-button"
        >
          تسجيل الخروج
        </button>
      </header>

      <nav className="main-tabs">
        <button
          className={
            activeTab === 'dashboard'
              ? 'tab-button active'
              : 'tab-button'
          }
          onClick={() => setActiveTab('dashboard')}
        >
          لوحة التحكم
        </button>

        <button
          className={
            activeTab === 'customers'
              ? 'tab-button active'
              : 'tab-button'
          }
          onClick={() => setActiveTab('customers')}
        >
          الزبائن
        </button>

        <button
          className={
            activeTab === 'papers'
              ? 'tab-button active'
              : 'tab-button'
          }
          onClick={() => setActiveTab('papers')}
        >
          الأوراق
        </button>

        <button
          className={
            activeTab === 'reports'
              ? 'tab-button active'
              : 'tab-button'
          }
          onClick={() => setActiveTab('reports')}
        >
          التقارير
        </button>

        {activeTab === 'customer-history' && (
          <button className="tab-button active">
            سجل العميل
          </button>
        )}
      </nav>

      {activeTab === 'dashboard' && (
        <>
          <section className="dashboard-cards">
            <article className="dashboard-card">
              <span>الزبائن</span>
              <strong>{dashboard.customersCount}</strong>
            </article>

            <article className="dashboard-card">
              <span>الأوراق المفتوحة</span>
              <strong>
                {dashboard.openPapersCount}
              </strong>
            </article>

            <article className="dashboard-card">
              <span>غير محسوبة</span>
              <strong>
                {dashboard.uncalculatedPapersCount}
              </strong>
            </article>

            <article className="dashboard-card">
              <span>زبائن عليهم أوراق</span>
              <strong>
                {dashboard.customersWithOpenPapersCount}
              </strong>
            </article>

            <article className="dashboard-card total-card">
              <span>إجمالي الأرصدة</span>
              <strong>
                {formatAmount(dashboard.totalRemaining)}
              </strong>
            </article>
          </section>

          <section className="quick-actions">
            <button onClick={openAddPaper}>
              إضافة ورقة جديدة
            </button>

            <button onClick={openAddCustomer}>
              إضافة زبون جديد
            </button>

            <button
              className="reports-button"
              onClick={() => setActiveTab('reports')}
            >
              فتح التقارير
            </button>
          </section>
        </>
      )}

      {activeTab === 'customers' && (
        <>
          <section className="section-header">
            <div>
              <h2>الزبائن</h2>
              <p>العدد: {customers.length}</p>
            </div>

            <button onClick={openAddCustomer}>
              إضافة زبون
            </button>
          </section>

          <section className="search-box">
            <input
              type="search"
              placeholder="ابحث عن الزبون..."
              value={customerSearch}
              onChange={(event) =>
                setCustomerSearch(event.target.value)
              }
            />
          </section>

          {showCustomerForm && (
            <section className="form-card">
              <h2>
                {editingCustomer
                  ? 'تعديل الزبون'
                  : 'إضافة زبون جديد'}
              </h2>

              <form onSubmit={saveCustomer}>
                <label>
                  اسم الزبون
                  <input
                    value={customerName}
                    onChange={(event) =>
                      setCustomerName(event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  الهاتف
                  <input
                    value={customerPhone}
                    onChange={(event) =>
                      setCustomerPhone(event.target.value)
                    }
                  />
                </label>

                <label>
                  ملاحظات
                  <textarea
                    value={customerNotes}
                    onChange={(event) =>
                      setCustomerNotes(event.target.value)
                    }
                    rows="3"
                  />
                </label>

                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                  </button>

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      resetCustomerForm()
                      setShowCustomerForm(false)
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </section>
          )}

          {message && <p className="message">{message}</p>}

          <section className="customers-list">
            {filteredCustomers.length === 0 ? (
              <div className="empty-card">
                لا يوجد زبائن
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <article
                  className="customer-card"
                  key={customer.id}
                >
                  <div>
                    <h3>{customer.name}</h3>

                    {customer.phone && (
                      <p>الهاتف: {customer.phone}</p>
                    )}

                    {customer.notes && (
                      <p>
                        ملاحظات: {customer.notes}
                      </p>
                    )}
                  </div>

                  <div className="card-actions">
                    <button
                      className="history-button"
                      onClick={() =>
                        openCustomerHistory(customer)
                      }
                    >
                      كل الأوراق
                    </button>

                    <button
                      className="edit-button"
                      onClick={() =>
                        openEditCustomer(customer)
                      }
                    >
                      تعديل
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}

      {(activeTab === 'papers' ||
        activeTab === 'customer-history') && (
        <>
          <section className="section-header">
            <div>
              <h2>
                {activeTab === 'customer-history'
                  ? `سجل أوراق: ${
                      selectedHistoryCustomer?.name || ''
                    }`
                  : 'الأوراق'}
              </h2>

              <p>
                عدد الأوراق: {visiblePapers.length}
              </p>
            </div>

            <div className="header-actions">
              <button onClick={openAddPaper}>
                إضافة ورقة
              </button>

              {activeTab === 'customer-history' && (
                <button
                  className="back-button"
                  onClick={() => {
                    setActiveTab('customers')
                    setSelectedHistoryCustomer(null)
                  }}
                >
                  العودة إلى الزبائن
                </button>
              )}
            </div>
          </section>

          <section className="filter-tabs">
            <button
              className={
                paperFilter === 'all'
                  ? 'filter-button active'
                  : 'filter-button'
              }
              onClick={() => setPaperFilter('all')}
            >
              الكل
            </button>

            <button
              className={
                paperFilter === 'open'
                  ? 'filter-button active'
                  : 'filter-button'
              }
              onClick={() => setPaperFilter('open')}
            >
              مفتوحة
            </button>

            <button
              className={
                paperFilter === 'closed'
                  ? 'filter-button active'
                  : 'filter-button'
              }
              onClick={() => setPaperFilter('closed')}
            >
              مغلقة
            </button>

            <button
              className={
                paperFilter === 'archived'
                  ? 'filter-button active'
                  : 'filter-button'
              }
              onClick={() => setPaperFilter('archived')}
            >
              مؤرشفة
            </button>
          </section>

          {showPaperForm && (
            <section className="form-card">
              <h2>إضافة ورقة جديدة</h2>

              {customers.length === 0 ? (
                <p className="message error">
                  أضف زبونًا أولًا.
                </p>
              ) : (
                <form onSubmit={savePaper}>
                  <label>
                    الزبون
                    <select
                      value={selectedCustomerId}
                      onChange={(event) =>
                        setSelectedCustomerId(
                          event.target.value
                        )
                      }
                      required
                    >
                      <option value="">
                        اختر الزبون
                      </option>

                      {customers.map((customer) => (
                        <option
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </label>

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
                        setTotalAmount(
                          event.target.value
                        )
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

                  <div className="form-actions">
                    <button
                      type="submit"
                      disabled={saving}
                    >
                      {saving
                        ? 'جارٍ الحفظ...'
                        : 'حفظ الورقة'}
                    </button>

                    <button
                      type="button"
                      className="cancel-button"
                      onClick={() => {
                        resetPaperForm()
                        setShowPaperForm(false)
                      }}
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {message && <p className="message">{message}</p>}

          <section className="papers-list">
            {visiblePapers.length === 0 ? (
              <div className="empty-card">
                لا توجد أوراق في هذا القسم
              </div>
            ) : (
              visiblePapers.map((paper) => {
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
                      <h3>
                        {paper.customers?.name ||
                          'زبون غير معروف'}
                      </h3>

                      <p>
                        التاريخ: {paper.paper_date}
                      </p>

                      <p>
                        القيمة:{' '}
                        {paper.total_amount === null
                          ? 'غير محسوبة'
                          : paper.total_amount}
                      </p>

                      <p>
                        الدفعات:{' '}
                        {formatAmount(
                          getPaymentsTotal(paper)
                        )}
                      </p>

                      <p>
                        الرصيد:{' '}
                        {balance === null
                          ? 'غير محسوب'
                          : formatAmount(balance)}
                      </p>

                      <p>
                        الحالة:{' '}
                        {getStatusText(paper.status)}
                      </p>
                    </div>

                    <button
                      className="details-button"
                      onClick={() =>
                        openPaperDetails(paper)
                      }
                    >
                      التفاصيل
                    </button>
                  </article>
                )
              })
            )}
          </section>
        </>
      )}

      {activeTab === 'reports' && (
        <section className="reports-page">
          <section className="section-header">
            <div>
              <h2>التقارير</h2>
              <p>الأرصدة المفتوحة حسب الزبون</p>
            </div>
          </section>

          <section className="reports-card">
            {customerReports.length === 0 ? (
              <p>
                لا يوجد زبائن عليهم أرصدة مفتوحة
              </p>
            ) : (
              <div className="reports-list">
                {customerReports.map((report) => (
                  <article
                    className="report-row"
                    key={report.customerId}
                  >
                    <div>
                      <h3>{report.name}</h3>
                      <p>
                        الأوراق المفتوحة:{' '}
                        {report.openPapersCount}
                      </p>
                    </div>

                    <div className="report-actions">
                      <strong>
                        {formatAmount(
                          report.totalRemaining
                        )}
                      </strong>

                      <button
                        className="history-button"
                        onClick={() => {
                          const customer =
                            customers.find(
                              (item) =>
                                item.id ===
                                report.customerId
                            )

                          if (customer) {
                            openCustomerHistory(customer)
                          }
                        }}
                      >
                        كل الأوراق
                      </button>

                      <button
                        className="whatsapp-button"
                        onClick={() =>
                          shareCustomerReport(
                            report.customerId
                          )
                        }
                      >
                        WhatsApp
                      </button>
                    </div>
                  </article>
                ))}

                <div className="report-total">
                  <span>الإجمالي العام:</span>

                  <strong>
                    {formatAmount(
                      dashboard.totalRemaining
                    )}
                  </strong>
                </div>
              </div>
            )}
          </section>
        </section>
      )}

      {selectedPaper && (
        <div className="modal-backdrop">
          <section className="paper-details-modal">
            <button
              className="close-button"
              onClick={() => {
                setSelectedPaper(null)
                setSelectedPaperImage(null)
                setImageHistory([])
                setShowPaymentForm(false)
                setShowImageForm(false)
                setShowArchiveForm(false)
                resetPaymentForm()
                resetImageForm()
                resetArchiveForm()
              }}
            >
              إغلاق
            </button>

            <h2>تفاصيل الورقة</h2>

            {selectedPaperImage && (
              <img
                className="paper-image"
                src={selectedPaperImage}
                alt="صورة الورقة"
              />
            )}

            <button
              className="image-button"
              onClick={openReplaceImage}
            >
              استبدال الصورة
            </button>

            {showImageForm && (
              <form
                className="image-form"
                onSubmit={saveNewImage}
              >
                <h3>رفع صورة جديدة</h3>

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

                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? 'جارٍ الرفع...'
                      : 'حفظ الصورة الجديدة'}
                  </button>

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      resetImageForm()
                      setShowImageForm(false)
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}

            <h3>
              {selectedPaper.customers?.name ||
                'زبون غير معروف'}
            </h3>

            <p>
              التاريخ: {selectedPaper.paper_date}
            </p>

            <p>
              القيمة:{' '}
              {selectedPaper.total_amount === null
                ? 'غير محسوبة'
                : selectedPaper.total_amount}
            </p>

            <p>
              الدفعات:{' '}
              {formatAmount(getPaymentsTotal(selectedPaper))}
            </p>

            <p>
              الرصيد:{' '}
              {calculateBalance(
                selectedPaper.total_amount,
                selectedPaper.payments
              ) === null
                ? 'غير محسوب'
                : formatAmount(
                    calculateBalance(
                      selectedPaper.total_amount,
                      selectedPaper.payments
                    )
                  )}
            </p>

            <p>
              الحالة:{' '}
              {getStatusText(selectedPaper.status)}
            </p>

            {selectedPaper.note && (
              <p>الملاحظة: {selectedPaper.note}</p>
            )}

            <div className="status-actions">
              {selectedPaper.status === 'open' && (
                <button
                  className="close-paper-button"
                  onClick={() =>
                    changePaperStatus('close')
                  }
                  disabled={saving}
                >
                  إغلاق الورقة
                </button>
              )}

              {selectedPaper.status === 'closed' && (
                <button
                  className="reopen-paper-button"
                  onClick={() =>
                    changePaperStatus('reopen')
                  }
                  disabled={saving}
                >
                  إعادة فتح الورقة
                </button>
              )}

              <button
                className="archive-button"
                onClick={() => {
                  setShowArchiveForm(true)
                  setMessage('')
                }}
                disabled={saving}
              >
                أرشفة الورقة
              </button>
            </div>

            {showArchiveForm && (
              <form
                className="archive-form"
                onSubmit={saveArchive}
              >
                <h3>أرشفة الورقة</h3>

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

                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? 'جارٍ الأرشفة...'
                      : 'تأكيد الأرشفة'}
                  </button>

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={resetArchiveForm}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}

            <button
              className="payment-button"
              onClick={openAddPayment}
            >
              إضافة دفعة
            </button>

            {showPaymentForm && (
              <form
                className="payment-form"
                onSubmit={savePayment}
              >
                <h3>
                  {editingPayment
                    ? 'تعديل الدفعة'
                    : 'إضافة دفعة'}
                </h3>

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
                  ملاحظة الدفعة
                  <textarea
                    value={paymentNote}
                    onChange={(event) =>
                      setPaymentNote(event.target.value)
                    }
                    rows="2"
                  />
                </label>

                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? 'جارٍ الحفظ...'
                      : 'حفظ الدفعة'}
                  </button>

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      resetPaymentForm()
                      setShowPaymentForm(false)
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}

            <h3>الدفعات</h3>

            {selectedPaper.payments?.filter(
              (payment) => !payment.is_archived
            ).length ? (
              <ul className="payments-list">
                {selectedPaper.payments
                  .filter(
                    (payment) => !payment.is_archived
                  )
                  .map((payment) => (
                    <li key={payment.id}>
                      <div>
                        <span>
                          {payment.payment_date} —{' '}
                          {formatAmount(payment.amount)}
                        </span>

                        {payment.note && (
                          <small>{payment.note}</small>
                        )}
                      </div>

                      <button
                        className="small-button"
                        onClick={() =>
                          openEditPayment(payment)
                        }
                      >
                        تعديل
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>لا توجد دفعات</p>
            )}

            <h3>سجل الصور</h3>

            {imageHistory.length === 0 ? (
              <p>لا يوجد سجل صور بعد</p>
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
                        openOldImage(image.image_path)
                      }
                    >
                      فتح الصورة
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default App