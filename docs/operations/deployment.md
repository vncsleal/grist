# Self-Hosted Deployment

This guide covers deploying Quillby in **self-hosted (HTTP) mode** — your own server, behind your own reverse proxy, with persistent storage, backups, and monitoring.

## Prerequisites

- Docker & Docker Compose (v2+)
- A domain name pointing to your server (for TLS)
- 1 GB RAM, 1 CPU minimum
- Ports 80/443 (reverse proxy) and optionally 3000 (direct)

## Quick Start

```bash
# 1. Clone or download Quillby
git clone https://github.com/vncsleal/quillby.git
cd quillby/infra/docker

# 2. Configure
cp .env.example .env
# Edit .env — at minimum set BETTER_AUTH_SECRET
# Generate with: openssl rand -base64 32

# 3. Start
docker compose up -d

# 4. Create your first user and API key
docker exec -it quillby node /app/dist/cli/keys.js create-user admin@example.com "Your Password" "Admin User"
docker exec -it quillby node /app/dist/cli/keys.js create <userId> quillby-connector
```

The second command prints the API key — copy it now, it is only shown once.

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `QUILLBY_TRANSPORT` | — | `http` | Transport mode. Must be `http` for self-hosted. |
| `PORT` | — | `3000` | Internal HTTP port (behind reverse proxy) |
| `QUILLBY_HTTP_HOST` | — | `0.0.0.0` | Bind address |
| `QUILLBY_BASE_URL` | **Yes** | `http://localhost:3000` | Public URL of your instance. Used for CORS, redirects, and MCP agent discovery. Must include protocol and no trailing slash. |
| `BETTER_AUTH_SECRET` | **Yes** | — | Auth signing key. Generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | — | `http://localhost:3000` | Must match QUILLBY_BASE_URL in production |
| `QUILLBY_AUTH_DB_URL` | — | `file:/data/quillby-auth.db` | Local SQLite or remote libSQL/Turso URL |
| `LIBSQL_AUTH_TOKEN` | — | — | Required when using remote Turso as auth DB |
| `QUILLBY_RATE_LIMIT` | — | `60` | Default max requests/minute for new API keys |
| `QUILLBY_DEPLOYMENT_MODE` | — | `self-hosted` | Set automatically by docker-compose |
| `QUILLBY_SMTP_HOST` | — | — | SMTP server for email verification + password reset |
| `QUILLBY_SMTP_PORT` | — | `587` | SMTP port |
| `QUILLBY_SMTP_USER` | — | — | SMTP username |
| `QUILLBY_SMTP_PASS` | — | — | SMTP password |
| `QUILLBY_SMTP_FROM` | — | — | From address for outgoing emails |
| `QUILLBY_PROVIDER_ENCRYPTION_KEY` | — | — | Encrypts provider API keys stored via Settings UI. Generate: `openssl rand -base64 32` |
| `QUILLBY_REPLICATE_API_TOKEN` | — | — | Single token for image/audio/video generation via Replicate |
| `QUILLBY_OPENAI_API_KEY` | — | — | For GPT-Image generation |
| `QUILLBY_ELEVENLABS_API_KEY` | — | — | For ElevenLabs TTS + voice cloning |
| `QUILLBY_FAL_API_KEY` | — | — | For fal.ai Kling video generation |

## Reverse Proxy

Quillby exposes HTTP on port 3000. In production, put it behind a reverse proxy for TLS termination.

### Caddy (recommended — automatic TLS)

```caddyfile
quillby.example.com {
    reverse_proxy quillby:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name quillby.example.com;

    ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik (Docker-native)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.quillby.rule=Host(`quillby.example.com`)"
  - "traefik.http.services.quillby.loadbalancer.server.port=3000"
```

## Health Checks

The container includes a health check at `/health`:

```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":1234}
```

## MCP Client Configuration

See [MCP.md](../MCP.md) for client-specific setup guides.

For a remote self-hosted instance, configure your MCP client with the HTTP URL of the `/mcp` endpoint:

```json
{
  "mcpServers": {
    "quillby": {
      "type": "url",
      "url": "https://quillby.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

## Container Lifecycle

```bash
# View logs
docker compose logs -f quillby

# Restart
docker compose restart quillby

# Stop
docker compose down

# Stop + remove volume (destroys all data)
docker compose down -v

# Rebuild from source (after pulling new code)
docker compose build --no-cache quillby
```

## User & Key Management

```bash
# Create user
docker exec -it quillby node /app/dist/cli/keys.js create-user <email> <password> <name>

# Create API key
docker exec -it quillby node /app/dist/cli/keys.js create <userId> <description>
```
