import { useRef, useState } from 'react'
import { getSignedImageUrls } from './lib/pricing'
import { buildPdfBlob, sharePdfBlob } from './lib/paperPdf'

// images: صور الفاتورة مرتبة، filename: اسم ملف الـ PDF
export default function SharePdfButton({ images, filename }) {
  const [state, setState] = useState('idle') // idle | working | ready
  const [progress, setProgress] = useState('')
  const blobRef = useRef(null)

  async function handleClick() {
    try {
      if (!blobRef.current) {
        setState('working')
        setProgress('')

        const paths = images.map((image) => image.image_path)
        const urlMap = await getSignedImageUrls(paths)
        const urls = paths.map((path) => urlMap[path]).filter(Boolean)

        if (!urls.length) {
          throw new Error('لا توجد صور')
        }

        blobRef.current = await buildPdfBlob(urls, (done, total) =>
          setProgress(`${done}/${total}`)
        )
      }

      await sharePdfBlob(blobRef.current, filename)
      setState('idle')
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        // المتصفح بدو ضغطة جديدة، والملف صار جاهز
        setState('ready')
      } else if (error?.name === 'AbortError') {
        setState('idle')
      } else {
        console.error(error)
        setState('idle')
        window.alert('تعذر تجهيز ملف PDF: ' + (error?.message || ''))
      }
    }
  }

  const label =
    state === 'working'
      ? `جاري التجهيز ${progress}`
      : state === 'ready'
        ? '✅ جاهز — اضغط للمشاركة'
        : '📄 PDF'

  return (
    <button
      type="button"
      className={`pr-small-button pr-pdf${state === 'ready' ? ' ready' : ''}`}
      disabled={state === 'working' || !images?.length}
      onClick={handleClick}
      title="مشاركة كل صور الفاتورة كملف PDF"
    >
      {label}
    </button>
  )
}
