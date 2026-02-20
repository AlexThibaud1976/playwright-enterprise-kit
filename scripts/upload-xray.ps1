<#
.SYNOPSIS
    Upload des résultats de tests JUnit vers Xray Cloud

.DESCRIPTION
    Ce script s'authentifie auprès de l'API Xray Cloud, puis uploade un fichier
    JUnit XML pour créer une Test Execution dans Jira/Xray.

    Gestion :
    - Authentification via client_id/client_secret Xray Cloud
    - Upload du fichier xray-report.xml généré par @xray-app/playwright-junit-reporter
    - Association avec un Test Plan Jira existant
    - Export de la clé de Test Execution créée (exec_key) vers GITHUB_OUTPUT

.PARAMETER IssueKey
    Clé du Test Plan Jira (ex: MYPROJECT-100)

.PARAMETER XrayEndpoint
    Endpoint Xray Cloud (défaut: xray.cloud.getxray.app)

.PARAMETER JiraProjectKey
    Clé du projet Jira (ex: MYPROJECT)

.OUTPUTS
    exec_key - Clé de la Test Execution créée, exportée dans GITHUB_OUTPUT

.EXAMPLE
    ./scripts/upload-xray.ps1 -IssueKey "MYPROJECT-100"

.NOTES
    Secrets GitHub Actions requis :
      XRAY_CLIENT_ID, XRAY_CLIENT_SECRET,
      JIRA_USER, JIRA_API_TOKEN, JIRA_URL
#>

param(
  [Parameter(Mandatory = $true)][string]$IssueKey,
  [string]$XrayEndpoint   = $env:XRAY_ENDPOINT ?? "xray.cloud.getxray.app",
  [string]$JiraProjectKey = $env:JIRA_PROJECT_KEY ?? "MYPROJECT"
)

Write-Host "[Xray] Authentication..."

# Force TLS 1.2/1.3 pour compatibilité avec l'API Xray
try {
  $currentProtocols = [Net.ServicePointManager]::SecurityProtocol
  $tls12 = [Net.SecurityProtocolType]::Tls12
  $tls13 = $null
  try { $tls13 = [Enum]::Parse([Net.SecurityProtocolType], "Tls13") } catch {}
  if ($tls13) {
    [Net.ServicePointManager]::SecurityProtocol = $currentProtocols -bor $tls12 -bor $tls13
  } else {
    [Net.ServicePointManager]::SecurityProtocol = $currentProtocols -bor $tls12
  }
} catch {
  Write-Host "Warning: unable to force TLS1.2/1.3 ($($_.Exception.Message))"
}

$clientId     = $env:XRAY_CLIENT_ID
$clientSecret = $env:XRAY_CLIENT_SECRET

if (-not $clientId -or -not $clientSecret) {
  Write-Host "ERROR: XRAY_CLIENT_ID or XRAY_CLIENT_SECRET not set"
  exit 1
}

$authBodyObj = @{ client_id = $clientId; client_secret = $clientSecret }
$authBody    = $authBodyObj | ConvertTo-Json -Compress
$authUri     = "https://$XrayEndpoint/api/v2/authenticate"

function Get-XrayToken {
  param([string]$Uri, [string]$BodyJson)
  try {
    return Invoke-RestMethod -Uri $Uri -Method POST -ContentType "application/json" -Body $BodyJson -ErrorAction Stop
  } catch {
    Write-Host "Authentication failed (Invoke-RestMethod): $($_.Exception.Message)"
    if ($_.Exception.Response) {
      try {
        $s = $_.Exception.Response.GetResponseStream()
        if ($s) { $sr = New-Object IO.StreamReader($s); Write-Host "Response: $($sr.ReadToEnd())" }
      } catch {}
    }
    return $null
  }
}

function Extract-XrayToken {
  param([object]$Response)
  if (-not $Response) { return $null }
  if ($Response -is [string]) { return $Response.Trim([char]34).Trim() }
  if ($Response -is [System.Management.Automation.PSCustomObject]) {
    if ($Response.token) { return "$($Response.token)".Trim() }
    if ($Response.jwt)   { return "$($Response.jwt)".Trim() }
    return ($Response | ConvertTo-Json -Compress).Trim([char]34).Trim()
  }
  return $Response.ToString().Trim([char]34).Trim()
}

$authResponse = Get-XrayToken -Uri $authUri -BodyJson $authBody
$token = Extract-XrayToken -Response $authResponse

# Fallback Invoke-WebRequest
if (-not $token) {
  Write-Host "Retrying auth with Invoke-WebRequest..."
  try {
    $web = Invoke-WebRequest -Uri $authUri -Method POST -ContentType "application/json" -Body $authBody -UseBasicParsing -ErrorAction Stop
    $token = $web.Content.Trim([char]34).Trim()
  } catch {
    Write-Host "Retry auth failed: $($_.Exception.Message)"
  }
}

# Fallback curl
if (-not $token) {
  $curlCommand = (Get-Command "curl.exe" -ErrorAction SilentlyContinue)?.Source ?? (Get-Command "curl" -ErrorAction SilentlyContinue)?.Source
  if ($curlCommand) {
    Write-Host "Retrying auth with curl..."
    try {
      $curlOutput = & $curlCommand -s -H "Content-Type: application/json" -X POST -d $authBody $authUri 2>$null
      $token = $curlOutput.Trim([char]34).Trim()
    } catch {
      Write-Host "curl auth failed: $($_.Exception.Message)"
    }
  }
}

if (-not $token) {
  Write-Host "ERROR: Authentication failed. Check XRAY_CLIENT_ID and XRAY_CLIENT_SECRET."
  exit 1
}

Write-Host "Authentication successful (token length: $($token.Length))"

# ─── Vérification du fichier XML ───────────────────────────────────────────────
Write-Host "[Xray] Importing JUnit results..."

if (-not (Test-Path "xray-report.xml")) {
  Write-Host "ERROR: xray-report.xml not found."
  Write-Host "Make sure @xray-app/playwright-junit-reporter is configured in playwright.config."
  exit 1
}

# Suppression des test_key orphelins (tests non créés dans Jira)
Write-Host "Removing orphan test_key properties..."
try {
  node scripts/remove-test-keys.js xray-report.xml
} catch {
  Write-Host "Warning: Failed to remove test_key properties: $($_.Exception.Message)"
}

$junitContent = Get-Content -Path "xray-report.xml" -Raw
Write-Host "xray-report.xml size: $($junitContent.Length) characters"

if ($junitContent.Length -eq 0) {
  Write-Host "ERROR: xray-report.xml is empty"
  exit 1
}

# ─── Import vers Xray ──────────────────────────────────────────────────────────
$importUri = "https://$XrayEndpoint/api/v2/import/execution/junit?projectKey=$JiraProjectKey&testPlanKey=$IssueKey"
Write-Host "Import URI: $importUri"

$response = $null
try {
  $response = Invoke-RestMethod -Uri $importUri -Method POST `
    -ContentType "text/xml" `
    -Headers @{ "Authorization" = "Bearer $token" } `
    -Body $junitContent -ErrorAction Stop
} catch {
  Write-Host "Import failed: $($_.Exception.Message)"

  # Fallback curl
  $curlCommand = (Get-Command "curl.exe" -ErrorAction SilentlyContinue)?.Source ?? (Get-Command "curl" -ErrorAction SilentlyContinue)?.Source
  if ($curlCommand) {
    Write-Host "Retrying import with curl..."
    $curlOutput = & $curlCommand -s `
      -H "Content-Type: text/xml" `
      -H "Authorization: Bearer $token" `
      -X POST --data "@xray-report.xml" `
      "$importUri"
    Write-Host "curl output: $curlOutput"
    if ($curlOutput -match '"key"\s*:\s*"([^"]+)"') {
      $response = @{ key = $matches[1] }
    } else {
      exit 1
    }
  } else {
    exit 1
  }
}

Write-Host "Response: $($response | ConvertTo-Json)"

$execKey = $response.key
Write-Host "Test Execution Key: $execKey"

if ($env:GITHUB_OUTPUT) {
  Add-Content -Path $env:GITHUB_OUTPUT -Value "exec_key=$execKey"
} else {
  Write-Host "exec_key=$execKey"
}
