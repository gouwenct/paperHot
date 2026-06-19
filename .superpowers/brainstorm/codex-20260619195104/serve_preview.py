from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HTML_FILE = ROOT / "content" / "paperhot-config-interactive-cn.html"
HOST = "127.0.0.1"
PORT = 50652


class Handler(BaseHTTPRequestHandler):
    def _send_html_headers(self, data_length):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(data_length))
        self.end_headers()

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        data = HTML_FILE.read_bytes()
        self._send_html_headers(len(data))
        self.wfile.write(data)

    def do_HEAD(self):
        data_length = HTML_FILE.stat().st_size
        self._send_html_headers(data_length)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"paperHOT preview: http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()
