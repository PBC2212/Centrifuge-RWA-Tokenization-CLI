param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("publish", "info", "broadcast", "disconnect", "subscribe")]
    [string]$Command,

    [string]$Channel,
    [string]$Message,
    [string]$User
)

# Load env file (simple parser)
$envFile = ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^(?<key>[^=]+)=(?<value>.*)$") {
            $name = $matches['key']
            $value = $matches['value']
            [System.Environment]::SetEnvironmentVariable($name, $value)
        }
    }
}

$apiKey = $env:CENTRIFUGO_ADMIN_PASSWORD
$baseUrl = "http://localhost:8000/api"

switch ($Command) {
    "publish" {
        if (-not $Channel -or -not $Message) {
            Write-Error "Usage: .\centrifugo-cli.ps1 publish -Channel mychannel -Message 'Hello'"
            exit
        }
        $payload = @{
            method = "publish"
            params = @{
                channel = $Channel
                data    = @{ msg = $Message }
            }
        }
    }
    "info" {
        $payload = @{ method = "info" }
    }
    "broadcast" {
        if (-not $Channel -or -not $Message) {
            Write-Error "Usage: .\centrifugo-cli.ps1 broadcast -Channel 'ch1,ch2' -Message 'Update'"
            exit
        }
        $channels = $Channel.Split(",")
        $payload = @{
            method = "broadcast"
            params = @{
                channels = $channels
                data     = @{ msg = $Message }
            }
        }
    }
    "disconnect" {
        if (-not $User) {
            Write-Error "Usage: .\centrifugo-cli.ps1 disconnect -User user123"
            exit
        }
        $payload = @{
            method = "disconnect"
            params = @{ user = $User }
        }
    }
    "subscribe" {
        if (-not $User -or -not $Channel) {
            Write-Error "Usage: .\centrifugo-cli.ps1 subscribe -User user123 -Channel mychannel"
            exit
        }
        $payload = @{
            method = "subscribe"
            params = @{ user = $User; channel = $Channel }
        }
    }
}

# Send request
$json = $payload | ConvertTo-Json -Depth 5 -Compress
$response = Invoke-RestMethod -Uri $baseUrl -Headers @{ Authorization = "apikey $apiKey" } -Body $json -ContentType "application/json" -Method Post

$response | ConvertTo-Json -Depth 5
