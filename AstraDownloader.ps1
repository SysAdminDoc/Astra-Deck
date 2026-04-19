# AstraDownloader.ps1 — Desktop GUI + HTTP API server for Astra Deck
# Runs HTTP server on 127.0.0.1:9751 in a background runspace
# WPF GUI with system tray, dashboard, downloads, history, settings
#
# Usage:
#   AstraDownloader.ps1            — Launch GUI (or restore from tray)
#   AstraDownloader.ps1 -Background — Start minimized to tray (startup mode)

param([switch]$Background)

$ErrorActionPreference = 'Continue'

# ── Single instance guard ──
$mutexName = 'Global\AstraDownloader-Mutex'
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $mutex.WaitOne(0, $false)) {
    # Already running — try to show existing window via named pipe
    try {
        $pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'AstraDownloader-Show', [System.IO.Pipes.PipeDirection]::Out)
        $pipe.Connect(500)
        $pipe.WriteByte(1)
        $pipe.Close()
    } catch {}
    exit
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Paths ──
$script:InstallPath = $PSScriptRoot
$script:ConfigPath = Join-Path $PSScriptRoot "config.json"
$script:HistoryPath = Join-Path $PSScriptRoot "history.json"
$script:ArchivePath = Join-Path $PSScriptRoot "archive.txt"
$script:LogPath = Join-Path $PSScriptRoot "server.log"

# ── Config ──
if (!(Test-Path $script:ConfigPath)) { Write-Host "FATAL: config.json not found"; exit 1 }
$script:Config = Get-Content $script:ConfigPath -Raw | ConvertFrom-Json

$configDefaults = @{
    DownloadPath = "$env:USERPROFILE\Videos\YouTube"
    AudioDownloadPath = ""
    YtDlpPath = (Join-Path $PSScriptRoot "yt-dlp.exe")
    FfmpegPath = (Join-Path $PSScriptRoot "ffmpeg.exe")
    ServerPort = 9751
    ServerToken = ""
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
}
foreach ($key in $configDefaults.Keys) {
    if (-not ($script:Config.PSObject.Properties.Name -contains $key)) {
        $script:Config | Add-Member -NotePropertyName $key -NotePropertyValue $configDefaults[$key] -Force
    }
}
if (-not $script:Config.ServerToken) {
    $script:Config.ServerToken = [guid]::NewGuid().ToString('N')
}
$script:Config | ConvertTo-Json -Depth 3 | Set-Content $script:ConfigPath -Encoding UTF8

function Save-Config {
    $script:Config | ConvertTo-Json -Depth 3 | Set-Content $script:ConfigPath -Encoding UTF8
}

# ── Logging ──
function Write-Log {
    param([string]$msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    try { $line | Out-File $script:LogPath -Append -Encoding utf8 -ErrorAction SilentlyContinue } catch {}
}
if ((Test-Path $script:LogPath) -and (Get-Item $script:LogPath -ErrorAction SilentlyContinue).Length -gt 1MB) {
    try { (Get-Content $script:LogPath -Tail 200) | Set-Content $script:LogPath -Encoding utf8 } catch {}
}

# ── History ──
if (!(Test-Path $script:HistoryPath)) { "[]" | Set-Content $script:HistoryPath -Encoding UTF8 }

# ── Server State (shared with runspace) ──
$script:ServerState = [hashtable]::Synchronized(@{
    Running = $false
    Downloads = [hashtable]::Synchronized(@{})
    NextId = 0
    TotalCompleted = 0
    TotalBytes = 0
    StartTime = $null
    ShouldStop = $false
    Port = $script:Config.ServerPort
    Token = $script:Config.ServerToken
    Config = $script:Config
    ConfigPath = $script:ConfigPath
    HistoryPath = $script:HistoryPath
    ArchivePath = $script:ArchivePath
    LogPath = $script:LogPath
    InstallPath = $script:InstallPath
})

# ══════════════════════════════════════════════════════════════
# WPF XAML
# ══════════════════════════════════════════════════════════════

$xamlString = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Astra Downloader" Width="780" Height="560" MinWidth="640" MinHeight="480"
        WindowStartupLocation="CenterScreen" Background="#0a0e14"
        ResizeMode="CanResize">
    <Window.Resources>
        <SolidColorBrush x:Key="BgBase" Color="#0a0e14"/>
        <SolidColorBrush x:Key="BgSidebar" Color="#0d1117"/>
        <SolidColorBrush x:Key="BgCard" Color="#151b23"/>
        <SolidColorBrush x:Key="BgInput" Color="#1a2028"/>
        <SolidColorBrush x:Key="Border" Color="#2a3140"/>
        <SolidColorBrush x:Key="TextPrimary" Color="#e6edf3"/>
        <SolidColorBrush x:Key="TextSecondary" Color="#8b949e"/>
        <SolidColorBrush x:Key="TextMuted" Color="#525a65"/>
        <SolidColorBrush x:Key="AccentGreen" Color="#22c55e"/>
        <SolidColorBrush x:Key="AccentOrange" Color="#f97316"/>
        <SolidColorBrush x:Key="AccentRed" Color="#ef4444"/>
        <SolidColorBrush x:Key="AccentBlue" Color="#3b82f6"/>

        <Style x:Key="NavBtn" TargetType="Button">
            <Setter Property="Background" Value="Transparent"/>
            <Setter Property="Foreground" Value="{StaticResource TextSecondary}"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Padding" Value="16,10"/>
            <Setter Property="HorizontalContentAlignment" Value="Left"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="bd" Background="{TemplateBinding Background}" CornerRadius="8" Padding="{TemplateBinding Padding}" Margin="4,1">
                            <ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="bd" Property="Background" Value="#1a2028"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <Style x:Key="ActionBtn" TargetType="Button">
            <Setter Property="Background" Value="{StaticResource AccentGreen}"/>
            <Setter Property="Foreground" Value="#0a0a0a"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Padding" Value="18,9"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="FontWeight" Value="Bold"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="bd" Background="{TemplateBinding Background}" CornerRadius="8" Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="bd" Property="Background" Value="#16a34a"/>
                            </Trigger>
                            <Trigger Property="IsEnabled" Value="False">
                                <Setter TargetName="bd" Property="Opacity" Value="0.5"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <Style x:Key="SecBtn" TargetType="Button">
            <Setter Property="Background" Value="#1a2028"/>
            <Setter Property="Foreground" Value="{StaticResource TextSecondary}"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="BorderBrush" Value="{StaticResource Border}"/>
            <Setter Property="Padding" Value="14,8"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="bd" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="8" Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="bd" Property="Background" Value="#222a35"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <Style TargetType="TextBox">
            <Setter Property="Background" Value="{StaticResource BgInput}"/>
            <Setter Property="Foreground" Value="{StaticResource TextPrimary}"/>
            <Setter Property="BorderBrush" Value="{StaticResource Border}"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="8,6"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="CaretBrush" Value="{StaticResource TextPrimary}"/>
        </Style>

        <Style TargetType="CheckBox">
            <Setter Property="Foreground" Value="{StaticResource TextSecondary}"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Margin" Value="0,4"/>
        </Style>
    </Window.Resources>

    <Grid>
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="180"/>
            <ColumnDefinition Width="*"/>
        </Grid.ColumnDefinitions>

        <!-- Sidebar -->
        <Border Grid.Column="0" Background="{StaticResource BgSidebar}" BorderBrush="{StaticResource Border}" BorderThickness="0,0,1,0">
            <Grid>
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="*"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>

                <!-- Logo -->
                <StackPanel Grid.Row="0" Margin="16,20,16,24">
                    <TextBlock Text="Astra Downloader" FontSize="18" FontWeight="Bold" Foreground="{StaticResource TextPrimary}"/>
                    <TextBlock x:Name="lblVersion" Text="v1.0.0" FontSize="10" Foreground="{StaticResource TextMuted}" Margin="0,2,0,0"/>
                </StackPanel>

                <!-- Nav -->
                <StackPanel Grid.Row="1">
                    <Button x:Name="navDashboard" Content="Dashboard" Style="{StaticResource NavBtn}"/>
                    <Button x:Name="navDownloads" Content="Downloads" Style="{StaticResource NavBtn}"/>
                    <Button x:Name="navHistory" Content="History" Style="{StaticResource NavBtn}"/>
                    <Button x:Name="navSettings" Content="Settings" Style="{StaticResource NavBtn}"/>
                </StackPanel>

                <!-- Status dot -->
                <StackPanel Grid.Row="2" Orientation="Horizontal" Margin="16,0,16,16">
                    <Ellipse x:Name="statusDot" Width="8" Height="8" Fill="#525a65" Margin="0,0,8,0"/>
                    <TextBlock x:Name="statusLabel" Text="Stopped" FontSize="11" Foreground="{StaticResource TextMuted}"/>
                </StackPanel>
            </Grid>
        </Border>

        <!-- Content area -->
        <TabControl x:Name="tabContent" Grid.Column="1" BorderThickness="0" Background="Transparent" Padding="0">
            <TabControl.ItemContainerStyle>
                <Style TargetType="TabItem"><Setter Property="Visibility" Value="Collapsed"/></Style>
            </TabControl.ItemContainerStyle>

            <!-- Dashboard -->
            <TabItem>
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="24,20">
                    <StackPanel>
                        <TextBlock Text="Dashboard" FontSize="22" FontWeight="Bold" Foreground="{StaticResource TextPrimary}" Margin="0,0,0,20"/>

                        <!-- Server control card -->
                        <Border Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="12" Padding="20" Margin="0,0,0,16">
                            <Grid>
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="*"/>
                                    <ColumnDefinition Width="Auto"/>
                                </Grid.ColumnDefinitions>
                                <StackPanel>
                                    <TextBlock x:Name="dashStatus" Text="Server Stopped" FontSize="16" FontWeight="SemiBold" Foreground="{StaticResource TextPrimary}"/>
                                    <TextBlock x:Name="dashEndpoint" Text="http://127.0.0.1:9751" FontSize="11" Foreground="{StaticResource TextMuted}" Margin="0,4,0,0"/>
                                </StackPanel>
                                <StackPanel Grid.Column="1" Orientation="Horizontal">
                                    <Button x:Name="btnStartStop" Content="Start Server" Style="{StaticResource ActionBtn}" Margin="0,0,8,0"/>
                                    <Button x:Name="btnOpenFolder" Content="Open Folder" Style="{StaticResource SecBtn}"/>
                                </StackPanel>
                            </Grid>
                        </Border>

                        <!-- Stats row -->
                        <Grid Margin="0,0,0,16">
                            <Grid.ColumnDefinitions>
                                <ColumnDefinition Width="*"/>
                                <ColumnDefinition Width="12"/>
                                <ColumnDefinition Width="*"/>
                                <ColumnDefinition Width="12"/>
                                <ColumnDefinition Width="*"/>
                                <ColumnDefinition Width="12"/>
                                <ColumnDefinition Width="*"/>
                            </Grid.ColumnDefinitions>
                            <Border Grid.Column="0" Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16,12">
                                <StackPanel><TextBlock Text="Active" FontSize="10" Foreground="{StaticResource TextMuted}" FontWeight="SemiBold" TextAlignment="Center"/>
                                <TextBlock x:Name="statActive" Text="0" FontSize="24" FontWeight="Bold" Foreground="{StaticResource AccentGreen}" TextAlignment="Center"/></StackPanel>
                            </Border>
                            <Border Grid.Column="2" Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16,12">
                                <StackPanel><TextBlock Text="Completed" FontSize="10" Foreground="{StaticResource TextMuted}" FontWeight="SemiBold" TextAlignment="Center"/>
                                <TextBlock x:Name="statCompleted" Text="0" FontSize="24" FontWeight="Bold" Foreground="{StaticResource TextPrimary}" TextAlignment="Center"/></StackPanel>
                            </Border>
                            <Border Grid.Column="4" Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16,12">
                                <StackPanel><TextBlock Text="Uptime" FontSize="10" Foreground="{StaticResource TextMuted}" FontWeight="SemiBold" TextAlignment="Center"/>
                                <TextBlock x:Name="statUptime" Text="--" FontSize="24" FontWeight="Bold" Foreground="{StaticResource TextPrimary}" TextAlignment="Center"/></StackPanel>
                            </Border>
                            <Border Grid.Column="6" Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16,12">
                                <StackPanel><TextBlock Text="Port" FontSize="10" Foreground="{StaticResource TextMuted}" FontWeight="SemiBold" TextAlignment="Center"/>
                                <TextBlock x:Name="statPort" Text="9751" FontSize="24" FontWeight="Bold" Foreground="{StaticResource TextPrimary}" TextAlignment="Center"/></StackPanel>
                            </Border>
                        </Grid>

                        <!-- Log -->
                        <TextBlock Text="Server Log" FontSize="12" Foreground="{StaticResource TextMuted}" FontWeight="SemiBold" Margin="0,0,0,6"/>
                        <Border Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="12" MaxHeight="200">
                            <ScrollViewer x:Name="logScroll" VerticalScrollBarVisibility="Auto">
                                <TextBlock x:Name="logText" Text="Ready." Foreground="{StaticResource TextMuted}" FontFamily="Cascadia Code, Consolas" FontSize="11" TextWrapping="Wrap"/>
                            </ScrollViewer>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- Downloads -->
            <TabItem>
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="24,20">
                    <StackPanel>
                        <TextBlock Text="Active Downloads" FontSize="22" FontWeight="Bold" Foreground="{StaticResource TextPrimary}" Margin="0,0,0,16"/>
                        <StackPanel x:Name="downloadsList">
                            <TextBlock x:Name="noDownloads" Text="No active downloads." FontSize="13" Foreground="{StaticResource TextMuted}"/>
                        </StackPanel>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- History -->
            <TabItem>
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="24,20">
                    <StackPanel>
                        <Grid Margin="0,0,0,16">
                            <Grid.ColumnDefinitions>
                                <ColumnDefinition Width="*"/>
                                <ColumnDefinition Width="Auto"/>
                            </Grid.ColumnDefinitions>
                            <TextBlock Text="Download History" FontSize="22" FontWeight="Bold" Foreground="{StaticResource TextPrimary}"/>
                            <Button x:Name="btnClearHistory" Content="Clear History" Style="{StaticResource SecBtn}" Grid.Column="1"/>
                        </Grid>
                        <StackPanel x:Name="historyList">
                            <TextBlock x:Name="noHistory" Text="No downloads yet." FontSize="13" Foreground="{StaticResource TextMuted}"/>
                        </StackPanel>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- Settings -->
            <TabItem>
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="24,20">
                    <StackPanel MaxWidth="560">
                        <TextBlock Text="Settings" FontSize="22" FontWeight="Bold" Foreground="{StaticResource TextPrimary}" Margin="0,0,0,20"/>

                        <!-- Paths -->
                        <TextBlock Text="PATHS" FontSize="10" FontWeight="Bold" Foreground="{StaticResource TextMuted}" Margin="0,0,0,8" LetterSpacing="0.5"/>
                        <Border Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,16">
                            <StackPanel>
                                <TextBlock Text="Video Download Folder" FontSize="11" Foreground="{StaticResource TextSecondary}" Margin="0,0,0,4"/>
                                <Grid Margin="0,0,0,12"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
                                    <TextBox x:Name="cfgDownloadPath" Grid.Column="0"/>
                                    <Button x:Name="btnBrowseDl" Content="..." Style="{StaticResource SecBtn}" Grid.Column="1" Margin="6,0,0,0" Padding="10,6" Width="36"/>
                                </Grid>
                                <TextBlock Text="Audio Download Folder (blank = same as video)" FontSize="11" Foreground="{StaticResource TextSecondary}" Margin="0,0,0,4"/>
                                <Grid Margin="0,0,0,0"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
                                    <TextBox x:Name="cfgAudioPath" Grid.Column="0"/>
                                    <Button x:Name="btnBrowseAudio" Content="..." Style="{StaticResource SecBtn}" Grid.Column="1" Margin="6,0,0,0" Padding="10,6" Width="36"/>
                                </Grid>
                            </StackPanel>
                        </Border>

                        <!-- Embedding -->
                        <TextBlock Text="POST-PROCESSING" FontSize="10" FontWeight="Bold" Foreground="{StaticResource TextMuted}" Margin="0,0,0,8"/>
                        <Border Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,16">
                            <StackPanel>
                                <CheckBox x:Name="cfgEmbedMetadata" Content="Embed metadata (title, artist, date)"/>
                                <CheckBox x:Name="cfgEmbedThumbnail" Content="Embed thumbnail as cover art"/>
                                <CheckBox x:Name="cfgEmbedChapters" Content="Embed chapter markers"/>
                                <CheckBox x:Name="cfgEmbedSubs" Content="Embed subtitles"/>
                                <StackPanel Orientation="Horizontal" Margin="20,4,0,0">
                                    <TextBlock Text="Languages:" FontSize="11" Foreground="{StaticResource TextMuted}" VerticalAlignment="Center" Margin="0,0,6,0"/>
                                    <TextBox x:Name="cfgSubLangs" Width="120" FontSize="11"/>
                                </StackPanel>
                                <CheckBox x:Name="cfgSponsorBlock" Content="SponsorBlock (remove sponsored segments)"/>
                            </StackPanel>
                        </Border>

                        <!-- Performance -->
                        <TextBlock Text="PERFORMANCE" FontSize="10" FontWeight="Bold" Foreground="{StaticResource TextMuted}" Margin="0,0,0,8"/>
                        <Border Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,16">
                            <StackPanel>
                                <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                                    <TextBlock Text="Concurrent fragments:" FontSize="12" Foreground="{StaticResource TextSecondary}" VerticalAlignment="Center" Margin="0,0,8,0"/>
                                    <TextBox x:Name="cfgFragments" Width="50" FontSize="12"/>
                                </StackPanel>
                                <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                                    <TextBlock Text="Rate limit (e.g. 500K, 2M, blank=unlimited):" FontSize="12" Foreground="{StaticResource TextSecondary}" VerticalAlignment="Center" Margin="0,0,8,0"/>
                                    <TextBox x:Name="cfgRateLimit" Width="80" FontSize="12"/>
                                </StackPanel>
                                <StackPanel Orientation="Horizontal" Margin="0,0,0,0">
                                    <TextBlock Text="Proxy (e.g. socks5://host:port, blank=none):" FontSize="12" Foreground="{StaticResource TextSecondary}" VerticalAlignment="Center" Margin="0,0,8,0"/>
                                    <TextBox x:Name="cfgProxy" Width="200" FontSize="12"/>
                                </StackPanel>
                            </StackPanel>
                        </Border>

                        <!-- Behavior -->
                        <TextBlock Text="BEHAVIOR" FontSize="10" FontWeight="Bold" Foreground="{StaticResource TextMuted}" Margin="0,0,0,8"/>
                        <Border Background="{StaticResource BgCard}" BorderBrush="{StaticResource Border}" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,16">
                            <StackPanel>
                                <CheckBox x:Name="cfgAutoUpdate" Content="Auto-update yt-dlp on server start"/>
                                <CheckBox x:Name="cfgArchive" Content="Skip already-downloaded videos (archive.txt)"/>
                                <CheckBox x:Name="cfgCloseToTray" Content="Close to system tray instead of quitting"/>
                                <CheckBox x:Name="cfgStartMinimized" Content="Start minimized to tray"/>
                            </StackPanel>
                        </Border>

                        <Button x:Name="btnSaveSettings" Content="Save Settings" Style="{StaticResource ActionBtn}" HorizontalAlignment="Left" Margin="0,0,0,24"/>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>
        </TabControl>
    </Grid>
</Window>
"@

# ══════════════════════════════════════════════════════════════
# LOAD WINDOW
# ══════════════════════════════════════════════════════════════
$xaml = [xml]$xamlString
$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

# ── Controls ──
$tabContent = $window.FindName("tabContent")
$navDashboard = $window.FindName("navDashboard")
$navDownloads = $window.FindName("navDownloads")
$navHistory = $window.FindName("navHistory")
$navSettings = $window.FindName("navSettings")
$statusDot = $window.FindName("statusDot")
$statusLabel = $window.FindName("statusLabel")

$dashStatus = $window.FindName("dashStatus")
$dashEndpoint = $window.FindName("dashEndpoint")
$btnStartStop = $window.FindName("btnStartStop")
$btnOpenFolder = $window.FindName("btnOpenFolder")
$statActive = $window.FindName("statActive")
$statCompleted = $window.FindName("statCompleted")
$statUptime = $window.FindName("statUptime")
$statPort = $window.FindName("statPort")
$logText = $window.FindName("logText")
$logScroll = $window.FindName("logScroll")

$downloadsList = $window.FindName("downloadsList")
$noDownloads = $window.FindName("noDownloads")
$historyList = $window.FindName("historyList")
$noHistory = $window.FindName("noHistory")
$btnClearHistory = $window.FindName("btnClearHistory")

# Settings controls
$cfgDownloadPath = $window.FindName("cfgDownloadPath")
$cfgAudioPath = $window.FindName("cfgAudioPath")
$btnBrowseDl = $window.FindName("btnBrowseDl")
$btnBrowseAudio = $window.FindName("btnBrowseAudio")
$cfgEmbedMetadata = $window.FindName("cfgEmbedMetadata")
$cfgEmbedThumbnail = $window.FindName("cfgEmbedThumbnail")
$cfgEmbedChapters = $window.FindName("cfgEmbedChapters")
$cfgEmbedSubs = $window.FindName("cfgEmbedSubs")
$cfgSubLangs = $window.FindName("cfgSubLangs")
$cfgSponsorBlock = $window.FindName("cfgSponsorBlock")
$cfgFragments = $window.FindName("cfgFragments")
$cfgRateLimit = $window.FindName("cfgRateLimit")
$cfgProxy = $window.FindName("cfgProxy")
$cfgAutoUpdate = $window.FindName("cfgAutoUpdate")
$cfgArchive = $window.FindName("cfgArchive")
$cfgCloseToTray = $window.FindName("cfgCloseToTray")
$cfgStartMinimized = $window.FindName("cfgStartMinimized")
$btnSaveSettings = $window.FindName("btnSaveSettings")

$statPort.Text = "$($script:Config.ServerPort)"
$dashEndpoint.Text = "http://127.0.0.1:$($script:Config.ServerPort)"

# ── Load settings into UI ──
function Load-SettingsUI {
    $c = $script:Config
    $cfgDownloadPath.Text = "$($c.DownloadPath)"
    $cfgAudioPath.Text = "$($c.AudioDownloadPath)"
    $cfgEmbedMetadata.IsChecked = $c.EmbedMetadata -eq $true
    $cfgEmbedThumbnail.IsChecked = $c.EmbedThumbnail -eq $true
    $cfgEmbedChapters.IsChecked = $c.EmbedChapters -eq $true
    $cfgEmbedSubs.IsChecked = $c.EmbedSubs -eq $true
    $cfgSubLangs.Text = "$($c.SubLangs)"
    $cfgSponsorBlock.IsChecked = $c.SponsorBlock -eq $true
    $cfgFragments.Text = "$($c.ConcurrentFragments)"
    $cfgRateLimit.Text = "$($c.RateLimit)"
    $cfgProxy.Text = "$($c.Proxy)"
    $cfgAutoUpdate.IsChecked = $c.AutoUpdateYtDlp -eq $true
    $cfgArchive.IsChecked = $c.DownloadArchive -eq $true
    $cfgCloseToTray.IsChecked = $c.CloseToTray -eq $true
    $cfgStartMinimized.IsChecked = $c.StartMinimized -eq $true
}
Load-SettingsUI

# ── Nav active state ──
$script:ActiveNav = $null
function Set-ActiveNav($btn, $index) {
    if ($script:ActiveNav) {
        $script:ActiveNav.Foreground = [System.Windows.Media.Brushes]::Gray
        $script:ActiveNav.FontWeight = "SemiBold"
    }
    $btn.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString("#22c55e")
    $btn.FontWeight = "Bold"
    $script:ActiveNav = $btn
    $tabContent.SelectedIndex = $index
}
$navDashboard.Add_Click({ Set-ActiveNav $navDashboard 0 })
$navDownloads.Add_Click({ Set-ActiveNav $navDownloads 1 })
$navHistory.Add_Click({ Set-ActiveNav $navHistory 2; Refresh-History })
$navSettings.Add_Click({ Set-ActiveNav $navSettings 3 })
Set-ActiveNav $navDashboard 0

# ══════════════════════════════════════════════════════════════
# SYSTEM TRAY
# ══════════════════════════════════════════════════════════════
$trayIcon = New-Object System.Windows.Forms.NotifyIcon
$trayIcon.Text = "Astra Downloader"
$trayIcon.Visible = $true

# Load icon from file, fallback to generated glyph
$icoPath = Join-Path $PSScriptRoot "AstraDownloader.ico"
if (Test-Path $icoPath) {
    $trayIcon.Icon = New-Object System.Drawing.Icon($icoPath, 32, 32)
} else {
    $bmp = New-Object System.Drawing.Bitmap(16,16)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.FillEllipse([System.Drawing.Brushes]::LimeGreen, 2, 2, 12, 12)
    $g.Dispose()
    $trayIcon.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

# Tray context menu
$trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$trayShow = $trayMenu.Items.Add("Show Astra Downloader")
$trayStartStop = $trayMenu.Items.Add("Start Server")
$trayMenu.Items.Add("-")
$trayExit = $trayMenu.Items.Add("Exit")
$trayIcon.ContextMenuStrip = $trayMenu

$trayIcon.Add_DoubleClick({
    $window.Show()
    $window.WindowState = [System.Windows.WindowState]::Normal
    $window.Activate()
})
$trayShow.Add_Click({
    $window.Show()
    $window.WindowState = [System.Windows.WindowState]::Normal
    $window.Activate()
})
$trayExit.Add_Click({
    $script:ForceExit = $true
    $window.Close()
})

# ── Window minimize/close behavior ──
$script:ForceExit = $false

$window.Add_StateChanged({
    if ($window.WindowState -eq [System.Windows.WindowState]::Minimized) {
        $window.Hide()
    }
})

$window.Add_Closing({
    param($s, $e)
    if (-not $script:ForceExit -and $script:Config.CloseToTray -eq $true) {
        $e.Cancel = $true
        $window.Hide()
    }
})

# ══════════════════════════════════════════════════════════════
# HTTP SERVER (background runspace)
# ══════════════════════════════════════════════════════════════
$script:ServerRunspace = $null
$script:ServerPipeline = $null

function Start-Server {
    if ($script:ServerState.Running) { return }

    # Reload config into shared state
    $script:ServerState.Config = $script:Config
    $script:ServerState.ShouldStop = $false
    $script:ServerState.StartTime = Get-Date

    $rs = [runspacefactory]::CreateRunspace()
    $rs.ApartmentState = "MTA"
    $rs.Open()
    $rs.SessionStateProxy.SetVariable('state', $script:ServerState)

    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    $ps.AddScript({
        $ErrorActionPreference = 'Continue'
        $PORT = $state.Port
        $MAX_CONCURRENT = 3
        $config = $state.Config

        function Write-SLog { param([string]$msg); $state.Log += "$(Get-Date -Format 'HH:mm:ss') $msg`n" }

        function Read-FileTail {
            param([string]$Path, [int]$Bytes = 4096)
            try {
                $fs = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
                try {
                    $len = $fs.Length; if ($len -eq 0) { return "" }
                    $start = [Math]::Max(0, $len - $Bytes)
                    $fs.Seek($start, 'Begin') | Out-Null
                    $buf = New-Object byte[] ([Math]::Min($Bytes, $len))
                    $read = $fs.Read($buf, 0, $buf.Length)
                    return [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
                } finally { $fs.Close() }
            } catch { return "" }
        }

        function Save-HistoryEntry {
            param([hashtable]$entry)
            try {
                $history = @()
                if (Test-Path $state.HistoryPath) {
                    $raw = Get-Content $state.HistoryPath -Raw -ErrorAction SilentlyContinue
                    if ($raw) { $history = @($raw | ConvertFrom-Json) }
                }
                $history += [PSCustomObject]$entry
                if ($history.Count -gt 500) { $history = $history[-500..-1] }
                $history | ConvertTo-Json -Depth 3 -Compress | Set-Content $state.HistoryPath -Encoding UTF8
            } catch {}
        }

        function Start-Download {
            param($params)
            $state.NextId++
            $id = "dl_$($state.NextId)_$([guid]::NewGuid().ToString('N').Substring(0,6))"
            $progressFile = Join-Path $env:TEMP "mdl_progress_$id.txt"
            "" | Set-Content $progressFile -Force

            $url = $params.url; $title = $params.title
            $audioOnly = $params.audioOnly -eq $true
            $referer = $params.referer
            $isDirect = $url -match "fbcdn\.net|\.mp4\?|\.webm\?"

            $allowedVF = @('mp4','mkv','webm'); $allowedAF = @('mp3','m4a','opus','flac','wav')
            $allowedQ = @('best','2160','1440','1080','720','480')
            $reqFmt = if ($params.format) { $params.format.ToLower() } else { $null }
            $reqQ = if ($params.quality) { $params.quality.ToLower() } else { 'best' }
            $format = if ($audioOnly) { if ($reqFmt -and $allowedAF -contains $reqFmt) { $reqFmt } else { 'mp3' } } else { if ($reqFmt -and $allowedVF -contains $reqFmt) { $reqFmt } else { 'mp4' } }
            $quality = if ($allowedQ -contains $reqQ) { $reqQ } else { 'best' }

            $outDir = $config.DownloadPath
            if ($audioOnly -and $config.AudioDownloadPath) { $outDir = $config.AudioDownloadPath }
            if ($params.outputDir) {
                $rd = "$($params.outputDir)".Trim()
                if ($rd -match '^[A-Za-z]:\\' -and $rd -notmatch '\.\.' -and $rd.Length -le 260) {
                    if (!(Test-Path $rd)) { try { New-Item -ItemType Directory -Path $rd -Force | Out-Null } catch {} }
                    if (Test-Path $rd) { $outDir = $rd }
                }
            }

            $ffLoc = Split-Path $config.FfmpegPath -Parent
            $isPlaylist = $url -match '[?&]list=' -and $url -notmatch '[?&]v='
            if ($isPlaylist) { $outTpl = Join-Path $outDir "%(playlist_title)s/%(title)s.$format" }
            else { $outTpl = Join-Path $outDir "%(title)s.$format" }

            $fmtSel = if ($quality -eq 'best') { "bestvideo+bestaudio/best" } else { "bestvideo[height<=$quality]+bestaudio/best[height<=$quality]/best" }

            $args = @('--newline','--progress','--no-colors','--ffmpeg-location',$ffLoc,'-o',$outTpl)
            $args += '--progress-template'; $args += 'download:MDLP %(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s'
            $frags = if ($config.ConcurrentFragments -gt 0) { $config.ConcurrentFragments } else { 4 }
            $args += '--concurrent-fragments'; $args += "$frags"
            if ($config.EmbedMetadata -eq $true) { $args += '--embed-metadata' }
            if ($config.EmbedThumbnail -eq $true) { $args += '--embed-thumbnail' }
            if ($config.EmbedChapters -eq $true) { $args += '--embed-chapters' }
            if ($config.EmbedSubs -eq $true) { $args += '--embed-subs'; $args += '--write-subs'; $args += '--write-auto-subs'; $args += '--sub-langs'; $args += ($config.SubLangs -replace '[^a-zA-Z0-9,\-]','') }
            if ($config.SponsorBlock -eq $true) { $action = if ($config.SponsorBlockAction -eq 'mark') {'mark'} else {'remove'}; $args += "--sponsorblock-$action"; $args += 'all' }
            if ($config.DownloadArchive -eq $true) { $args += '--download-archive'; $args += $state.ArchivePath }
            if ($config.RateLimit -and $config.RateLimit -match '^\d+[KMG]?$') { $args += '--limit-rate'; $args += $config.RateLimit }
            if ($config.Proxy -and $config.Proxy -match '^(socks|https?):') { $args += '--proxy'; $args += $config.Proxy }
            if ($referer) { $args += '--referer'; $args += $referer }
            if ($isPlaylist) { $args += '--yes-playlist' }

            if ($audioOnly) {
                $ytArgs = @('-f','bestaudio','--extract-audio','--audio-format',$format,'--audio-quality','0') + $args + @($url)
            } elseif ($isDirect) {
                $ytArgs = $args + @($url)
            } else {
                $ytArgs = @('-f',$fmtSel,'--merge-output-format',$format) + $args + @($url)
            }

            $proc = Start-Process -FilePath $config.YtDlpPath -ArgumentList $ytArgs -NoNewWindow -PassThru `
                -RedirectStandardOutput $progressFile -RedirectStandardError (Join-Path $env:TEMP "mdl_stderr_$id.txt")

            $state.Downloads[$id] = [hashtable]::Synchronized(@{
                id=$id; url=$url; title=if($title){$title}else{"Unknown"}; audioOnly=$audioOnly
                status="downloading"; progress=0; speed=""; eta=""; process=$proc
                progressFile=$progressFile; startTime=(Get-Date); filename=""; format=$format; quality=$quality
            })
            Write-SLog "[$id] Started: $($url.Substring(0,[Math]::Min(60,$url.Length)))..."
            return $id
        }

        function Update-Downloads {
            foreach ($id in @($state.Downloads.Keys)) {
                $dl = $state.Downloads[$id]
                if ($dl.status -eq 'complete' -or $dl.status -eq 'failed' -or $dl.status -eq 'cancelled') { continue }
                if (-not $dl.process) { continue }
                if (Test-Path $dl.progressFile) {
                    $tail = Read-FileTail $dl.progressFile
                    if ($tail) {
                        $lines = $tail -split "`n"
                        for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                            if ($lines[$i] -match '^MDLP\s+(\d+\.?\d*)%?\s+(\S+)\s+(\S+)') {
                                $dl.progress = [double]($matches[1] -replace '%','')
                                if ($matches[2] -ne 'NA' -and $matches[2] -ne 'Unknown') { $dl.speed = $matches[2] }
                                if ($matches[3] -ne 'NA' -and $matches[3] -ne 'Unknown') { $dl.eta = $matches[3] }
                                break
                            }
                            if ($lines[$i] -match '\[download\]\s+(\d+\.?\d*)%') {
                                $dl.progress = [double]$matches[1]
                                if ($lines[$i] -match 'at\s+(\S+)\s+ETA\s+(\S+)') { $dl.speed = $matches[1]; $dl.eta = $matches[2] }
                                break
                            }
                        }
                        if ($tail -match '\[Merger\]|Merging formats') { $dl.status = "merging" }
                        elseif ($tail -match '\[ExtractAudio\]|\[extract\]') { $dl.status = "extracting" }
                        elseif ($tail -match 'already been downloaded') { $dl.progress = 100; $dl.status = "complete" }
                        if ($tail -match '\[Merger\] Merging formats into "(.+)"') { $dl.filename = $matches[1] }
                        elseif ($tail -match '\[download\] Destination: (.+)') { $dl.filename = $matches[1] }
                    }
                }
                if ($dl.process.HasExited) {
                    $out = if (Test-Path $dl.progressFile) { Read-FileTail $dl.progressFile 8192 } else { "" }
                    if ($out -match "100%|has already been downloaded|Merging formats into|DelayedMuxer|audio extraction complete") {
                        $dl.status = "complete"; $dl.progress = 100; $state.TotalCompleted++
                        Write-SLog "[$id] Complete"
                        Save-HistoryEntry @{ id=$dl.id; url=$dl.url; title=$dl.title; filename=$dl.filename; format=$dl.format; quality=$dl.quality; audioOnly=$dl.audioOnly; date=(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); duration=[math]::Round(((Get-Date)-$dl.startTime).TotalSeconds) }
                    } else {
                        $dl.status = "failed"
                        Write-SLog "[$id] Failed"
                    }
                    foreach ($f in @($dl.progressFile, (Join-Path $env:TEMP "mdl_stderr_$id.txt"), (Join-Path $env:TEMP "mdl_wrap_$id.ps1"))) {
                        if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
                    }
                }
            }
            # Cleanup old entries (>5min)
            $cutoff = (Get-Date).AddMinutes(-5)
            foreach ($id in @($state.Downloads.Keys)) {
                $dl = $state.Downloads[$id]
                if (($dl.status -eq 'complete' -or $dl.status -eq 'failed') -and $dl.startTime -lt $cutoff) {
                    $state.Downloads.Remove($id)
                }
            }
        }

        # ── JSON response helper ──
        function Send-Json { param($ctx, $data, [int]$code=200)
            $json = $data | ConvertTo-Json -Depth 5 -Compress
            $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
            $ctx.Response.StatusCode = $code
            $ctx.Response.ContentType = "application/json; charset=utf-8"
            $ctx.Response.Headers.Add("Access-Control-Allow-Origin","*")
            $ctx.Response.Headers.Add("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS")
            $ctx.Response.Headers.Add("Access-Control-Allow-Headers","Content-Type,X-Auth-Token,X-MDL-Client")
            $ctx.Response.ContentLength64 = $buf.Length
            try { $ctx.Response.OutputStream.Write($buf,0,$buf.Length); $ctx.Response.OutputStream.Close() } catch {}
        }
        function Read-Body { param($req)
            try { $r = New-Object System.IO.StreamReader($req.InputStream,$req.ContentEncoding); $b = $r.ReadToEnd(); $r.Close(); return $b } catch { return $null }
        }

        # ── Auto-update yt-dlp ──
        if ($config.AutoUpdateYtDlp -eq $true) {
            try { Start-Process -FilePath $config.YtDlpPath -ArgumentList "-U" -NoNewWindow -ErrorAction SilentlyContinue } catch {}
            Write-SLog "yt-dlp auto-update triggered"
        }

        # ── Start listener ──
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://127.0.0.1:$PORT/")
        try { $listener.Start() } catch { Write-SLog "FATAL: Cannot start on port $PORT"; $state.Running = $false; return }
        $state.Running = $true
        $state.Log = ""
        Write-SLog "Server listening on port $PORT"

        while ($listener.IsListening -and -not $state.ShouldStop) {
            try {
                $result = $listener.BeginGetContext($null,$null)
                while (-not $result.AsyncWaitHandle.WaitOne(500)) {
                    Update-Downloads
                    if ($state.ShouldStop) { break }
                }
                if ($state.ShouldStop) { break }
                $ctx = $listener.EndGetContext($result)
                $method = $ctx.Request.HttpMethod
                $path = $ctx.Request.Url.AbsolutePath.TrimEnd('/')

                if ($method -eq 'OPTIONS') { Send-Json $ctx @{ok=$true}; continue }
                if ($path -ne '/health') {
                    if ($ctx.Request.Headers["X-Auth-Token"] -ne $state.Token) { Send-Json $ctx @{error="Unauthorized"} 401; continue }
                }

                switch -Regex ($path) {
                    '^/health$' {
                        $active = @($state.Downloads.Values | Where-Object { $_.status -match 'downloading|merging|extracting' }).Count
                        $resp = @{status="ok";version="5.0.0";port=$PORT;downloads=$active;token_required=$true}
                        if ($ctx.Request.Headers["X-MDL-Client"] -eq "MediaDL") { $resp.token = $state.Token }
                        Send-Json $ctx $resp
                    }
                    '^/download$' {
                        if ($method -ne 'POST') { Send-Json $ctx @{error="Method not allowed"} 405; break }
                        $body = Read-Body $ctx.Request
                        if (-not $body) { Send-Json $ctx @{error="Empty body"} 400; break }
                        try { $p = $body | ConvertFrom-Json } catch { Send-Json $ctx @{error="Invalid JSON"} 400; break }
                        if (-not $p.url) { Send-Json $ctx @{error="Missing url"} 400; break }
                        $active = @($state.Downloads.Values | Where-Object { $_.status -match 'downloading|merging|extracting' }).Count
                        if ($active -ge $MAX_CONCURRENT) { Send-Json $ctx @{error="Too many concurrent downloads";active=$active} 429; break }
                        $id = Start-Download $p
                        Send-Json $ctx @{id=$id;status="downloading"}
                    }
                    '^/status/(.+)$' {
                        $sid = $matches[1]; Update-Downloads
                        if ($state.Downloads.ContainsKey($sid)) {
                            $dl = $state.Downloads[$sid]
                            Send-Json $ctx @{id=$dl.id;status=$dl.status;progress=[math]::Round($dl.progress,1);speed=$dl.speed;eta=$dl.eta;title=$dl.title;filename=$dl.filename}
                        } else { Send-Json $ctx @{error="Not found"} 404 }
                    }
                    '^/queue$' {
                        $list = @(); foreach ($dl in $state.Downloads.Values) { $list += @{id=$dl.id;status=$dl.status;progress=[math]::Round($dl.progress,1);title=$dl.title;speed=$dl.speed;eta=$dl.eta} }
                        Send-Json $ctx @{downloads=$list;count=$list.Count}
                    }
                    '^/history$' {
                        $h = @(); if (Test-Path $state.HistoryPath) { try { $h = @(Get-Content $state.HistoryPath -Raw | ConvertFrom-Json) } catch {} }
                        $lp = $ctx.Request.QueryString["limit"]; if ($lp -match '^\d+$') { $n=[int]$lp; if ($h.Count -gt $n) { $h=$h[-$n..-1] } }
                        Send-Json $ctx @{history=$h;count=$h.Count}
                    }
                    '^/config$' {
                        if ($method -eq 'GET') {
                            Send-Json $ctx @{downloadPath=$config.DownloadPath;audioDownloadPath=$config.AudioDownloadPath;embedMetadata=$config.EmbedMetadata;embedThumbnail=$config.EmbedThumbnail;embedChapters=$config.EmbedChapters;embedSubs=$config.EmbedSubs;subLangs=$config.SubLangs;sponsorBlock=$config.SponsorBlock;concurrentFragments=$config.ConcurrentFragments;downloadArchive=$config.DownloadArchive;rateLimit=$config.RateLimit;proxy=$config.Proxy;videoFormats=@('mp4','mkv','webm');audioFormats=@('mp3','m4a','opus','flac','wav');qualities=@('best','2160','1440','1080','720','480')}
                        } else { Send-Json $ctx @{error="Use GUI settings"} 405 }
                    }
                    '^/cancel/(.+)$' {
                        if ($method -ne 'DELETE') { Send-Json $ctx @{error="Method not allowed"} 405; break }
                        $cid = $matches[1]
                        if ($state.Downloads.ContainsKey($cid)) {
                            $dl = $state.Downloads[$cid]
                            if ($dl.process -and -not $dl.process.HasExited) { try { $dl.process.Kill() } catch {} }
                            $dl.status = "cancelled"
                            Send-Json $ctx @{id=$cid;cancelled=$true}
                        } else { Send-Json $ctx @{error="Not found"} 404 }
                    }
                    '^/shutdown$' { Write-SLog "Shutdown requested"; Send-Json $ctx @{status="shutting_down"}; $state.ShouldStop = $true }
                    default { Send-Json $ctx @{error="Not found"} 404 }
                }
            } catch { Start-Sleep -Milliseconds 200 }
        }

        # Cleanup
        foreach ($dl in $state.Downloads.Values) { if ($dl.process -and -not $dl.process.HasExited) { try { $dl.process.Kill() } catch {} } }
        try { $listener.Stop(); $listener.Close() } catch {}
        $state.Running = $false
        Write-SLog "Server stopped"
    }) | Out-Null

    $script:ServerRunspace = $rs
    $script:ServerPipeline = $ps
    $script:ServerState.Log = ""
    $ps.BeginInvoke() | Out-Null

    Write-Log "Server runspace started"
    Update-ServerUI
}

function Stop-Server {
    $script:ServerState.ShouldStop = $true
    # Wait briefly for clean shutdown
    $deadline = (Get-Date).AddSeconds(3)
    while ($script:ServerState.Running -and (Get-Date) -lt $deadline) {
        $window.Dispatcher.Invoke([action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
        Start-Sleep -Milliseconds 100
    }
    if ($script:ServerPipeline) {
        try { $script:ServerPipeline.Stop() } catch {}
        try { $script:ServerPipeline.Dispose() } catch {}
    }
    if ($script:ServerRunspace) {
        try { $script:ServerRunspace.Close() } catch {}
    }
    $script:ServerState.Running = $false
    $script:ServerState.StartTime = $null
    Update-ServerUI
}

function Update-ServerUI {
    if ($script:ServerState.Running) {
        $statusDot.Fill = [Windows.Media.BrushConverter]::new().ConvertFromString("#22c55e")
        $statusLabel.Text = "Running"
        $dashStatus.Text = "Server Running"
        $btnStartStop.Content = "Stop Server"
        $btnStartStop.Background = [Windows.Media.BrushConverter]::new().ConvertFromString("#ef4444")
        $trayStartStop.Text = "Stop Server"
        $trayIcon.Text = "Astra Downloader - Running"
    } else {
        $statusDot.Fill = [Windows.Media.BrushConverter]::new().ConvertFromString("#525a65")
        $statusLabel.Text = "Stopped"
        $dashStatus.Text = "Server Stopped"
        $btnStartStop.Content = "Start Server"
        $btnStartStop.Background = [Windows.Media.BrushConverter]::new().ConvertFromString("#22c55e")
        $trayStartStop.Text = "Start Server"
        $trayIcon.Text = "Astra Downloader - Stopped"
    }
}

# ══════════════════════════════════════════════════════════════
# EVENT HANDLERS
# ══════════════════════════════════════════════════════════════

$btnStartStop.Add_Click({
    if ($script:ServerState.Running) { Stop-Server } else { Start-Server }
})

$trayStartStop.Add_Click({
    if ($script:ServerState.Running) { Stop-Server } else { Start-Server }
})

$btnOpenFolder.Add_Click({
    $p = $script:Config.DownloadPath
    if ($p -and (Test-Path $p)) { Start-Process explorer.exe -ArgumentList $p }
    else { Start-Process explorer.exe -ArgumentList $script:InstallPath }
})

# Browse buttons
$btnBrowseDl.Add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.SelectedPath = $cfgDownloadPath.Text
    if ($d.ShowDialog() -eq 'OK') { $cfgDownloadPath.Text = $d.SelectedPath }
})
$btnBrowseAudio.Add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.SelectedPath = $cfgAudioPath.Text
    if ($d.ShowDialog() -eq 'OK') { $cfgAudioPath.Text = $d.SelectedPath }
})

# Save settings
$btnSaveSettings.Add_Click({
    $script:Config.DownloadPath = $cfgDownloadPath.Text
    $script:Config.AudioDownloadPath = $cfgAudioPath.Text
    $script:Config.EmbedMetadata = $cfgEmbedMetadata.IsChecked
    $script:Config.EmbedThumbnail = $cfgEmbedThumbnail.IsChecked
    $script:Config.EmbedChapters = $cfgEmbedChapters.IsChecked
    $script:Config.EmbedSubs = $cfgEmbedSubs.IsChecked
    $script:Config.SubLangs = $cfgSubLangs.Text
    $script:Config.SponsorBlock = $cfgSponsorBlock.IsChecked
    $v = 0; if ([int]::TryParse($cfgFragments.Text, [ref]$v) -and $v -ge 1 -and $v -le 32) { $script:Config.ConcurrentFragments = $v }
    $script:Config.RateLimit = $cfgRateLimit.Text
    $script:Config.Proxy = $cfgProxy.Text
    $script:Config.AutoUpdateYtDlp = $cfgAutoUpdate.IsChecked
    $script:Config.DownloadArchive = $cfgArchive.IsChecked
    $script:Config.CloseToTray = $cfgCloseToTray.IsChecked
    $script:Config.StartMinimized = $cfgStartMinimized.IsChecked
    Save-Config
    $script:ServerState.Config = $script:Config
    $btnSaveSettings.Content = "Saved!"
    $window.Dispatcher.BeginInvoke([action]{ Start-Sleep -Milliseconds 1500; $btnSaveSettings.Content = "Save Settings" })
})

# Clear history
$btnClearHistory.Add_Click({
    "[]" | Set-Content $script:HistoryPath -Encoding UTF8
    Refresh-History
})

# ── History refresh ──
function Refresh-History {
    $historyList.Children.Clear()
    $history = @()
    if (Test-Path $script:HistoryPath) {
        try { $history = @(Get-Content $script:HistoryPath -Raw | ConvertFrom-Json) } catch {}
    }
    if ($history.Count -eq 0) {
        $t = New-Object System.Windows.Controls.TextBlock
        $t.Text = "No downloads yet."
        $t.FontSize = 13
        $t.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString("#525a65")
        $historyList.Children.Add($t)
        return
    }
    [array]::Reverse($history)
    $shown = [Math]::Min($history.Count, 50)
    for ($i = 0; $i -lt $shown; $i++) {
        $h = $history[$i]
        $card = New-Object System.Windows.Controls.Border
        $card.Background = [Windows.Media.BrushConverter]::new().ConvertFromString("#151b23")
        $card.BorderBrush = [Windows.Media.BrushConverter]::new().ConvertFromString("#2a3140")
        $card.BorderThickness = [System.Windows.Thickness]::new(1)
        $card.CornerRadius = [System.Windows.CornerRadius]::new(8)
        $card.Padding = [System.Windows.Thickness]::new(12,8,12,8)
        $card.Margin = [System.Windows.Thickness]::new(0,0,0,6)

        $sp = New-Object System.Windows.Controls.StackPanel
        $titleTb = New-Object System.Windows.Controls.TextBlock
        $titleTb.Text = "$($h.title)"
        $titleTb.FontSize = 12; $titleTb.FontWeight = "SemiBold"
        $titleTb.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString("#e6edf3")
        $titleTb.TextTrimming = "CharacterEllipsis"
        $sp.Children.Add($titleTb)

        $metaTb = New-Object System.Windows.Controls.TextBlock
        $metaTb.Text = "$($h.date)  |  $($h.format)  |  $($h.quality)  |  $($h.duration)s"
        $metaTb.FontSize = 10
        $metaTb.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString("#525a65")
        $metaTb.Margin = [System.Windows.Thickness]::new(0,2,0,0)
        $sp.Children.Add($metaTb)

        $card.Child = $sp
        $historyList.Children.Add($card)
    }
}

# ══════════════════════════════════════════════════════════════
# UI TIMER (updates dashboard every 500ms)
# ══════════════════════════════════════════════════════════════
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
    Update-ServerUI

    # Stats
    $active = @($script:ServerState.Downloads.Values | Where-Object { $_.status -match 'downloading|merging|extracting' }).Count
    $statActive.Text = "$active"
    $statCompleted.Text = "$($script:ServerState.TotalCompleted)"

    if ($script:ServerState.StartTime) {
        $up = (Get-Date) - $script:ServerState.StartTime
        if ($up.TotalHours -ge 1) { $statUptime.Text = "{0:0}h" -f $up.TotalHours }
        elseif ($up.TotalMinutes -ge 1) { $statUptime.Text = "{0:0}m" -f $up.TotalMinutes }
        else { $statUptime.Text = "{0:0}s" -f $up.TotalSeconds }
    } else { $statUptime.Text = "--" }

    # Log
    if ($script:ServerState.Log) {
        $logText.Text += $script:ServerState.Log
        $script:ServerState.Log = ""
        # Trim to last 2000 chars
        if ($logText.Text.Length -gt 2000) { $logText.Text = $logText.Text.Substring($logText.Text.Length - 2000) }
        $logScroll.ScrollToEnd()
    }

    # Active downloads list
    $dls = @($script:ServerState.Downloads.Values | Where-Object { $_.status -notmatch 'complete|failed|cancelled' })
    if ($dls.Count -eq 0) {
        if ($downloadsList.Children.Count -ne 1 -or $downloadsList.Children[0] -ne $noDownloads) {
            $downloadsList.Children.Clear()
            $downloadsList.Children.Add($noDownloads)
        }
    } else {
        $downloadsList.Children.Clear()
        foreach ($dl in $dls) {
            $card = New-Object System.Windows.Controls.Border
            $card.Background = [Windows.Media.BrushConverter]::new().ConvertFromString("#151b23")
            $card.BorderBrush = [Windows.Media.BrushConverter]::new().ConvertFromString("#2a3140")
            $card.BorderThickness = [System.Windows.Thickness]::new(1)
            $card.CornerRadius = [System.Windows.CornerRadius]::new(10)
            $card.Padding = [System.Windows.Thickness]::new(14,10,14,10)
            $card.Margin = [System.Windows.Thickness]::new(0,0,0,8)

            $sp = New-Object System.Windows.Controls.StackPanel

            $titleTb = New-Object System.Windows.Controls.TextBlock
            $titleTb.Text = "$($dl.title)"
            $titleTb.FontSize = 13; $titleTb.FontWeight = "SemiBold"
            $titleTb.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString("#e6edf3")
            $titleTb.TextTrimming = "CharacterEllipsis"
            $sp.Children.Add($titleTb)

            # Progress bar
            $barBg = New-Object System.Windows.Controls.Border
            $barBg.Background = [Windows.Media.BrushConverter]::new().ConvertFromString("#1a2028")
            $barBg.CornerRadius = [System.Windows.CornerRadius]::new(4)
            $barBg.Height = 6
            $barBg.Margin = [System.Windows.Thickness]::new(0,6,0,4)
            $barFill = New-Object System.Windows.Controls.Border
            $barFill.Background = [Windows.Media.BrushConverter]::new().ConvertFromString("#22c55e")
            $barFill.CornerRadius = [System.Windows.CornerRadius]::new(4)
            $barFill.HorizontalAlignment = "Left"
            $pct = [Math]::Min([Math]::Max($dl.progress, 0), 100)
            $barFill.Width = [Math]::Max(($pct / 100.0) * 400, 0)
            $barBg.Child = $barFill
            $sp.Children.Add($barBg)

            $metaTb = New-Object System.Windows.Controls.TextBlock
            $metaTb.Text = "$([math]::Round($dl.progress,1))%  |  $($dl.speed)  |  ETA $($dl.eta)  |  $($dl.status)"
            $metaTb.FontSize = 10
            $metaTb.Foreground = [Windows.Media.BrushConverter]::new().ConvertFromString("#8b949e")
            $sp.Children.Add($metaTb)

            $card.Child = $sp
            $downloadsList.Children.Add($card)
        }
    }
})
$timer.Start()

# ══════════════════════════════════════════════════════════════
# NAMED PIPE (single instance show-window IPC)
# ══════════════════════════════════════════════════════════════
$pipeRunspace = [runspacefactory]::CreateRunspace()
$pipeRunspace.Open()
$pipeRunspace.SessionStateProxy.SetVariable('dispatcher', $window.Dispatcher)
$pipeRunspace.SessionStateProxy.SetVariable('window', $window)
$pipePipeline = [powershell]::Create()
$pipePipeline.Runspace = $pipeRunspace
$pipePipeline.AddScript({
    while ($true) {
        try {
            $pipe = New-Object System.IO.Pipes.NamedPipeServerStream('AstraDownloader-Show', [System.IO.Pipes.PipeDirection]::In)
            $pipe.WaitForConnection()
            $pipe.ReadByte() | Out-Null
            $pipe.Close()
            $dispatcher.Invoke([action]{
                $window.Show()
                $window.WindowState = [System.Windows.WindowState]::Normal
                $window.Activate()
            })
        } catch { Start-Sleep -Seconds 1 }
    }
}) | Out-Null
$pipePipeline.BeginInvoke() | Out-Null

# ══════════════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════════════

# Auto-start server
Start-Server

# Handle -Background flag or StartMinimized config
if ($Background -or $script:Config.StartMinimized -eq $true) {
    $window.WindowState = [System.Windows.WindowState]::Minimized
    $window.ShowInTaskbar = $false
    $window.Hide()
}

# Set window icon if available
$winIconPath = Join-Path $PSScriptRoot "AstraDownloader.ico"
if (!(Test-Path $winIconPath)) { $winIconPath = Join-Path $PSScriptRoot "icon.ico" }
if (Test-Path $winIconPath) {
    try { $window.Icon = [System.Windows.Media.Imaging.BitmapFrame]::Create([System.Uri]::new($winIconPath)) } catch {}
}

$window.ShowDialog() | Out-Null

# ── Cleanup ──
$timer.Stop()
Stop-Server
$trayIcon.Visible = $false
$trayIcon.Dispose()
try { $pipePipeline.Stop(); $pipePipeline.Dispose(); $pipeRunspace.Close() } catch {}
$mutex.ReleaseMutex()
$mutex.Dispose()
