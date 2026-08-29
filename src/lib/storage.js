import { supabase } from './supabase'

export async function uploadPaperImage(file, paperId) {
  if (!file) {
    throw new Error('اختر صورة الورقة')
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('الملف المختار ليس صورة')
  }

  if (file.size > 6 * 1024 * 1024) {
    throw new Error('حجم الصورة يجب ألا يتجاوز 6 ميغابايت')
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const fileName = `${crypto.randomUUID()}.${extension}`
  const path = `papers/${paperId}/${fileName}`

  const { error } = await supabase.storage
    .from('paper-images')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    })

  if (error) {
    throw error
  }

  return path
}