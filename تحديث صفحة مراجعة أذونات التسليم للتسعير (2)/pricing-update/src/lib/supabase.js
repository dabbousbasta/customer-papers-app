import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('بيانات Supabase غير موجودة في ملف .env.local')
}

// Supabase أحيانًا بيرفض تسجيل دخول جديد بخطأ
// "JWT issued at future" (PGRST303) بسبب فرق بالساعة عندهم.
// الحل: ننتظر شوي ونعيد نفس الطلب، لأن بعد ثواني بيصير مقبول.
const RETRY_DELAYS_MS = [1000, 2000, 3000, 4000]

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isIssuedAtFutureError(response) {
  if (response.status !== 401) return false

  try {
    const text = await response.clone().text()
    return (
      text.includes('PGRST303') &&
      text.toLowerCase().includes('issued at future')
    )
  } catch {
    return false
  }
}

async function fetchWithClockRetry(input, init) {
  let response = await fetch(input, init)

  for (const delay of RETRY_DELAYS_MS) {
    if (!(await isIssuedAtFutureError(response))) {
      return response
    }

    await wait(delay)
    response = await fetch(input, init)
  }

  return response
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    global: {
      fetch: fetchWithClockRetry
    }
  }
)
