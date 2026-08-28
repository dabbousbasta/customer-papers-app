import { useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [message, setMessage] = useState('لم يتم الفحص بعد')
  const [loading, setLoading] = useState(false)

  async function testConnection() {
    setLoading(true)
    setMessage('جارٍ الاتصال...')

    const { error } = await supabase.auth.getSession()

    if (error) {
      setMessage(`فشل الاتصال: ${error.message}`)
    } else {
      setMessage('تم الاتصال بـ Supabase بنجاح')
    }

    setLoading(false)
  }

  return (
    <main dir="rtl">
      <h1>نظام أوراق الزبائن</h1>

      <p>اختبار الاتصال مع Supabase</p>

      <button onClick={testConnection} disabled={loading}>
        {loading ? 'جارٍ الفحص...' : 'فحص الاتصال'}
      </button>

      <p>{message}</p>
    </main>
  )
}

export default App