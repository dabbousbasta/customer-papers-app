import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  createCustomer,
  getCustomers,
  updateCustomer
} from './lib/customers'
import { createPaper } from './lib/papers'
import { uploadPaperImage } from './lib/storage'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')

  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showPaperForm, setShowPaperForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [paperDate, setPaperDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [paperFile, setPaperFile] = useState(null)
  const [paperNote, setPaperNote] = useState('')
  const [totalAmount, setTotalAmount] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    async function initialize() {
      const { data } = await supabase.auth.getSession()

      if (!mounted) return

      setSession(data.session)
      setLoading(false)

      if (data.session) {
        await loadProfile(data.session.user.id)
        await loadCustomers()
      }
    }

    initialize()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)

      if (newSession) {
        await loadProfile(newSession.user.id)
        await loadCustomers()
      } else {
        setProfile(null)
        setCustomers([])
      }
    })

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

  async function loadCustomers(searchText = search) {
    const { data, error } = await getCustomers(searchText)

    if (error) {
      setMessage(`فشل تحميل الزبائن: ${error.message}`)
      return
    }

    setCustomers(data || [])
  }

  async function signIn(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
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

  function openAddCustomer() {
    resetCustomerForm()
    setShowCustomerForm(true)
    setMessage('')
  }

  function openEditCustomer(customer) {
    setEditingCustomer(customer)
    setCustomerName(customer.name || '')
    setCustomerPhone(customer.phone || '')
    setCustomerNotes(customer.notes || '')
    setShowCustomerForm(true)
    setMessage('')
  }

  function openAddPaper() {
    resetPaperForm()
    setShowPaperForm(true)
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
      await loadCustomers()
    } catch (error) {
      setMessage(error.message || 'حدث خطأ أثناء حفظ الزبون')
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
    } catch (error) {
      setMessage(error.message || 'حدث خطأ أثناء حفظ الورقة')
    } finally {
      setSaving(false)
    }
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

          <form onSubmit={signIn}>
            <label>
              البريد الإلكتروني
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              كلمة المرور
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              تسجيل الدخول
            </button>
          </form>

          {message && <p className="message error">{message}</p>}
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

        <button onClick={signOut} className="secondary-button">
          تسجيل الخروج
        </button>
      </header>

      <section className="section-header">
        <div>
          <h2>الزبائن</h2>
          <p>عدد الزبائن: {customers.length}</p>
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
            {editingCustomer ? 'تعديل الزبون' : 'إضافة زبون جديد'}
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
                  <option key={customer.id} value={customer.id}>
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
                  setPaperFile(event.target.files?.[0] || null)
                }
                required
              />
            </label>

            <label>
              تاريخ الورقة
              <input
                type="date"
                value={paperDate}
                onChange={(event) => setPaperDate(event.target.value)}
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
                onChange={(event) => setPaperNote(event.target.value)}
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
            <article className="customer-card" key={customer.id}>
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
    </main>
  )
}

export default App