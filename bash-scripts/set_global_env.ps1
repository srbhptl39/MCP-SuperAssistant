# Default values
$CLI_CEB_DEV = $false
$CLI_CEB_FIREFOX = $false
$cli_values = @()

function Validate-IsBoolean {
    param (
        [string]$value,
        [string]$name
    )
    if ($value -ne "true" -and $value -ne "false") {
        Write-Error "Invalid value for <$name>. Please use 'true' or 'false'."
        exit 1
    }
}

function Validate-Key {
    param (
        [string]$key,
        [bool]$isEditableSection = $false
    )
    if ($key -and -not $key.StartsWith("#")) {
        if ($isEditableSection -and -not $key.StartsWith("CEB_")) {
            Write-Error "Invalid key: <$key>. All keys in the editable section must start with 'CEB_'."
            exit 1
        }
        elseif (-not $isEditableSection -and -not $key.StartsWith("CLI_CEB_")) {
            Write-Error "Invalid key: <$key>. All CLI keys must start with 'CLI_CEB_'."
            exit 1
        }
    }
}

function Parse-Arguments {
    param (
        [string[]]$args
    )
    foreach ($arg in $args) {
        $key = $arg.Split('=')[0]
        $value = $arg.Split('=')[1]

        Validate-Key $key

        switch ($key) {
            "CLI_CEB_DEV" {
                $script:CLI_CEB_DEV = $value
                Validate-IsBoolean $CLI_CEB_DEV "CLI_CEB_DEV"
            }
            "CLI_CEB_FIREFOX" {
                $script:CLI_CEB_FIREFOX = $value
                Validate-IsBoolean $CLI_CEB_FIREFOX "CLI_CEB_FIREFOX"
            }
            default {
                $script:cli_values += "$key=$value"
            }
        }
    }
}

function Validate-EnvKeys {
    $editableSectionStarts = $false
    Get-Content .env | ForEach-Object {
        $key = $_.Split('=')[0]
        if ($key -match "^CLI_CEB_") {
            $editableSectionStarts = $true
        }
        elseif ($editableSectionStarts) {
            Validate-Key $key $true
        }
    }
}

function Create-NewFile {
    $tempFile = New-TemporaryFile
    @"
# THOSE VALUES ARE EDITABLE ONLY VIA CLI
CLI_CEB_DEV=$CLI_CEB_DEV
CLI_CEB_FIREFOX=$CLI_CEB_FIREFOX
$($cli_values -join "`n")

# THOSE VALUES ARE EDITABLE
$((Get-Content .env | Where-Object { $_ -match '^CEB_' }) -join "`n")
"@ | Set-Content $tempFile -NoNewline

    Move-Item $tempFile .env -Force
}

# Main script execution
Parse-Arguments $args
Validate-EnvKeys
Create-NewFile 