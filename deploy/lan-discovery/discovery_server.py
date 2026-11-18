import json
import os
import socket


def detect_lan_ip() -> str:
    explicit = os.environ.get("POS_DISCOVERY_LAN_IP", "").strip()
    if explicit:
        return explicit
    for target in (("8.8.8.8", 80), ("192.168.1.1", 80), ("10.0.0.1", 80)):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.connect(target)
            ip = sock.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
        except OSError:
            pass
        finally:
            sock.close()
    return "127.0.0.1"


def main() -> None:
    listen_port = int(os.environ.get("POS_DISCOVERY_PORT", "13535"))
    org_web_port = int(os.environ.get("ORG_WEB_PORT", "13000"))

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.bind(("0.0.0.0", listen_port))
    print(f"[pos-lan-discovery] listening on UDP 0.0.0.0:{listen_port} (web port {org_web_port})", flush=True)

    while True:
        try:
            data, addr = sock.recvfrom(1024)
            msg = data.decode("utf-8", errors="ignore").strip()
            if not msg.startswith("POS_DISCOVER"):
                continue

            lan_ip = detect_lan_ip()
            explicit_url = os.environ.get("POS_DISCOVERY_SERVER_URL", "").strip()
            server_url = explicit_url or f"http://{lan_ip}:{org_web_port}"

            payload = json.dumps(
                {
                    "service": "pos-platform",
                    "version": "1.0",
                    "server_url": server_url,
                    "lan_ip": lan_ip,
                    "port": org_web_port,
                }
            ).encode("utf-8")
            sock.sendto(payload, addr)
        except Exception as exc:
            print(f"[pos-lan-discovery] error: {exc}", flush=True)


if __name__ == "__main__":
    main()

