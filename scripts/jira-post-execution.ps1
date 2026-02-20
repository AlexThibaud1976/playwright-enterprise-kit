<#
.SYNOPSIS
    Enrichissement d'une Test Execution Jira après exécution des tests Playwright

.DESCRIPTION
    Ce script enrichit automatiquement la Test Execution Jira créée par Xray :
    - Champs personnalisés (OS, Browser, Version, Test Scope) [optionnel]
    - Labels : device testé + résultat (PASS/FAIL)
    - Titre descriptif avec emoji résultat
    - Pièce jointe : rapport HTML Playwright
    - Lien distant vers GitHub Actions
    - Lien distant vers BrowserStack [optionnel]

.PARAMETER ExecKey
    Clé Jira de la Test Execution créée par upload-xray.ps1 (ex: MYPROJECT-123)

.PARAMETER DeviceName
    Nom de la configuration testée (ex: win-11-chrome-latest)

.PARAMETER TestResult
    Résultat : PASS, FAIL ou UNKNOWN

.PARAMETER TestScope
    Périmètre de test exécuté (ex: "All Tests", "Login")

.PARAMETER JiraUrl
    URL de base Jira (ex: https://yourcompany.atlassian.net)

.PARAMETER JiraUser
    Email de l'utilisateur Jira (pour Basic Auth)

.PARAMETER JiraApiToken
    Token API Jira

.PARAMETER GitHubRepository
    Nom du repo GitHub (format: owner/repo)

.PARAMETER GitHubRunId
    ID de l'exécution GitHub Actions

.PARAMETER GitHubRunNumber
    Numéro de l'exécution GitHub Actions

.PARAMETER BrowserStackBuildUrl
    [Optionnel] URL du build BrowserStack

.PARAMETER ReportPath
    Chemin du dossier de rapports Playwright (défaut: playwright-report)

.EXAMPLE
    ./scripts/jira-post-execution.ps1 `
      -ExecKey "MYPROJECT-123" `
      -DeviceName "win-11-chrome-latest" `
      -TestResult "PASS" `
      -TestScope "All Tests" `
      -JiraUrl "https://mycompany.atlassian.net" `
      -JiraUser "user@example.com" `
      -JiraApiToken "xxxx" `
      -GitHubRepository "myorg/myrepo" `
      -GitHubRunId "12345678" `
      -GitHubRunNumber "42"

.NOTES
    Secrets GitHub Actions requis :
      JIRA_URL, JIRA_USER, JIRA_API_TOKEN

    Champs personnalisés (optionnels) :
      JIRA_CUSTOM_FIELD_OS, JIRA_CUSTOM_FIELD_OS_VERSION,
      JIRA_CUSTOM_FIELD_BROWSER, JIRA_CUSTOM_FIELD_BROWSER_VERSION,
      JIRA_CUSTOM_FIELD_TEST_SCOPE
      (récupérables via scripts/get-custom-field-ids.ps1)
#>

param(
  [Parameter(Mandatory = $true)][string]$ExecKey,
  [Parameter(Mandatory = $true)][string]$DeviceName,
  [string]$TestResult         = "UNKNOWN",
  [string]$TestScope          = "All Tests",
  [Parameter(Mandatory = $true)][string]$JiraUrl,
  [Parameter(Mandatory = $true)][string]$JiraUser,
  [Parameter(Mandatory = $true)][string]$JiraApiToken,
  [Parameter(Mandatory = $true)][string]$GitHubRepository,
  [Parameter(Mandatory = $true)][string]$GitHubRunId,
  [Parameter(Mandatory = $true)][string]$GitHubRunNumber,
  [string]$BrowserStackBuildUrl = "",
  [string]$ReportPath           = "playwright-report"
)

Write-Host "=============================================="
Write-Host "[Jira Post-Execution] $ExecKey"
Write-Host "Device     : $DeviceName"
Write-Host "Result     : $TestResult"
Write-Host "Scope      : $TestScope"
Write-Host "=============================================="

$basicAuth  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${JiraUser}:${JiraApiToken}"))
$jsonHeaders = @{ Authorization = "Basic $basicAuth"; Accept = "application/json" }

# ─── 1. Champs personnalisés (optionnel) ───────────────────────────────────────
Write-Host "`n[1/6] Updating custom fields..."
$cfObj = @{ fields = @{} }

if ($env:JIRA_CUSTOM_FIELD_OS -and $env:BS_OS) {
  $cfObj.fields[$env:JIRA_CUSTOM_FIELD_OS] = $env:BS_OS
}
if ($env:JIRA_CUSTOM_FIELD_OS_VERSION -and $env:BS_OS_VERSION) {
  $cfObj.fields[$env:JIRA_CUSTOM_FIELD_OS_VERSION] = $env:BS_OS_VERSION
}
if ($env:JIRA_CUSTOM_FIELD_BROWSER -and $env:BS_BROWSER) {
  $cfObj.fields[$env:JIRA_CUSTOM_FIELD_BROWSER] = $env:BS_BROWSER
}
if ($env:JIRA_CUSTOM_FIELD_BROWSER_VERSION -and $env:BS_BROWSER_VERSION) {
  $cfObj.fields[$env:JIRA_CUSTOM_FIELD_BROWSER_VERSION] = $env:BS_BROWSER_VERSION
}
if ($env:JIRA_CUSTOM_FIELD_TEST_SCOPE -and $TestScope) {
  $cfObj.fields[$env:JIRA_CUSTOM_FIELD_TEST_SCOPE] = $TestScope
}

if ($cfObj.fields.Count -gt 0) {
  try {
    Invoke-RestMethod -Method Put -Uri "$JiraUrl/rest/api/3/issue/$ExecKey" `
      -Headers $jsonHeaders -ContentType "application/json" `
      -Body ($cfObj | ConvertTo-Json) | Out-Null
    Write-Host "Custom fields updated"
  } catch {
    Write-Host "Warning: Custom fields update failed - $($_.Exception.Message)"
  }
} else {
  Write-Host "Custom field env vars not set (optional, skipping)"
}

# ─── 2. Labels (device + résultat) ────────────────────────────────────────────
Write-Host "`n[2/6] Updating labels..."
try {
  $issue = Invoke-RestMethod -Method Get -Uri "$JiraUrl/rest/api/3/issue/$ExecKey" -Headers $jsonHeaders
  $filtered = $issue.fields.labels | Where-Object { $_ -ne "PASS" -and $_ -ne "FAIL" }
  $labelsArray = @($filtered) + @($DeviceName, $TestResult)
  $labelsJson  = $labelsArray | ConvertTo-Json
  $labelBody   = "{`"fields`": {`"labels`": $labelsJson}}"
  Invoke-RestMethod -Method Put -Uri "$JiraUrl/rest/api/3/issue/$ExecKey" `
    -Headers $jsonHeaders -ContentType "application/json" -Body $labelBody | Out-Null
  Write-Host "Labels updated: $DeviceName + $TestResult"
} catch {
  Write-Host "Warning: Labels update failed - $($_.Exception.Message)"
}

# ─── 3. Titre avec emoji résultat ──────────────────────────────────────────────
Write-Host "`n[3/6] Updating title..."
$resultEmoji = if ($TestResult -eq "PASS") { "[PASS]" } elseif ($TestResult -eq "FAIL") { "[FAIL]" } else { "[?]" }
$newTitle    = "$resultEmoji Test Execution - $TestScope - $DeviceName"
try {
  Invoke-RestMethod -Method Put -Uri "$JiraUrl/rest/api/3/issue/$ExecKey" `
    -Headers $jsonHeaders -ContentType "application/json" `
    -Body (@{ fields = @{ summary = $newTitle } } | ConvertTo-Json) | Out-Null
  Write-Host "Title updated: $newTitle"
} catch {
  Write-Host "Warning: Title update failed - $($_.Exception.Message)"
}

# ─── 4. Pièce jointe : rapport HTML ───────────────────────────────────────────
Write-Host "`n[4/6] Attaching HTML report..."
$htmlPath = "$ReportPath/index.html"
if (Test-Path $htmlPath) {
  try {
    $attachHeaders = @{ Authorization = "Basic $basicAuth"; "X-Atlassian-Token" = "no-check" }
    Invoke-WebRequest -Method Post -Uri "$JiraUrl/rest/api/3/issue/$ExecKey/attachments" `
      -Headers $attachHeaders -Form @{ file = (Get-Item $htmlPath) } | Out-Null
    Write-Host "HTML report attached"
  } catch {
    Write-Host "Warning: Attachment failed - $($_.Exception.Message)"
  }
} else {
  Write-Host "HTML report not found at $htmlPath"
}

# ─── 5. Lien GitHub Actions ───────────────────────────────────────────────────
Write-Host "`n[5/6] Adding GitHub Actions link..."
$ghLinkBody = @{
  object = @{
    url   = "https://github.com/$GitHubRepository/actions/runs/$GitHubRunId"
    title = "GitHub Actions Run #$GitHubRunNumber"
    icon  = @{
      url16x16 = "https://github.githubassets.com/favicons/favicon.png"
      title     = "GitHub Actions"
    }
  }
} | ConvertTo-Json -Depth 4
try {
  Invoke-RestMethod -Method Post -Uri "$JiraUrl/rest/api/3/issue/$ExecKey/remotelink" `
    -Headers $jsonHeaders -ContentType "application/json" -Body $ghLinkBody | Out-Null
  Write-Host "GitHub Actions link added"
} catch {
  Write-Host "Warning: GitHub link failed - $($_.Exception.Message)"
}

# ─── 6. Lien BrowserStack (optionnel) ─────────────────────────────────────────
if ($BrowserStackBuildUrl -and $BrowserStackBuildUrl -ne "") {
  Write-Host "`n[6/6] Adding BrowserStack link..."
  $bsLinkBody = @{
    object = @{
      url   = $BrowserStackBuildUrl
      title = "BrowserStack Build"
      icon  = @{
        url16x16 = "https://www.browserstack.com/favicon.ico"
        title     = "BrowserStack"
      }
    }
  } | ConvertTo-Json -Depth 4
  try {
    Invoke-RestMethod -Method Post -Uri "$JiraUrl/rest/api/3/issue/$ExecKey/remotelink" `
      -Headers $jsonHeaders -ContentType "application/json" -Body $bsLinkBody | Out-Null
    Write-Host "BrowserStack link added"
  } catch {
    Write-Host "Warning: BrowserStack link failed - $($_.Exception.Message)"
  }
} else {
  Write-Host "`n[6/6] BrowserStack URL not provided, skipping"
}

Write-Host ""
Write-Host "=============================================="
Write-Host "[Jira Post-Execution] Done for $ExecKey"
Write-Host "Result : $resultEmoji $TestResult"
Write-Host "View   : $JiraUrl/browse/$ExecKey"
Write-Host "=============================================="
