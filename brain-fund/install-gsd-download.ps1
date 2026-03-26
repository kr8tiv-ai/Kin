Write-Host "Downloading Get Shit Done v1.28.0..." -ForegroundColor Green

# Download the latest release
$url = "https://api.github.com/repos/gsd-build/get-shit-done/zipball/main"
$zipPath = "$env:TEMP\gsd-main.zip"
$extractPath = "$env:TEMP\gsd-extracted"

Write-Host "Downloading from GitHub..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $url -OutFile $zipPath -Headers @{"Accept"="application/vnd.github.v3+json"}

Write-Host "Extracting files..." -ForegroundColor Yellow
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

# Find the extracted directory (GitHub adds a hash to the folder name)
$gsdDir = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1

Write-Host "Running installer..." -ForegroundColor Yellow
Set-Location $gsdDir.FullName
node bin/install.js --claude --global

Write-Host ""
Write-Host "Cleaning up..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
Remove-Item -Path $zipPath -Force
Remove-Item -Path $extractPath -Recurse -Force

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "GSD has been installed to your global Claude Code directory (~/.claude/)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Try running: /gsd:help" -ForegroundColor Cyan
