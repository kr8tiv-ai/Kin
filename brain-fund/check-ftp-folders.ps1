# Check FTP folder structure
$ftpServer = "31.170.161.141"
$ftpUser = "u637913108.pinkyandthebrain.fun"
$ftpPass = "Snu2I+6O:pJdDr4*"

# Function to list FTP directories
function Get-FtpDirectories($path) {
    $webclient = New-Object System.Net.WebClient
    $webclient.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)

    try {
        $uri = New-Object System.Uri("ftp://$ftpServer$path/")
        $listing = $webclient.DownloadString($uri)
        return $listing -split "`n" | For { $_ -ne "" } } catch {
        Write-Host "Error accessing $path`: $_"
        return @()
    }
}

# Check root level
Write-Host "=== Root Level ===" -ForegroundColor Cyan
 Get-FtpDirectories("/"

# Check common folder names
$foldersToCheck = @("public_html", "public_ftp", "public_www", "public_htm", "www", "public", "art", "videos", "_next", "api", "_not-found")

foreach ($folder in $foldersToCheck) {
    $path = "/$folder"
    Write-Host "Checking $folder..." -ForegroundColor Yellow
    Get-FtpDirectories($path)
}

Write-Host ""
