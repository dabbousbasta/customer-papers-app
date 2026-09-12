import { supabase } from './supabase'

const BUCKET_NAME = 'paper-images'

async function compressImageFile(file) {
  try {
    const bitmap = await createImageBitmap(file)

    const maxDimension = 1600
    let width = bitmap.width
    let height = bitmap.height

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round(
          (height * maxDimension) / width
        )
        width = maxDimension
      } else {
        width = Math.round(
          (width * maxDimension) / height
        )
        height = maxDimension
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(
        (result) => resolve(result),
        'image/jpeg',
        0.8
      )
    })

    if (!blob) {
      return file
    }

    const baseName =
      file.name.split('.').slice(0, -1).join('.') ||
      file.name

    return new File(
      [blob],
      `${baseName}.jpg`,
      { type: 'image/jpeg' }
    )
  } catch {
    return file
  }
}

export async function uploadPaperImage(file, paperId) {
  if (!file) {
    throw new Error('اختر صورة الورقة')
  }

  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf'

  if (!isImage && !isPdf) {
    throw new Error('الملف يجب أن يكون صورة أو PDF')
  }

  if (file.size > 6 * 1024 * 1024) {
    throw new Error('حجم الصورة يجب ألا يتجاوز 6 ميغابايت')
  }

  const fileToUpload = isImage
    ? await compressImageFile(file)
    : file

  const extension =
    fileToUpload.name.split('.').pop()?.toLowerCase() ||
    'jpg'

  const fileName = `${crypto.randomUUID()}.${extension}`
  const path = `papers/${paperId}/${fileName}`

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, fileToUpload, {
      cacheControl: '3600',
      upsert: false,
      contentType: fileToUpload.type
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
      is_current: false,
      is_cover: false
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
      is_cover: true,
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

export async function addPaperPage({
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

  const { data: existingCurrent, error: countError } =
    await supabase
      .from('paper_images')
      .select('id')
      .eq('paper_id', paperId)
      .eq('is_current', true)

  if (countError) {
    throw countError
  }

  const isFirstPage =
    !existingCurrent || existingCurrent.length === 0

  const cleanDescription =
    description?.trim() || null

  const { data, error } = await supabase
    .from('paper_images')
    .insert({
      paper_id: paperId,
      image_path: imagePath,
      is_current: true,
      is_cover: isFirstPage,
      description: cleanDescription,
      note: cleanDescription,
      created_by: user.id
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return {
    image: data,
    becameCover: isFirstPage
  }
}

export async function removePaperImage({
  paperId,
  imageId
}) {
  const { data: removedImage, error: fetchError } =
    await supabase
      .from('paper_images')
      .select('id, is_cover')
      .eq('id', imageId)
      .single()

  if (fetchError) {
    throw fetchError
  }

  const { error: updateError } = await supabase
    .from('paper_images')
    .update({
      is_current: false,
      is_cover: false
    })
    .eq('id', imageId)

  if (updateError) {
    throw updateError
  }

  if (!removedImage.is_cover) {
    return { newCoverPath: undefined }
  }

  const { data: remaining, error: remainingError } =
    await supabase
      .from('paper_images')
      .select('id, image_path')
      .eq('paper_id', paperId)
      .eq('is_current', true)
      .order('created_at', { ascending: true })
      .limit(1)

  if (remainingError) {
    throw remainingError
  }

  if (!remaining || remaining.length === 0) {
    return { newCoverPath: null }
  }

  const newCover = remaining[0]

  const { error: setCoverError } = await supabase
    .from('paper_images')
    .update({ is_cover: true })
    .eq('id', newCover.id)

  if (setCoverError) {
    throw setCoverError
  }

  return { newCoverPath: newCover.image_path }
}

export async function setPaperCoverImage({
  paperId,
  imageId
}) {
  const { error: unsetError } = await supabase
    .from('paper_images')
    .update({ is_cover: false })
    .eq('paper_id', paperId)
    .eq('is_current', true)

  if (unsetError) {
    throw unsetError
  }

  const { data, error } = await supabase
    .from('paper_images')
    .update({ is_cover: true })
    .eq('id', imageId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data.image_path
}

export async function getPaperImageHistory(paperId) {
  const { data, error } = await supabase
    .from('paper_images')
    .select(`
      id,
      paper_id,
      image_path,
      is_current,
      is_cover,
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