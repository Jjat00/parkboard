# Installs park, the Parkboard CLI, on Windows: irm https://parkboard.jato.run/install.ps1 | iex
# One file, no dependencies, Node 20+. It goes to %LOCALAPPDATA%\parkboard (park.mjs plus a park.cmd shim),
# and that folder is added to your user PATH.
# `iex` runs in the caller's session: the script block keeps these settings from leaking into it.
& {
  $ErrorActionPreference = "Stop"

  $src = "https://raw.githubusercontent.com/Jjat00/parkboard/main/cli/park.mjs"
  $dir = Join-Path $env:LOCALAPPDATA "parkboard"

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "park needs Node.js 20 or newer: https://nodejs.org" -ForegroundColor Red
    return
  }
  $major = [int](node -p "process.versions.node.split('.')[0]")
  if ($major -lt 20) {
    Write-Host "park needs Node.js 20 or newer (found $(node -v))" -ForegroundColor Red
    return
  }

  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $tmp = Join-Path $dir "park.$PID.mjs"
  try {
    # PowerShell 5.1 may still default to TLS 1.0; add 1.2 for this download and put the old value back after.
    $tls = [Net.ServicePointManager]::SecurityProtocol
    [Net.ServicePointManager]::SecurityProtocol = $tls -bor [Net.SecurityProtocolType]::Tls12
    try { Invoke-WebRequest -UseBasicParsing -Uri $src -OutFile $tmp } finally { [Net.ServicePointManager]::SecurityProtocol = $tls }
    node --check $tmp
    if ($LASTEXITCODE -ne 0) { throw "the downloaded park.mjs does not parse" }
    Move-Item -Force $tmp (Join-Path $dir "park.mjs")
  } finally {
    if (Test-Path $tmp) { Remove-Item -Force $tmp }
  }
  Set-Content -Encoding ASCII -Path (Join-Path $dir "park.cmd") -Value "@node `"%~dp0park.mjs`" %*"
  Write-Host "installed park in $dir" -ForegroundColor Green

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (($userPath -split ";") -contains $dir)) {
    $newPath = if ($userPath) { "$($userPath.TrimEnd(';'));$dir" } else { $dir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "  added $dir to your PATH: open a new terminal for it to apply"
  }
  # $env:Path is process-wide, so park also works in this same window.
  if (-not (($env:Path -split ";") -contains $dir)) { $env:Path = "$env:Path;$dir" }
  Write-Host "Next: park login"
}
