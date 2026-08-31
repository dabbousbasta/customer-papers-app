import { supabase } from './supabase'

const BUCKET_NAME = 'paper-images'

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

  const extension =
    file.name.split('.').pop()?.toLowerCase() || 'jpg'

  const fileName = `${crypto.randomUUID()}.${extension}`
  const path = `papers/${paperId}/${fileName}`

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
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

export async function createPaperImageUrl(
  imagePath,
  expiresIn = 3600
) {
  if (!imagePath) {
    return null
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(imagePath, expiresIn)

  if (error) {
    throw error
  }

  return data.signedUrl
}

export async function savePaperImageHistory({
  paperId,
  imagePath,
  description
}) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    throw new Error('يجب تسجيل الدخول أولًا')
  }

  const { error: updateError } = await supabase
    .from('paper_images')
    .update({
      is_current: false
    })
    .eq('paper_id', paperId)
    .eq('is_current', true)

  if (updateError) {
    throw updateError
  }

  const cleanDescription =
    description?.trim() || null

  const { data, error } = await supabase
    .from('paper_images')
    .insert({
      paper_id: paperId,
      image_path: imagePath,
      is_current: true,
      description: cleanDescription,
      note: cleanDescription,
      created_by: user.id
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function getPaperImageHistory(paperId) {
  const { data, error } = await supabase
    .from('paper_images')
    .select(`
      id,
      paper_id,
      image_path,
      is_current,
      description,
      note,
      created_at
    `)
    .eq('paper_id', paperId)
    .order('created_at', {
      ascending: false
    })

  if (error) {
    throw error
  }

  return data || []
}