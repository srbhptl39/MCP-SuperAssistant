# Usage: ./update_version.ps1 <new_version>
# FORMAT IS <0.0.0>

param(
    [Parameter(Mandatory=$true)]
    [string]$NewVersion
)

if ($NewVersion -match '^\d+\.\d+\.\d+$') {
    Get-ChildItem -Path . -Filter 'package.json' -Recurse -File | 
    Where-Object { $_.FullName -notmatch 'node_modules' } | 
    ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        if ($content -match '"version":\s*"([^"]*)"') {
            $currentVersion = $matches[1]
            $content = $content -replace [regex]::Escape($currentVersion), $NewVersion
            Set-Content -Path $_.FullName -Value $content -NoNewline
        }
    }
    Write-Host "Updated versions to $NewVersion"
}
else {
    Write-Error "Version format <$NewVersion> isn't correct, proper format is <0.0.0>"
} 