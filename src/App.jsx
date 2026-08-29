import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
      }
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
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
    setMessage('تم تسجيل الخروج')
  }

  if (!session) {
    return (
      <main dir="rtl">
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
            {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <p>{message}</p>
      </main>
    )
  }

  return (
    <main dir="rtl">
      <h1>مرحبًا بك في نظام أوراق الزبائن</h1>

      <p>تم تسجيل الدخول بنجاح.</p>
      <p>المستخدم: {session.user.email}</p>

      <button onClick={signOut}>
        تسجيل الخروج
      </button>

      <p>{message}</p>
    </main>
  )
}

export default App