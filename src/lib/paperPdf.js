import { jsPDF } from 'jspdf'

async function prepareImage(url, maxWidth = 1600, quality = 0.8) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('تعذر تحميل إحدى الصور')
  }

  const bitmap = await createImageBitmap(await response.blob())
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width,
    height
  }
}

// كل صورة = صفحة بحجمها، فما بتنقص ولا بتتشوّه
export async function buildPdfBlob(urls, onProgress) {
  const pageWidth = 595
  let pdf = null

  for (let index = 0; index < urls.length; index++) {
    const { dataUrl, width, height } = await prepareImage(urls[index])
    const pageHeight = Math.round((height * pageWidth) / width)
    const orientation = pageHeight >= pageWidth ? 'p' : 'l'

    if (!pdf) {
      pdf = new jsPDF({
        unit: 'pt',
        format: [pageWidth, pageHeight],
        orientation
      })
    } else {
      pdf.addPage([pageWidth, pageHeight], orientation)
    }

    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight)
    onProgress?.(index + 1, urls.length)
  }

  return pdf.output('blob')
}

export async function sharePdfBlob(blob, filename) {
  const file = new File([blob], filename, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return 'shared'
  }

  // احتياطي للكمبيوتر: تنزيل الملف
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 10000)
  return 'downloaded'
}
