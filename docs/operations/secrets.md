# Secrets & Credential Management

## Audit Status

- **Git history scan (`gitleaks`):** Full git history scanned at audit time (2026-05-21) — **zero secrets found**. ✅
- **`.env` tracking:** Confirmed `.env` was gitignored from the first commit — never entered history. ✅
- **Pre-commit scanning:** `lefthook.yml` runs `gitleaks` on every commit. ✅
- **`.bak-*` files:** Pattern added to `.gitignore` (`*.bak-*`, `*.bak-*/*`). These files (e.g., `quillby-auth.db.bak-*`) are never tracked. ✅

## Where Secrets Live

| Secret Type | Location | How It Gets There |
|---|---|---|
| **Runtime env vars** | `.env` file (root) | Copied from `.env.example`, filled in by operator. |
| **Provider API keys** | `.env` file or stored encrypted via Settings UI | Encrypted at rest using `QUILLBY_PROVIDER_ENCRYPTION_KEY`. |
| **Auth DB** | `quillby-auth.db` (local) or remote Turso | Better Auth manages users/keys in the auth DB. |
| **Better Auth secret** | `BETTER_AUTH_SECRET` in `.env` | Generated with `openssl rand -base64 32`. Required for HTTP mode. |
| **Provider encryption key** | `QUILLBY_PROVIDER_ENCRYPTION_KEY` in `.env` | Generated with `openssl rand -base64 32`. Required for self-hosted provider config via Settings UI. |
| **Remote auth DB token** | `LIBSQL_AUTH_TOKEN` in `.env` | Generated via Turso CLI (`turso db tokens create <db-name>`). Required for remote libSQL/Turso. |
| **Keyring fallback** | `QUILLBY_KEYRING_SECRET` in `.env` | Generated with `openssl rand -base64 32`. Fallback for local mode on non-macOS. |

## Generating Secrets

```bash
# Better Auth secret (required for HTTP mode)
openssl rand -base64 32

# Provider encryption key (required for self-hosted)
openssl rand -base64 32

# Keyring secret (fallback for local mode on non-macOS)
openssl rand -base64 32
```

## Security Rules

1. **Never commit `.env`** — it's in `.gitignore` (confirmed never tracked).
2. **Never commit `*.bak-*` files** — they can contain auth DB data. Pattern is in `.gitignore`.
3. **Pre-commit hooks** (`lefthook.yml`) run `gitleaks` to catch accidental secrets.
4. **Provider keys** are encrypted at rest when configured via the Settings UI (not stored in plaintext).
5. **Auth DB** (`quillby-auth.db`) contains hashed passwords + API key hashes — never plaintext secrets.

## Rotation

- **API keys:** Regenerate via the hosted CLI (`pnpm keys`) or Better Auth admin UI.
- **Provider encryption key:** Re-encrypt all stored configs after rotation (re-save provider configs via Settings UI).
- **Better Auth secret:** Update `BETTER_AUTH_SECRET` and restart. Active sessions will be invalidated.
