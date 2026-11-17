#!/bin/bash
# Backup diário do banco SQLite do AutoRecurso.
# Usa a API de backup do SQLite dentro do container (seguro com o banco em uso/WAL),
# confere a integridade, comprime e mantém os últimos N dias.
#
# Uso:    ./scripts/backup-db.sh
# Agenda: 30 3 * * * /root/auto-recurso/scripts/backup-db.sh >> /var/log/autorecurso-backup.log 2>&1
# Restaurar: docker-compose down; gunzip -c <backup>.db.gz > server/data/autorecurso.db; rm -f server/data/autorecurso.db-wal server/data/autorecurso.db-shm; docker-compose up -d

set -euo pipefail

CONTAINER="${CONTAINER:-auto-recurso-backend}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/auto-recurso}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP_NAME="backup-tmp-$STAMP.db"

# O banco guarda CPF/CNH de clientes: só o dono do servidor pode ler os backups.
umask 077
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] Iniciando backup..."

docker exec -e TMP_NAME="$TMP_NAME" "$CONTAINER" node -e '
const Database = require("better-sqlite3");
const src = new Database(process.env.DB_PATH || "/app/data/autorecurso.db", { readonly: true });
const dest = "/app/data/" + process.env.TMP_NAME;
src.backup(dest).then(() => {
  const copy = new Database(dest, { readonly: true });
  const r = copy.pragma("integrity_check", { simple: true });
  copy.close(); src.close();
  if (r !== "ok") { console.error("integrity_check falhou:", r); process.exit(2); }
}).catch(e => { console.error(e); process.exit(1); });
'

# O volume do container é ./server/data no host
mv "$PROJECT_DIR/server/data/$TMP_NAME" "$BACKUP_DIR/autorecurso-$STAMP.db"
rm -f "$PROJECT_DIR/server/data/$TMP_NAME-wal" "$PROJECT_DIR/server/data/$TMP_NAME-shm"
gzip -f "$BACKUP_DIR/autorecurso-$STAMP.db"
chmod 600 "$BACKUP_DIR/autorecurso-$STAMP.db.gz"

# Retenção
find "$BACKUP_DIR" -name 'autorecurso-*.db.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date '+%F %T')] OK: $BACKUP_DIR/autorecurso-$STAMP.db.gz ($(du -h "$BACKUP_DIR/autorecurso-$STAMP.db.gz" | cut -f1))"
