param(
  [Parameter(Mandatory = $true)][string]$FileUrl,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Name = "paper"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$htmlFile = Join-Path $env:TEMP ("czx-" + [guid]::NewGuid().ToString("N") + ".html")
Invoke-WebRequest -Uri $FileUrl -UseBasicParsing -OutFile $htmlFile -TimeoutSec 60
$html = Get-Content -Path $htmlFile -Raw -Encoding UTF8
Remove-Item $htmlFile -Force

$m = [regex]::Match($html, 'href="(https://files\.zxxk\.com\?mkey=[^"]+)"')
if (-not $m.Success) {
  throw "没找到文件下载链接（可能仍在打包）。稍后重试，或直接用浏览器打开：$FileUrl"
}
$fileUrl = $m.Groups[1].Value

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$zip = Join-Path $OutDir ($Name + ".zip")
Invoke-WebRequest -Uri $fileUrl -OutFile $zip -UseBasicParsing -TimeoutSec 300
Expand-Archive -Path $zip -DestinationPath $OutDir -Force
Remove-Item $zip -Force

Get-ChildItem -Path $OutDir -Filter *.pdf -Recurse |
  ForEach-Object { "{0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB) }
