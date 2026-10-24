$path = 'D:\Projects\customer-papers-app\src\App.jsx'
$backup = 'D:\Projects\customer-papers-app\src\App.jsx.before-paper-image-form-fix'

Copy-Item $path $backup -Force

$content = Get-Content $path -Raw

$pattern = '(?s)(\{showImageForm && \(\s*<form\s+className="image-form"\s+onSubmit=\{replaceImage\}\s*>).*?(\s*</form>\s*\)\})'

$replacement = @'
{showImageForm && (
  <form
    className="image-form"
    onSubmit={replaceImage}
  >
    <label className="paper-image-upload-label">
      صورة الورقة الجديدة
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) =>
          setNewImageFile(
            event.target.files?.[0] || null
          )
        }
        required
      />
    </label>

    {newImageFile && (
      <p className="selected-image-name">
        الصورة المختارة: {newImageFile.name}
      </p>
    )}

    <label>
      وصف الصورة
      <textarea
        value={newImageDescription}
        onChange={(event) =>
          setNewImageDescription(
            event.target.value
          )
        }
        rows="2"
        placeholder="مثال: تمت إضافة أسعار جديدة"
      />
    </label>

    <button type="submit" disabled={saving}>
      {saving
        ? 'جارٍ رفع الصورة...'
        : 'حفظ الصورة الجديدة'}
    </button>
  </form>
)}
'@

$updated = [regex]::Replace(
  $content,
  $pattern,
  $replacement,
  1
)

if ($updated -eq $content) {
  throw 'لم يتم العثور على كتلة استبدال الصورة. لم يتم تغيير الملف.'
}

$updated = $updated -replace '(?m)^\s*const cameraInputRef = useRef\(null\)\r?\n\s*const fileInputRef = useRef\(null\)\r?\n(?=\s*const \[showImageForm)', ''

Set-Content -Path $path -Value $updated -Encoding utf8

Write-Host 'تم الإصلاح بنجاح.'
Write-Host "تم إنشاء نسخة احتياطية: $backup"
