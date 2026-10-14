# Read-only download check for the exact artifacts reported by Eclipse.
# Nothing is saved to disk; only status and error details are printed.
$urls = @(
    'https://eclipse-ext.pages.dev/repository/content.jar',
    'https://eclipse-ext.pages.dev/repository/plugins/com.oje.eclipse.hello_1.0.0.202610141105.jar',
    'https://eclipse-ext.pages.dev/repository/features/com.oje.eclipse.hello.feature_1.0.0.202610141105.jar'
)

foreach ($url in $urls) {
    Write-Output "URL: $url"
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
        Write-Output "RESULT: HTTP $([int]$response.StatusCode); bytes=$($response.RawContentLength)"
    } catch {
        $errorInfo = $_.Exception
        Write-Output "RESULT: FAILED ($($errorInfo.GetType().FullName))"
        if ($errorInfo.Response -and $errorInfo.Response.StatusCode) {
            Write-Output "HTTP: $([int]$errorInfo.Response.StatusCode)"
        }
        for ($depth = 0; $errorInfo -and $depth -lt 3; $depth++) {
            Write-Output "CAUSE $depth`: $($errorInfo.Message)"
            $errorInfo = $errorInfo.InnerException
        }
    }
    Write-Output ''
}
