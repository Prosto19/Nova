$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot
$version = '24.22.3'
$filename = "node-v$version-win-x64.zip"
$expected = 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f'
$stage = Join-Path ([IO.Path]::GetTempPath()) ('nova-package-' + [guid]::NewGuid())
$package = Join-Path $stage 'NOVA'
$runtime = New-Item -Type Directory -Force (Join-Path $package 'runtime')
$zip = Join-Path $stage $filename
Invoke-WebRequest "https://nodejs.org/dist/v$version/$filename" -OutFile $zip -UseBasicParsing
if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $expected) {throw 'Unexpected Node.js checksum'}
Expand-Archive $zip (Join-Path $stage 'node')
$nodeDir = Join-Path $stage "node/node-v$version-win-x64"
Copy-Item (Join-Path $nodeDir 'node.exe'),(Join-Path $nodeDir 'LICENSE') $runtime
foreach ($name in @('backend','public','server.mjs','package.json','README.md','.env.example')) {
  Copy-Item -LiteralPath (Join-Path $project $name) -Destination $package -Recurse
}
Copy-Item -LiteralPath (Join-Path $project 'scripts/Start-NOVA.cmd') -Destination $package
Copy-Item -LiteralPath (Join-Path $project 'scripts/launch-portable.mjs') -Destination (Join-Path $package 'launch.mjs')
Copy-Item -LiteralPath (Join-Path $project 'docs/NOVA-guide.pdf') -Destination (Join-Path $package 'GUIDE.pdf')
$release = New-Item -Type Directory -Force (Join-Path $project 'release')
$output = Join-Path $release 'NOVA-Windows-x64.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tempZip = Join-Path $stage 'portable.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($package,$tempZip)
Copy-Item -LiteralPath $tempZip -Destination $output -Force
Write-Output $output
