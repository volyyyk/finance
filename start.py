#!/usr/bin/env python3
# start.py — запускает локальный сервер и открывает браузер
import http.server
import socketserver
import webbrowser
import socket
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.resolve()

def find_free_port(start=8000, end=8100):
    for p in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', p))
                return p
            except OSError:
                continue
    raise RuntimeError('Не нашёл свободный порт в диапазоне 8000–8099')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt, *args):
        pass  # без спама в консоли

def main():
    os.chdir(ROOT)
    port = find_free_port()
    url = f'http://localhost:{port}/index.html'

    try:
        httpd = socketserver.TCPServer(('127.0.0.1', port), Handler)
    except Exception as e:
        print(f'Не удалось запустить сервер: {e}')
        input('Нажмите Enter, чтобы закрыть...')
        return

    print('=' * 50)
    print(f'  Финансовый учёт запущен: {url}')
    print('  Не закрывайте это окно, пока работаете с сайтом.')
    print('  Чтобы остановить — просто закройте окно.')
    print('=' * 50)

    # Открываем браузер через полсекунды, чтобы сервер успел стартовать
    def open_browser():
        time.sleep(0.5)
        try: webbrowser.open(url)
        except Exception: pass
    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nСервер остановлен.')
    finally:
        httpd.server_close()

if __name__ == '__main__':
    main()