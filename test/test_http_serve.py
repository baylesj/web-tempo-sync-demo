import os
import http.server
import socketserver
import urllib.request
import threading
import time

os.environ['no_proxy'] = '127.0.0.1,localhost'

PORT = 8124
handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
t = threading.Thread(target=httpd.serve_forever)
t.daemon = True
t.start()
time.sleep(0.5)

proxy_handler = urllib.request.ProxyHandler({})
opener = urllib.request.build_opener(proxy_handler)

try:
    res = opener.open(f'http://127.0.0.1:{PORT}/index.html')
    print('index.html status:', res.status)
    content = res.read().decode('utf-8')
    assert '<title>Web Tempo Sync</title>' in content

    for path in ['css/style.css', 'js/fake-session.js', 'js/audio.js', 'js/beat-ring.js', 'js/sampler-ui.js', 'js/highlight.js', 'js/app.js']:
        r = opener.open(f'http://127.0.0.1:{PORT}/{path}')
        print(f'{path}: {r.status} ({len(r.read())} bytes)')

    print('All static assets served successfully!')
finally:
    httpd.shutdown()

