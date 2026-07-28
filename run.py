import socket

from app import create_app

app = create_app()


def _local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    host = "0.0.0.0"
    port = 5000
    ip = _local_ip()
    print("Wardrobe Tracker")
    print(f"  Local:   http://127.0.0.1:{port}")
    print(f"  Network: http://{ip}:{port}")
    print("Press Ctrl+C to stop.")
    app.run(host=host, port=port, debug=False)
