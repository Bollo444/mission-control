# Landing page — deploy (Contabo VPS, or any Linux server)

The landing page is a **self-contained static site** in this `site/` folder
(`index.html` + `banner.svg`). Serve it with any web server. The easiest is
**Caddy** — it provisions HTTPS automatically.

## Prerequisites
- A domain (e.g. `missioncontrol.example.com`) with an **A record** → your VPS's
  public IP.
- Ports **80** and **443** open on the VPS firewall.

## 1. Get the files on the server
```bash
ssh user@your-contabo-ip
sudo git clone https://github.com/Bollo444/mission-control.git /opt/mission-control
# to update later:  cd /opt/mission-control && git pull
```

## 2. Install Caddy
```bash
sudo apt update && sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 3. Point Caddy at the static folder
Replace `/etc/caddy/Caddyfile` with:
```
missioncontrol.example.com {
    root * /opt/mission-control/site
    file_server
    encode gzip
}
```
Then reload:
```bash
sudo systemctl reload caddy
```
Visit `https://missioncontrol.example.com` — TLS is issued automatically.

## Updating the page
```bash
cd /opt/mission-control && git pull   # static files update instantly, no restart
```

## Alternatives
- **Nginx**: `server { root /opt/mission-control/site; ... }` + `certbot` for TLS.
- **No domain yet?** Test over plain HTTP first:
  `cd /opt/mission-control/site && python3 -m http.server 8080` → `http://<vps-ip>:8080`.
