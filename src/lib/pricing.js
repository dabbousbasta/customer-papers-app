import { supabase } from './supabase'
import {
  cleanDocumentNumber,
  normalizeSearchText
} from './searchText'

export const PRICING_BUCKET = 'pricing-images'

const PAGE_SIZE = 1000

async function getUserId() {
  const {
    data: { session }
  } = await supabase.auth.getSession()

  const userId = session?.user?.id

  if (!userId) {
    throw new Error('يجب تسجيل الدخول أولًا')
  }

  return userId
}

// Supabase يرجع 1000 سطر كحد أقصى بكل طلب، لذلك نقرأ على دفعات
async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery().range(
      from,
      from + PAGE_SIZE - 1
    )

    if (error) {
      throw error
    }

    rows.push(...(data || []))

    if (!data || data.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

function friendlyError(error) {
  if (error?.code === '23505') {
    return new Error('هذا الرقم أو الاسم مسجل من قبل')
  }

  if (error?.code === '42P01') {
    return new Error(
      'جداول التسعير غير موجودة بعد في Supabase. شغّل ملف SQL أولًا.'
    )
  }

  return error
}

// ---------- تحميل كل البيانات ----------

export async function loadPricingData() {
  try {
    const [accounts, invoices, images] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from('pricing_accounts')
          .select('id, name, notes, created_at')
          .order('created_at', { ascending: true })
      ),
      fetchAllRows(() =>
        supabase
          .from('pricing_invoices')
          .select(
            'id, account_id, invoice_number, note, is_archived, archived_at, created_at'
          )
          .order('created_at', { ascending: true })
      ),
      fetchAllRows(() =>
        supabase
          .from('pricing_images')
          .select(
            'id, invoice_id, delivery_number, image_path, thumb_path, created_at'
          )
          .eq('is_deleted', false)
          .order('created_at', { ascending: true })
      )
    ])

    return { accounts, invoices, images }
  } catch (error) {
    throw friendlyError(error)
  }
}

// ---------- الحسابات ----------

export async function createPricingAccount(name) {
  const cleanName = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')

  if (!cleanName) {
    throw new Error('اكتب اسم الحساب')
  }

  const userId = await getUserId()

  const { data, error } = await supabase
    .from('pricing_accounts')
    .insert({
      name: cleanName,
      normalized_name: normalizeSearchText(cleanName),
      created_by: userId
    })
    .select('id, name, notes, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('يوجد حساب بنفس الاسم')
    }

    throw friendlyError(error)
  }

  return data
}

export async function renamePricingAccount(accountId, name) {
  const cleanName = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')

  if (!cleanName) {
    throw new Error('اكتب اسم الحساب')
  }

  const { data, error } = await supabase
    .from('pricing_accounts')
    .update({
      name: cleanName,
      normalized_name: normalizeSearchText(cleanName),
      updated_at: new Date().toISOString()
    })
    .eq('id', accountId)
    .select('id, name, notes, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('يوجد حساب بنفس الاسم')
    }

    throw friendlyError(error)
  }

  return data
}

// ---------- الفواتير ----------

export async function createPricingInvoice({
  accountId,
  invoiceNumber
}) {
  const cleanNumber = cleanDocumentNumber(invoiceNumber)

  if (!cleanNumber) {
    throw new Error('اكتب رقم الفاتورة')
  }

  const userId = await getUserId()

  const { data, error } = await supabase
    .from('pricing_invoices')
    .insert({
      account_id: accountId,
      invoice_number: cleanNumber,
      is_archived: false,
      created_by: userId
    })
    .select(
      'id, account_id, invoice_number, note, is_archived, archived_at, created_at'
    )
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('رقم الفاتورة مسجل من قبل لهذا الحساب')
    }

    throw friendlyError(error)
  }

  return data
}

export async function updatePricingInvoiceNumber(
  invoiceId,
  invoiceNumber
) {
  const cleanNumber = cleanDocumentNumber(invoiceNumber)

  if (!cleanNumber) {
    throw new Error('اكتب رقم الفاتورة')
  }

  const { data, error } = await supabase
    .from('pricing_invoices')
    .update({
      invoice_number: cleanNumber,
      updated_at: new Date().toISOString()
    })
    .eq('id', invoiceId)
    .select(
      'id, account_id, invoice_number, note, is_archived, archived_at, created_at'
    )
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('رقم الفاتورة مسجل من قبل لهذا الحساب')
    }

    throw friendlyError(error)
  }

  return data
}

export async function setPricingInvoiceArchived(
  invoiceId,
  archived
) {
  const { data, error } = await supabase
    .from('pricing_invoices')
    .update({
      is_archived: archived,
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', invoiceId)
    .select(
      'id, account_id, invoice_number, note, is_archived, archived_at, created_at'
    )
    .single()

  if (error) {
    throw friendlyError(error)
  }

  return data
}

// ---------- الصور ----------

async function resizeImage(file, maxDimension, quality) {
  const bitmap = await createImageBitmap(file)

  let { width, height } = bitmap

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(
      maxDimension / width,
      maxDimension / height
    )

    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })

  if (!blob) {
    throw new Error('تعذر تجهيز الصورة')
  }

  return blob
}

async function prepareImageFiles(file) {
  try {
    const full = await resizeImage(file, 2000, 0.82)
    const thumb = await resizeImage(file, 360, 0.7)

    return { full, thumb, extension: 'jpg', type: 'image/jpeg' }
  } catch {
    // إذا لم يستطع المتصفح قراءة الصورة نرفعها كما هي
    const extension =
      file.name?.split('.').pop()?.toLowerCase() || 'jpg'

    return {
      full: file,
      thumb: null,
      extension,
      type: file.type || 'application/octet-stream'
    }
  }
}

export async function uploadPricingImage({
  invoiceId,
  deliveryNumber,
  file
}) {
  // رقم الإذن اختياري: الورقة بدون رقم بتنحفظ فاضية
  const cleanDelivery = cleanDocumentNumber(deliveryNumber || '')

  if (!file?.type?.startsWith('image/')) {
    throw new Error('الملف ليس صورة')
  }

  const userId = await getUserId()
  const prepared = await prepareImageFiles(file)

  if (prepared.full.size > 15 * 1024 * 1024) {
    throw new Error('حجم الصورة أكبر من 15 ميغابايت')
  }

  const fileId = crypto.randomUUID()
  const imagePath = `invoices/${invoiceId}/${fileId}.${prepared.extension}`
  const thumbPath = prepared.thumb
    ? `invoices/${invoiceId}/thumbs/${fileId}.jpg`
    : null

  const storage = supabase.storage.from(PRICING_BUCKET)

  const { error: uploadError } = await storage.upload(
    imagePath,
    prepared.full,
    {
      cacheControl: '31536000',
      upsert: false,
      contentType: prepared.type
    }
  )

  if (uploadError) {
    throw uploadError
  }

  const uploadedPaths = [imagePath]

  if (thumbPath) {
    const { error: thumbError } = await storage.upload(
      thumbPath,
      prepared.thumb,
      {
        cacheControl: '31536000',
        upsert: false,
        contentType: 'image/jpeg'
      }
    )

    if (thumbError) {
      await storage.remove(uploadedPaths).catch(() => {})
      throw thumbError
    }

    uploadedPaths.push(thumbPath)
  }

  const { data, error } = await supabase
    .from('pricing_images')
    .insert({
      invoice_id: invoiceId,
      delivery_number: cleanDelivery,
      image_path: imagePath,
      thumb_path: thumbPath,
      created_by: userId
    })
    .select(
      'id, invoice_id, delivery_number, image_path, thumb_path, created_at'
    )
    .single()

  if (error) {
    await storage.remove(uploadedPaths).catch(() => {})
    throw friendlyError(error)
  }

  return data
}

export async function updatePricingImageDelivery(
  imageId,
  deliveryNumber
) {
  // رقم الإذن اختياري: الورقة بدون رقم بتنحفظ فاضية
  const cleanDelivery = cleanDocumentNumber(deliveryNumber || '')

  const { data, error } = await supabase
    .from('pricing_images')
    .update({ delivery_number: cleanDelivery })
    .eq('id', imageId)
    .select(
      'id, invoice_id, delivery_number, image_path, thumb_path, created_at'
    )
    .single()

  if (error) {
    throw friendlyError(error)
  }

  return data
}

// تعديل كامل للصورة: نقلها لفاتورة ثانية (حساب ثاني) وتعديل رقم الإذن
export async function updatePricingImage(imageId, { invoiceId, deliveryNumber }) {
  if (!invoiceId) {
    throw new Error('اختر الفاتورة')
  }

  const { data, error } = await supabase
    .from('pricing_images')
    .update({
      invoice_id: invoiceId,
      delivery_number: cleanDocumentNumber(deliveryNumber || '')
    })
    .eq('id', imageId)
    .select(
      'id, invoice_id, delivery_number, image_path, thumb_path, created_at'
    )
    .single()

  if (error) {
    throw friendlyError(error)
  }

  return data
}

// الحذف ناعم: الصورة تختفي من الصفحة لكن الملف يبقى محفوظًا
export async function deletePricingImage(imageId) {
  const { error } = await supabase
    .from('pricing_images')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    })
    .eq('id', imageId)

  if (error) {
    throw friendlyError(error)
  }
}

const signedUrlCache = new Map()
const SIGNED_URL_SECONDS = 60 * 60

export async function getSignedImageUrls(paths) {
  const now = Date.now()
  const result = {}
  const missing = []

  for (const path of paths) {
    if (!path) continue

    const cached = signedUrlCache.get(path)

    if (cached && cached.expiresAt > now + 60_000) {
      result[path] = cached.url
    } else {
      missing.push(path)
    }
  }

  for (let index = 0; index < missing.length; index += 100) {
    const chunk = missing.slice(index, index + 100)

    const { data, error } = await supabase.storage
      .from(PRICING_BUCKET)
      .createSignedUrls(chunk, SIGNED_URL_SECONDS)

    if (error) {
      throw error
    }

    for (const item of data || []) {
      if (item.signedUrl && item.path) {
        result[item.path] = item.signedUrl
        signedUrlCache.set(item.path, {
          url: item.signedUrl,
          expiresAt: now + SIGNED_URL_SECONDS * 1000
        })
      }
    }
  }

  return result
}

// حذف فاتورة بدون صور (قاعدة البيانات ترفض حذف فاتورة لها صور)
export async function deletePricingInvoice(invoiceId) {
  const { error } = await supabase
    .from('pricing_invoices')
    .delete()
    .eq('id', invoiceId)

  if (error) {
    if (error.code === '23503' || error.code === '23001') {
      throw new Error('لا يمكن حذف فاتورة فيها صور')
    }

    throw friendlyError(error)
  }
}

// حذف حساب بدون فواتير
export async function deletePricingAccount(accountId) {
  const { error } = await supabase
    .from('pricing_accounts')
    .delete()
    .eq('id', accountId)

  if (error) {
    if (error.code === '23503' || error.code === '23001') {
      throw new Error('لا يمكن حذف حساب مسجل تحته فواتير')
    }

    throw friendlyError(error)
  }
}
