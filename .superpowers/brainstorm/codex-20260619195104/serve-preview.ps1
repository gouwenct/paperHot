$ErrorActionPreference = 'Stop'

$port = 50652
$file = Join-Path $PSScriptRoot 'content\paperhot-config-interactive-cn.html'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Output "paperHOT preview: http://127.0.0.1:$port/"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
        $response = $context.Response
        if ($context.Request.Url.AbsolutePath -eq '/favicon.ico') {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        $bytes = [System.Text.Encoding]::UTF8.GetBytes((Get-Content -LiteralPath $file -Raw -Encoding UTF8))
        $response.StatusCode = 200
        $response.ContentType = 'text/html; charset=utf-8'
        $response.Headers['Cache-Control'] = 'no-store'
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
    }
    catch {
        try {
            $message = [System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
            $context.Response.StatusCode = 500
            $context.Response.ContentType = 'text/plain; charset=utf-8'
            $context.Response.OutputStream.Write($message, 0, $message.Length)
            $context.Response.Close()
        }
        catch {}
    }
}
