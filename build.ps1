# jsdb.js を生成するスクリプト

$files = @(
    "src/utils/helpers.js",
    "src/storage/IndexedDBManager.js",
    "src/core/Tokenizer.js",
    "src/core/Parser.js",
    "src/core/Executor.js",
    "src/core/JSDB.js"
)

$content = ""
foreach ($file in $files) {
    $content += Get-Content -Path $file -Encoding UTF8 -Raw
}

# グローバルスコープへのエクスポートを追加
$content += "`r`n`r`n// Export to global scope`r`n"
$content += "if (typeof window !== 'undefined') {`r`n"
$content += "    window.JSDB = JSDB;`r`n"
$content += "}`r`n"

# jsdb.js に書き込み（BOMなしUTF-8）
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$PWD\jsdb.js", $content, $utf8NoBom)

Write-Host "jsdb.js generated successfully (UTF-8 without BOM)"
