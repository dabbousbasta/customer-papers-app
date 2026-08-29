import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()

      if (!mounted) return

      setSession(data.session)
      setLoading(false)

      if (data.session) {
        loadProfile(data.session.user.id)
      }
    }

    async function loadProfile(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .single()

      if (!error) {
        setProfile(data)
      }
    }

    loadSession()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)

      if (newSession) {
        loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

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
    } else {
      setMessage('تم تسجيل الدخول بنجاح')
    }

    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  if (loading) {
    return (
      <main dir="rtl">
        <p>جارٍ تحميل التطبيق...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main dir="rtl" className="auth-page">
        <section className="auth-card">
          <h1>نظام أوراق الزبائن</h1>
          <p>تسجيل الدخول إلى النظام</p>

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
              {loading ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
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

      <section className="dashboard-grid">
        <article className="stat-card">
          <span>الأوراق المفتوحة</span>
          <strong>0</strong>
        </article>

        <article className="stat-card">
          <span>الأوراق غير المحسوبة</span>
          <strong>0</strong>
        </article>

        <article className="stat-card">
          <span>الزبائن</span>
          <strong>0</strong>
        </article>

        <article className="stat-card">
          <span>إجمالي الأرصدة</span>
          <strong>0.00</strong>
        </article>
      </section>

      <section className="welcome-card">
        <h2>لوحة التحكم</h2>
        <p>
          تم تجهيز تسجيل الدخول بنجاح. سنضيف الآن الزبائن والأوراق والدفعات.
        </p>

        <button onClick={() => setMessage('سنضيف هذه الوظيفة في المرحلة التالية')}>
          إضافة ورقة جديدة
        </button>

        {message && <p className="message">{message}</p>}
      </section>
    </main>
  )
}

export default App