<#
.SYNOPSIS
    Astra Downloader Installer — one-click setup for the Astra Deck download server
.DESCRIPTION
    Downloads yt-dlp + ffmpeg, creates config, desktop shortcut, and startup task.
    After install, launches Astra Downloader.
.NOTES
    Author: SysAdminDoc
    Version: 1.0.0
#>

#Requires -Version 5.1

# Self-elevate
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# Hide console
Add-Type -Name Window -Namespace Console -MemberDefinition '
[DllImport("Kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, Int32 nCmdShow);
'
[Console.Window]::ShowWindow([Console.Window]::GetConsoleWindow(), 0) | Out-Null

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression.FileSystem

$installPath = "$env:LOCALAPPDATA\AstraDownloader"
$ytDlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
$ffmpegUrl = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$serverExeUrl = "https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/AstraDownloader.exe"
$serverIcoUrl = "https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/AstraDownloader.ico"
$defaultDlPath = "$env:USERPROFILE\Videos\YouTube"

# Progress dialog
$result = [System.Windows.MessageBox]::Show(
    "Install Astra Downloader?`n`nThis will set up the download server for Astra Deck with yt-dlp and ffmpeg.`n`nInstall location: $installPath",
    "Astra Downloader Setup",
    "OKCancel",
    "Question"
)
if ($result -ne "OK") { exit }

try {
    # Create directories
    if (!(Test-Path $installPath)) { New-Item -ItemType Directory -Path $installPath -Force | Out-Null }
    if (!(Test-Path $defaultDlPath)) { New-Item -ItemType Directory -Path $defaultDlPath -Force | Out-Null }

    # Download yt-dlp
    $ytdlpPath = Join-Path $installPath "yt-dlp.exe"
    if (!(Test-Path $ytdlpPath)) {
        Invoke-WebRequest -Uri $ytDlpUrl -OutFile $ytdlpPath -UseBasicParsing
    }

    # Download ffmpeg
    $ffmpegPath = Join-Path $installPath "ffmpeg.exe"
    if (!(Test-Path $ffmpegPath)) {
        $ffmpegZip = Join-Path $installPath "ffmpeg.zip"
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing
        $zip = [System.IO.Compression.ZipFile]::OpenRead($ffmpegZip)
        $entry = $zip.Entries | Where-Object { $_.Name -eq "ffmpeg.exe" } | Select-Object -First 1
        if ($entry) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $ffmpegPath, $true) }
        $zip.Dispose()
        Remove-Item $ffmpegZip -Force -ErrorAction SilentlyContinue
    }

    # Download server exe + ico
    $exePath = Join-Path $installPath "AstraDownloader.exe"
    Invoke-WebRequest -Uri $serverExeUrl -OutFile $exePath -UseBasicParsing

    $icoPath = Join-Path $installPath "AstraDownloader.ico"
    Invoke-WebRequest -Uri $serverIcoUrl -OutFile $icoPath -UseBasicParsing

    # Create config
    $configPath = Join-Path $installPath "config.json"
    if (!(Test-Path $configPath)) {
        @{
            DownloadPath = $defaultDlPath
            AudioDownloadPath = ""
            YtDlpPath = $ytdlpPath
            FfmpegPath = $ffmpegPath
            ServerPort = 9751
            ServerToken = [guid]::NewGuid().ToString('N')
            EmbedMetadata = $true
            EmbedThumbnail = $true
            EmbedChapters = $true
            EmbedSubs = $false
            SubLangs = "en"
            SponsorBlock = $false
            SponsorBlockAction = "remove"
            ConcurrentFragments = 4
            DownloadArchive = $true
            AutoUpdateYtDlp = $true
            RateLimit = ""
            Proxy = ""
            StartMinimized = $false
            CloseToTray = $true
        } | ConvertTo-Json -Depth 3 | Set-Content $configPath -Encoding UTF8
    }

    # Desktop shortcut
    $WshShell = New-Object -ComObject WScript.Shell
    $shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Astra Downloader.lnk")
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $installPath
    $shortcut.IconLocation = $icoPath
    $shortcut.Description = "Astra Deck Download Server"
    $shortcut.Save()

    # Startup task (runs minimized to tray on login)
    $taskName = "AstraDownloader"
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName "MediaDL-Server" -Confirm:$false -ErrorAction SilentlyContinue
    } catch {}
    $action = New-ScheduledTaskAction -Execute $exePath -Argument "-Background" -WorkingDirectory $installPath
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 365)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Astra Deck download server" -Force | Out-Null

    # Register ytdl:// protocol
    $protocolRoot = "HKCU:\Software\Classes\ytdl"
    New-Item -Path "$protocolRoot\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path $protocolRoot -Name "(Default)" -Value "URL:YTDL Protocol"
    Set-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value ""
    Set-ItemProperty -Path "$protocolRoot\shell\open\command" -Name "(Default)" -Value "`"$exePath`" `"%1`""

    # Register mediadl:// protocol (for auto-start from extension)
    $mdlRoot = "HKCU:\Software\Classes\mediadl"
    New-Item -Path "$mdlRoot\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path $mdlRoot -Name "(Default)" -Value "URL:MediaDL Protocol"
    Set-ItemProperty -Path $mdlRoot -Name "URL Protocol" -Value ""
    Set-ItemProperty -Path "$mdlRoot\shell\open\command" -Name "(Default)" -Value "`"$exePath`" `"%1`""

    # Kill any old MediaDL server on port 9751
    try {
        Get-NetTCPConnection -LocalPort 9751 -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
            Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 300
    } catch {}

    # Launch server
    Start-Process -FilePath $exePath -WorkingDirectory $installPath

    [System.Windows.MessageBox]::Show(
        "Astra Downloader installed successfully!`n`n- Desktop shortcut created`n- Auto-starts on login`n- Server running on port 9751`n`nThe download server is now active in your system tray.",
        "Setup Complete",
        "OK",
        "Information"
    )

} catch {
    [System.Windows.MessageBox]::Show("Installation failed:`n`n$($_.Exception.Message)", "Error", "OK", "Error")
}
