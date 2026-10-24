// توحيد النص للبحث: أرقام عربية، أحرف متشابهة، تشكيل، وترتيب الكلمات

const ARABIC_INDIC_ZERO = 0x0660
const PERSIAN_ZERO = 0x06f0

export function toLatinDigits(value) {
  return String(value ?? '')
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO)
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - PERSIAN_ZERO)
    )
}

export function normalizeSearchText(value) {
  return toLatinDigits(value)
    // التشكيل والتطويل
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // الأحرف المتشابهة
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئی]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/ء/g, '')
    .toLowerCase()
    // أي رموز أو فواصل تصبح مسافة
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function getSearchTokens(query) {
  const normalized = normalizeSearchText(query)
  return normalized ? normalized.split(' ') : []
}

// كل كلمة من البحث يجب أن تكون موجودة، بأي ترتيب، ولو جزء من كلمة
export function matchesSearch(text, query) {
  const tokens = Array.isArray(query)
    ? query
    : getSearchTokens(query)

  if (tokens.length === 0) {
    return true
  }

  const normalizedText = normalizeSearchText(text)
  const compactText = normalizedText.replace(/ /g, '')

  return tokens.every(
    (token) =>
      normalizedText.includes(token) ||
      compactText.includes(token)
  )
}

// تنظيف رقم الفاتورة أو رقم الإذن قبل الحفظ
export function cleanDocumentNumber(value) {
  return toLatinDigits(value)
    .trim()
    .replace(/\s+/g, ' ')
}
