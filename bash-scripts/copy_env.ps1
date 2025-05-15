# Check if .env does not exist and .example.env exists
if (!(Test-Path ".env") -and (Test-Path ".example.env")) {
    # Copy .example.env to .env
    Copy-Item ".example.env" -Destination ".env"
    Write-Host ".example.env has been copied to .env"
} 