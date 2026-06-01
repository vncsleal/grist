# Backups

## Local SQLite (Docker Volume)

The default setup stores the auth database in a Docker volume (`quillby_data`).

### One-shot Backup

```bash
docker run --rm -v quillby_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/quillby-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data
```

### Restore

```bash
docker run --rm -v quillby_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/quillby-backup-20260101-120000.tar.gz -C /
docker compose restart quillby
```

### Automated Backup (cron)

Create a cron job on the host:

```crontab
# Daily at 3 AM — keep last 30 backups
0 3 * * * /usr/local/bin/quillby-backup
```

Create `/usr/local/bin/quillby-backup`:

```bash
#!/bin/bash
BACKUP_DIR=/var/backups/quillby
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
docker run --rm -v quillby_data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/quillby-backup-$TIMESTAMP.tar.gz" /data

# Prune old backups
find "$BACKUP_DIR" -name "quillby-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete
```

## Remote libSQL / Turso

### Backup

```bash
turso db shell quillby .dump > quillby-dump-$(date +%Y%m%d).sql
```

### Restore

```bash
# Create a new database from the dump
turso db create quillby-restored
turso db shell quillby-restored < quillby-dump-20260101.sql

# Update your .env to point at the restored database
# QUILLBY_AUTH_DB_URL=libsql://quillby-restored-<org>.turso.io
```

### Automated Backup

```bash
#!/bin/bash
BACKUP_DIR=/var/backups/quillby
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
turso db shell quillby .dump > "$BACKUP_DIR/quillby-dump-$TIMESTAMP.sql"
# Optionally sync off-site
rclone copy "$BACKUP_DIR" remote:backups/quillby/
```

## Verification

Periodically verify your backups by restoring to a temporary location:

```bash
# Restore local backup to temp dir
mkdir /tmp/quillby-restore-test
docker run --rm -v quillby_data:/data -v /tmp/quillby-restore-test:/restore alpine \
  tar xzf /var/backups/quillby/quillby-backup-20260101-120000.tar.gz -C /restore
# Verify the file structure
ls -la /tmp/quillby-restore-test/data/
```
