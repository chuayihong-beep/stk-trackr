"""Regression test: a real Scrapling fetch must not print the URL (it carries watchlist names)."""
import contextlib
import http.server
import io
import logging
import sys
import threading
import unittest


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = b'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>'
        self.send_response(200)
        self.send_header("Content-Type", "application/rss+xml")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class NoLeakTest(unittest.TestCase):
    def test_fetch_prints_nothing(self):
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Quiet)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{server.server_address[1]}/rss/search?q=%22SecretCompanyName%22"
        out, err = io.StringIO(), io.StringIO()
        # Capture both the Python streams and any handler bound to the original stderr.
        root_handlers = logging.getLogger().handlers[:]
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                from stk_collector.sources import scrapling_fetch
                for h in logging.getLogger("scrapling").handlers:
                    h.setStream(sys.stderr)  # point existing handlers at the capture
                status, _ = scrapling_fetch(url)
        finally:
            server.shutdown()
            logging.getLogger().handlers = root_handlers
        self.assertEqual(status, 200)
        captured = out.getvalue() + err.getvalue()
        self.assertNotIn("SecretCompanyName", captured)
        self.assertNotIn("/rss/search", captured)


if __name__ == "__main__":
    unittest.main()
