# Full FTP Upload Script for Pinky and the Brain website
$ftpServer = "31.170.161.141"
$ftpUser = "u637913108.pinkyandthebrain.fun"
$ftpPass = "Snu2I+6O:pJdDr4*"
$localPath = ".\frontend\out"
$remoteBasePath = "/public_html"

function Upload-FtpDirectory {
    param (
        [string]$localDir,
        [string]$remoteDir,
        [System.Net.WebClient]$webclient
    )

    # Create remote directory
    try {
        $request = [System.Net.FtpWebRequest]::Create("ftp://$ftpServer$remoteDir")
        $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $request.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
        $request.GetResponse() | Out-Null
        Write-Host "Created directory: $remoteDir" -ForegroundColor Cyan
    } catch {
        # Directory likely already exists
    }

    # Upload files in current directory
    $files = Get-ChildItem -Path $localDir -File
    foreach ($file in $files) {
        $remoteFilePath = "$remoteDir/$($file.Name)"
        $uri = New-Object System.Uri("ftp://$ftpServer$remoteFilePath")
        try {
            $webclient.UploadFile($uri, $file.FullName)
            Write-Host "Uploaded: $($file.Name)" -ForegroundColor Green
        } catch {
            Write-Host "Failed to upload $($file.Name): $_" -ForegroundColor Red
        }
    }

    # Recursively upload subdirectories
    $directories = Get-ChildItem -Path $localDir -Directory
    foreach ($dir in $directories) {
        $newRemoteDir = "$remoteDir/$($dir.Name)"
        Upload-FtpDirectory -localDir $dir.FullName -remoteDir $newRemoteDir -webclient $webclient
    }
}

Write-Host "Starting FTP upload to $ftpServer..." -ForegroundColor Yellow
$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)

Upload-FtpDirectory -localDir $localPath -remoteDir $remoteBasePath -webclient $webclient

Write-Host "`nUpload complete!" -ForegroundColor Green
