# Disaster Recovery

## Scenarios

### 1. Corrupted Auth Database

**Symptoms:** Server fails to start; logs show database errors.

**Resolution:**

```bash
# 1. Stop the container
docker compose down

# 2. Restore from the most recent backup
# (see backups.md for restore procedures)

# 3. If no backup exists, create a fresh database and re-create users
docker compose up -d
docker exec -it quillby node /app/dist/cli/keys.js create-user admin@example.com "new-password" "Admin"
```

### 2. Lost Docker Volume

**Symptoms:** Container starts but no users or data exist.

**Resolution:**

```bash
# 1. Check if volume still exists
docker volume ls | grep quillby_data

# 2. If missing, restore from backup (see backups.md)

# 3. If no backup exists:
docker compose up -d
# Re-create users and API keys via the CLI
```

### 3. Failed Migration

**Symptoms:** Server exits on startup; logs show migration error.

**Resolution:**

```bash
# 1. Check the migration error
docker compose logs quillby | grep -i "migration\|error"

# 2. Roll back to the previous version (see upgrades.md)

# 3. If the migration partially applied, restore from backup first
# then roll back the version
```

### 4. Hardware Failure

**Symptoms:** Server is unreachable; data may be on corrupted disk.

**Resolution:**

1. Provision a new server.
2. Install Docker and Docker Compose.
3. Copy the backup archive to the new server.
4. Restore the data volume:
   ```bash
   # Create the volume
   docker volume create quillby_data

   # Restore backup into it
   docker run --rm -v quillby_data:/data -v /path/to/backup:/backup alpine \
     tar xzf /backup/quillby-backup-20260101-120000.tar.gz -C /
   ```
5. Start the container:
   ```bash
   docker compose up -d
   ```

### 5. Misconfiguration

**Symptoms:** Server starts but behaves incorrectly (wrong URL, auth errors, CORS issues).

**Resolution:**

1. Check the environment:
   ```bash
   docker compose config
   ```
2. Verify key settings:
   - `QUILLBY_BASE_URL` matches the actual public URL.
   - `BETTER_AUTH_URL` matches `QUILLBY_BASE_URL`.
   - `BETTER_AUTH_SECRET` is set.
3. Restart after fixing:
   ```bash
   docker compose restart quillby
   ```

## Complete Rebuild from Scratch

If all data is lost, start fresh:

```bash
# 1. Destroy everything
docker compose down -v

# 2. Start clean
docker compose up -d

# 3. Create admin user
docker exec -it quillby node /app/dist/cli/keys.js create-user admin@example.com "password" "Admin"

# 4. Create an API key
docker exec -it quillby node /app/dist/cli/keys.js create <userId> quillby-connector
```

## Prevention Checklist

- [ ] Automated daily backups configured (see [backups.md](backups.md))
- [ ] Backup retention policy set (minimum 30 days)
- [ ] Off-site backup copy configured (rclone, S3, or similar)
- [ ] Health check monitoring in place
- [ ] Restore procedure tested at least quarterly
- [ ] Reverse proxy timeout configured (recommended: 60s for MCP long-polling)
