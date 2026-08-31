import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  createCustomer,
  getCustomers,
  updateCustomer
} from './lib/customers'
import {
  calculateBalance,
  createPaper,
  getPapers,
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

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)

  const [customers, setCustomers] = useState([])
  const [papers, setPapers] = useState([])
  const [search, setSearch] = useState('')

  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showPaperForm, setShowPaperForm] = useState(false)

  const [editingCustomer, setEditingCustomer] = useState(null)

  const [selectedPaper, setSelectedPaper] = useState(null)
  const [selectedPaperImage, setSelectedPaperImage] =
    useState(null)

  const [showPaymentForm, setShowPaymentForm] =
    useState(false)
  const [editingPayment, setEditingPayment] =
    useState(null)

  const [showImageForm, setShowImageForm] =
    useState(false)
  const [newImageFile, setNewImageFile] = useState(null)
  const [newImageNote, setNewImageNote] = useState('')
  const [imageHistory, setImageHistory] = useState([])

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  const [selectedCustomerId, setSelectedCustomerId] =
    useState('')
  const [paperDate, setPaperDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paperFile, setPaperFile] = useState(null)
  const [paperNote, setPaperNote] = useState('')
  const [totalAmount, setTotalAmount] = useState('')

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paymentNote, setPaymentNote] = useState('')

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
        await loadProfile(data.session.user.id)
        await loadCustomers('')
        await loadPapers()
      }
    }

    initialize()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)

        if (newSession) {
          await loadProfile(newSession.user.id)
          await loadCustomers('')
          await loadPapers()
        } else {
          setProfile(null)
          setCustomers([])
          setPapers([])
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

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
      const data = await getPapers()
      setPapers(data)
    } catch (error) {
      setMessage(`فشل تحميل الأوراق: ${error.message}`)
    }
  }

  async function refreshSelectedPaper(paperId) {
    const updatedPapers = await getPapers()
    setPapers(updatedPapers)

    const updatedPaper = updatedPapers.find(
      (paper) => paper.id === paperId
    )

    if (!updatedPaper) return

    setSelectedPaper(updatedPaper)

    const imageUrl = await createPaperImageUrl(
      updatedPaper.image_path
    )

    setSelectedPaperImage(imageUrl)
  }

  async function openPaperDetails(paper) {
    try {
      setMessage('جارٍ تحميل تفاصيل الورقة...')

      const imageUrl = await createPaperImageUrl(
        paper.image_path
      )

      const history = await getPaperImageHistory(paper.id)

      setSelectedPaper(paper)
      setSelectedPaperImage(imageUrl)
      setImageHistory(history)
      setShowPaymentForm(false)
      setShowImageForm(false)
      setMessage('')
    } catch (error) {
      setMessage(`فشل تحميل التفاصيل: ${error.message}`)
    }
  }

  async function loadImageHistory(paperId) {
    const history = await getPaperImageHistory(paperId)
    setImageHistory(history)
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
    setNewImageNote('')
  }

  function openAddCustomer() {
    resetCustomerForm()
    setShowCustomerForm(true)
    setShowPaperForm(false)
    setMessage('')
  }

  function openEditCustomer(customer) {
    setEditingCustomer(customer)
    setCustomerName(customer.name || '')
    setCustomerPhone(customer.phone || '')
    setCustomerNotes(customer.notes || '')
    setShowCustomerForm(true)
    setShowPaperForm(false)
    setMessage('')
  }

  function openAddPaper() {
    resetPaperForm()
    setShowPaperForm(true)
    setShowCustomerForm(false)
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
      await loadCustomers(search)
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

      await loadPapers()

      resetPaperForm()
      setShowPaperForm(false)
      setMessage('تمت إضافة الورقة بنجاح')
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
        note: newImageNote
      })

      await updatePaperImagePath(
        selectedPaper.id,
        newImagePath
      )

      await refreshSelectedPaper(selectedPaper.id)
      await loadImageHistory(selectedPaper.id)

      resetImageForm()
      setShowImageForm(false)
      setMessage(
        'تم استبدال الصورة وحفظ الصورة القديمة في السجل'
      )
    } catch (error) {
      setMessage(
        error.message || 'حدث خطأ أثناء استبدال الصورة'
      )
    } finally {
      setSaving(false)
    }
  }

  async function openOldImage(imagePath) {
    try {
      const imageUrl = await createPaperImageUrl(imagePath)
      window.open(imageUrl, '_blank')
    } catch (error) {
      setMessage(`فشل فتح الصورة القديمة: ${error.message}`)
    }
  }

  function getPaymentsTotal(paper) {
    return (paper.payments || [])
      .filter((payment) => !payment.is_archived)
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      )
  }

  function getStatusText(status) {
    if (status === 'open') return 'مفتوحة'
    if (status === 'closed') return 'مغلقة'
    if (status === 'archived') return 'مؤرشفة'
    return status
  }

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

            <button type="submit" disabled={loading}>
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

      <section className="section-header">
        <div>
          <h2>الزبائن والأوراق</h2>
          <p>
            الزبائن: {customers.length} | الأوراق: {papers.length}
          </p>
        </div>

        <div className="header-actions">
          <button onClick={openAddPaper}>
            إضافة ورقة
          </button>

          <button onClick={openAddCustomer}>
            إضافة زبون
          </button>
        </div>
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
              <button type="submit" disabled={saving}>
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

      {showPaperForm && (
        <section className="form-card">
          <h2>إضافة ورقة جديدة</h2>

          {customers.length === 0 ? (
            <p className="message error">
              أضف زبونًا أولًا قبل إنشاء الورقة.
            </p>
          ) : (
            <form onSubmit={savePaper}>
              <label>
                الزبون
                <select
                  value={selectedCustomerId}
                  onChange={(event) =>
                    setSelectedCustomerId(event.target.value)
                  }
                  required
                >
                  <option value="">اختر الزبون</option>

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

              <div className="form-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'جارٍ الحفظ...' : 'حفظ الورقة'}
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

      <section className="customers-list">
        {customers.length === 0 ? (
          <div className="empty-card">
            لا يوجد زبائن حتى الآن
          </div>
        ) : (
          customers.map((customer) => (
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
                  <p>ملاحظات: {customer.notes}</p>
                )}
              </div>

              <button
                className="edit-button"
                onClick={() => openEditCustomer(customer)}
              >
                تعديل
              </button>
            </article>
          ))
        )}
      </section>

      <section className="papers-section">
        <div className="section-header">
          <div>
            <h2>آخر الأوراق</h2>
            <p>عدد الأوراق: {papers.length}</p>
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="empty-card">
            لا توجد أوراق حتى الآن
          </div>
        ) : (
          <div className="papers-list">
            {papers.map((paper) => {
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

                    <p>التاريخ: {paper.paper_date}</p>

                    <p>
                      القيمة:{' '}
                      {paper.total_amount === null
                        ? 'غير محسوبة'
                        : paper.total_amount}
                    </p>

                    <p>
                      مجموع الدفعات:{' '}
                      {getPaymentsTotal(paper).toFixed(2)}
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
                  </div>

                  <button
                    className="details-button"
                    onClick={() => openPaperDetails(paper)}
                  >
                    التفاصيل
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>

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
                resetPaymentForm()
                resetImageForm()
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
                  سبب أو ملاحظة التعديل
                  <textarea
                    value={newImageNote}
                    onChange={(event) =>
                      setNewImageNote(event.target.value)
                    }
                    rows="2"
                    placeholder="مثال: تمت إضافة أسعار جديدة"
                  />
                </label>

                <div className="form-actions">
                  <button type="submit" disabled={saving}>
                    {saving
                      ? 'جارٍ رفع الصورة...'
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

            <p>التاريخ: {selectedPaper.paper_date}</p>

            <p>
              القيمة:{' '}
              {selectedPaper.total_amount === null
                ? 'غير محسوبة'
                : selectedPaper.total_amount}
            </p>

            <p>
              مجموع الدفعات:{' '}
              {getPaymentsTotal(selectedPaper).toFixed(2)}
            </p>

            <p>
              الرصيد:{' '}
              {calculateBalance(
                selectedPaper.total_amount,
                selectedPaper.payments
              ) === null
                ? 'غير محسوب'
                : calculateBalance(
                    selectedPaper.total_amount,
                    selectedPaper.payments
                  ).toFixed(2)}
            </p>

            {selectedPaper.note && (
              <p>الملاحظة: {selectedPaper.note}</p>
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
                  <button type="submit" disabled={saving}>
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
                          {Number(payment.amount).toFixed(2)}
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

                      {image.note && (
                        <small>{image.note}</small>
                      )}
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