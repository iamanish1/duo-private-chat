#!/usr/bin/env bash
# Everyday commands for the production server. Run from anywhere inside the repo.
#   ./deploy/duo.sh up        build and start everything
#   ./deploy/duo.sh update    pull the latest code from git and restart
#   ./deploy/duo.sh seed      create the two accounts (asks for passwords)
#   ./deploy/duo.sh logs      follow app logs (Ctrl+C to stop)
#   ./deploy/duo.sh status    show running containers
#   ./deploy/duo.sh backup    dump the database + uploads to ~/duo-backups
#   ./deploy/duo.sh restore <file.archive.gz>   restore a database backup
#   ./deploy/duo.sh down      stop everything (data is kept)
set -euo pipefail

cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "Missing .env — run: cp deploy/env.production.example .env" >&2; exit 1; }

# Values coturn needs about this machine's network (auto-detected).
export PRIVATE_IP="${PRIVATE_IP:-$(hostname -I | awk '{print $1}')}"
export PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS --max-time 5 https://api.ipify.org || true)}"

compose() { docker compose -f deploy/docker-compose.yml --env-file .env "$@"; }
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }

check_env() {
  local missing=()
  for key in DOMAIN JWT_SECRET AUTHORIZED_USER_1_EMAIL AUTHORIZED_USER_2_EMAIL TURN_SHARED_SECRET; do
    [[ -n "$(env_value "$key")" ]] || missing+=("$key")
  done
  if ((${#missing[@]})); then
    echo "Fill these in .env first: ${missing[*]}" >&2
    exit 1
  fi
  [[ -n "$PUBLIC_IP" ]] || { echo "Could not detect the public IP; set PUBLIC_IP=... and retry." >&2; exit 1; }
}

case "${1:-}" in
  up)
    check_env
    compose up -d --build
    echo
    echo "Duo is starting at https://$(env_value DOMAIN)"
    echo "First start can take a minute while the HTTPS certificate is issued."
    ;;
  update)
    check_env
    git pull --ff-only
    compose up -d --build
    docker image prune -f >/dev/null
    echo "Updated."
    ;;
  seed)
    read -rp "Password for $(env_value AUTHORIZED_USER_1_EMAIL): " -s P1; echo
    read -rp "Password for $(env_value AUTHORIZED_USER_2_EMAIL): " -s P2; echo
    compose exec -T -e AUTHORIZED_USER_1_PASSWORD="$P1" -e AUTHORIZED_USER_2_PASSWORD="$P2" app node server/scripts/seed.js "${@:2}"
    ;;
  logs)
    compose logs -f --tail=100 "${2:-app}"
    ;;
  status)
    compose ps
    ;;
  backup)
    dir="$HOME/duo-backups"
    mkdir -p "$dir"
    stamp="$(date +%Y%m%d-%H%M%S)"
    compose exec -T mongo mongodump --db duo --archive --gzip > "$dir/duo-$stamp.archive.gz"
    compose exec -T app tar -czf - -C /data uploads > "$dir/uploads-$stamp.tar.gz"
    find "$dir" -name 'duo-*.archive.gz' -mtime +14 -delete
    find "$dir" -name 'uploads-*.tar.gz' -mtime +14 -delete
    echo "Backup saved in $dir ($stamp)"
    ;;
  restore)
    [[ -f "${2:-}" ]] || { echo "Usage: ./deploy/duo.sh restore <duo-....archive.gz>" >&2; exit 1; }
    read -rp "This replaces the current database. Type 'yes' to continue: " ok
    [[ "$ok" == "yes" ]] || exit 1
    compose exec -T mongo mongorestore --drop --archive --gzip < "$2"
    echo "Restored."
    ;;
  down)
    compose down
    ;;
  *)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac
