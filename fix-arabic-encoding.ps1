$path = "D:\Projects\customer-papers-app\src\App.jsx"
$backup = "D:\Projects\customer-papers-app\src\App.jsx.before-arabic-encoding-fix"

Copy-Item $path $backup -Force

$content = Get-Content $path -Raw -Encoding UTF8

$fixed = [System.Text.Encoding]::UTF8.GetString(
  [System.Text.Encoding]::GetEncoding(1252).GetBytes(
    $content
  )
)

[System.IO.File]::WriteAllText(
  $path,
  $fixed,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "تم إصلاح ترميز العربية بنجاح."
Write-Host "تم حفظ نسخة احتياطية هنا:"
Write-Host $backup