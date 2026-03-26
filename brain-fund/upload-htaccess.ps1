# Upload .htaccess file
$ftpServer = "31.170.161.141"
$ftpUser = "u637913108.pinkyandthebrain.fun"
$ftpPass = "Snu2I+6O:pJdDr4*"

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
$uri = New-Object System.Uri("ftp://$ftpServer/public_html/.htaccess")

try {
    $webclient.UploadFile($uri, ".\frontend\out\.htaccess")
    Write-Host "Uploaded .htaccess successfully!" -ForegroundColor Green
} catch {
    Write-Host "Failed to upload .htaccess: $_" -ForegroundColor Red
}
