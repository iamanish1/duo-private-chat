#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu server (Oracle Cloud Always Free, ARM or x86).
#   sudo bash deploy/setup-server.sh
# Installs Docker, opens the firewall ports Duo needs, and adds swap.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/setup-server.sh" >&2
  exit 1
fi

echo "==> Updating packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git iptables-persistent openssl

echo "==> Installing Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
TARGET_USER="${SUDO_USER:-ubuntu}"
usermod -aG docker "$TARGET_USER"

echo "==> Opening firewall ports (Oracle's Ubuntu image blocks everything except SSH)"
open_port() {
  local proto=$1 port=$2
  if iptables -C INPUT -p "$proto" --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    return
  fi
  # Insert before Oracle's catch-all REJECT rule if there is one; otherwise append.
  local reject_line
  reject_line=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
  if [[ -n "$reject_line" ]]; then
    iptables -I INPUT "$reject_line" -p "$proto" --dport "$port" -m state --state NEW -j ACCEPT
  else
    iptables -A INPUT -p "$proto" --dport "$port" -m state --state NEW -j ACCEPT
  fi
}
open_port tcp 80
open_port tcp 443
open_port udp 443
open_port tcp 3478
open_port udp 3478
open_port udp 49160:49200
netfilter-persistent save

echo "==> Adding 2 GB swap (helps the build on small instances)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Daily backup at 03:30 (keeps 14 days in ~/duo-backups)"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_LINE="30 3 * * * cd $REPO_DIR && ./deploy/duo.sh backup >> /home/$TARGET_USER/duo-backup.log 2>&1"
( crontab -u "$TARGET_USER" -l 2>/dev/null | grep -v 'duo.sh backup' ; echo "$CRON_LINE" ) | crontab -u "$TARGET_USER" -

cat <<EOF

Done. Next:
  1. Log out and back in (so '$TARGET_USER' can use Docker without sudo).
  2. Also open the same ports in Oracle Cloud: VCN → Security List → Ingress rules
     (TCP 80, 443, 3478; UDP 443, 3478, 49160-49200).
  3. cp deploy/env.production.example .env  and fill it in.
  4. ./deploy/duo.sh up
EOF
