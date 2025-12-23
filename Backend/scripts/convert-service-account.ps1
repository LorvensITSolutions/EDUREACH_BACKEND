# PowerShell script to convert service account JSON to environment variable format
# Usage: .\scripts\convert-service-account.ps1 -Path "path\to\service-account-key.json"

param(
    [Parameter(Mandatory=$true)]
    [string]$Path
)

if (-not (Test-Path $Path)) {
    Write-Host "Error: File not found: $Path" -ForegroundColor Red
    exit 1
}

try {
    # Read JSON file
    $jsonContent = Get-Content $Path -Raw | ConvertFrom-Json
    
    # Convert back to single-line JSON string
    $singleLine = ($jsonContent | ConvertTo-Json -Compress)
    
    Write-Host "`n✓ Service Account JSON converted successfully!`n" -ForegroundColor Green
    Write-Host "Copy the following and paste it as SERVICE_ACCOUNT_JSON in Render:`n" -ForegroundColor Yellow
    Write-Host ("─" * 80) -ForegroundColor Gray
    Write-Host $singleLine -ForegroundColor White
    Write-Host ("─" * 80) -ForegroundColor Gray
    Write-Host "`n📋 Instructions:" -ForegroundColor Cyan
    Write-Host "1. Copy the entire line above (between the dashes)"
    Write-Host "2. Go to Render dashboard > Your Service > Environment"
    Write-Host "3. Add new variable: SERVICE_ACCOUNT_JSON"
    Write-Host "4. Paste the copied content as the value"
    Write-Host "5. Also set CALENDAR_ID with your calendar ID"
    Write-Host "6. Restart your service`n"
    
    # Save to file
    $outputFile = Join-Path $PSScriptRoot "service-account-env.txt"
    $singleLine | Out-File -FilePath $outputFile -Encoding utf8
    Write-Host "✓ Also saved to: $outputFile`n" -ForegroundColor Green
    
} catch {
    Write-Host "Error processing JSON file: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}


