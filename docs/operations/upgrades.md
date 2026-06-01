# Upgrades

## Standard Upgrade

```bash
cd path/to/quillby/infra/docker
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. No manual migration commands are needed for standard upgrades.

## How Migrations Work

On every startup, the server calls `ensureHostedTables()` which:

1. Checks if a `_schema_version` table exists in the auth database.
2. If not, creates it and runs all pending migrations sequentially.
3. Logs each migration step with its version number.
4. If a migration fails, the server exits with a non-zero code — the container will restart and retry.

Check migration status from the logs:

```bash
docker compose logs quillby | grep -i migration
```

## Manual Migration

If you need to run migrations manually (e.g., during debugging):

```bash
docker exec -it quillby node /app/dist/cli/migrate.js
```

## Major Version Upgrades

1. **Read the release notes** — breaking changes are documented in the changelog.
2. **Back up your data** before upgrading (see [backups.md](backups.md)).
3. **Pull the new image** and restart:
   ```bash
   docker compose pull && docker compose up -d
   ```
4. **Verify** the server is healthy:
   ```bash
   curl http://localhost:3000/health
   ```
5. **Check the logs** for any migration warnings or errors:
   ```bash
   docker compose logs quillby | tail -50
   ```

## Rollback

If an upgrade fails:

1. Stop the container:
   ```bash
   docker compose down
   ```
2. Restore the previous image tag (if using a specific tag):
   ```bash
   # In docker-compose.yml, set image: vncsleal/quillby:<previous-version>
   docker compose pull
   docker compose up -d
   ```
3. If you use `latest`, pull the previous version explicitly:
   ```bash
   docker pull vncsleal/quillby:<previous-version>
   docker tag vncsleal/quillby:<previous-version> vncsleal/quillby:latest
   docker compose up -d
   ```

## Breaking Changes Policy

Breaking changes are communicated via:
- **GitHub releases** — annotated with `BREAKING` prefix
- **Changelog** — kept in `CHANGELOG.md` at the repository root
- **Migration notes** — included in the release body

Before a major version bump (v1 → v2, etc.), a deprecation notice will be posted at least one minor version in advance.
