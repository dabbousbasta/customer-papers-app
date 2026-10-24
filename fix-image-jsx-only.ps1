$path = "D:\Projects\customer-papers-app\src\App.jsx"

$lines = Get-Content $path -Encoding UTF8

$startLine = 4092
$endLine = 4134

if ($lines.Count -lt $endLine) {
  throw "FILE_IS_SHORTER_THAN_EXPECTED"
}

$replacement = @(
'               <label className="paper-image-upload-label">',
'                 صورة الورقة الجديدة',
'                 <input',
'                   type="file"',
'                   accept="image/*"',
'                   capture="environment"',
'                   onChange={(event) =>',
'                     setNewImageFile(',
'                       event.target.files?.[0] || null',
'                     )',
'                   }',
'                   required',
'                 />',
'               </label>',
'',
'               {newImageFile && (',
'                 <p className="selected-image-name">',
'                   الصورة المختارة: {newImageFile.name}',
'                 </p>',
'               )}'
)

$before = $lines[0..($startLine - 2)]
$after = $lines[$endLine..($lines.Count - 1)]

$updated = @(
  $before +
  $replacement +
  $after
)

[System.IO.File]::WriteAllLines(
  $path,
  $updated,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "IMAGE_FORM_FIXED"