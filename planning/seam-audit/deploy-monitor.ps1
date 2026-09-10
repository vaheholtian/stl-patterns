param([Parameter(Mandatory=$true)][string]$Commit)
$ErrorActionPreference = 'Stop'
$headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'STL-patterns-deployment-check' }
$repo = 'https://api.github.com/repos/vaheholtian/stl-patterns'
$deadline = (Get-Date).AddSeconds(45)
do {
    $runs = Invoke-RestMethod -Uri "$repo/actions/workflows/pages.yml/runs?per_page=5" -Headers $headers
    $run = $runs.workflow_runs | Where-Object head_sha -eq $Commit | Select-Object -First 1
    if ($run) {
        Write-Output "Run $($run.id): $($run.status) $($run.conclusion)"
        if ($run.status -eq 'completed') {
            $run | Select-Object id,head_sha,status,conclusion,html_url | ConvertTo-Json | Set-Content -LiteralPath "$PSScriptRoot/deployment-result.json"
            if ($run.conclusion -ne 'success') { throw "Deployment failed: $($run.html_url)" }
            $jobs = Invoke-RestMethod -Uri "$repo/actions/runs/$($run.id)/jobs" -Headers $headers
            $jobs.jobs | Select-Object name,status,conclusion | ConvertTo-Json
            $url = 'https://vaheholtian.github.io/stl-patterns/'
            $page = Invoke-WebRequest -Uri $url -Headers @{'Cache-Control'='no-cache'}
            $scripts = [regex]::Matches($page.Content, 'src="([^"]+\.js)"')
            $found = $false
            foreach ($script in $scripts) {
                $asset = [Uri]::new([Uri]$url, $script.Groups[1].Value).AbsoluteUri
                $js = Invoke-WebRequest -Uri $asset
                if ($js.Content.Contains('Applying tiled pattern') -and $js.Content.Contains('Tiled cut stage progress')) { $found = $true }
                Write-Output "Live asset: $asset"
            }
            if (!$found) { throw 'Deployment succeeded, but the live page does not yet contain the new progress UI.' }
            Write-Output "VERIFIED: $url serves the new tiled progress UI; commit $Commit deployed successfully."
            exit 0
        }
    } else { Write-Output 'Waiting for the Pages workflow to start.' }
    Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
Write-Output 'PENDING: deployment is still running.'
