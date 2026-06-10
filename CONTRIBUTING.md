# Contributing to Quillby

Thanks for helping improve Quillby.

## Development setup

1. Fork the repo and create a branch from `main`.
2. Install dependencies with `pnpm install`.
3. Validate locally:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test:unit`

## Pull request checklist

- Keep changes focused and small.
- Include a clear problem statement and solution summary.
- Update docs when behavior changes.
- Avoid committing secrets, outputs, or cache files.

## Commit style

Use Conventional Commits: `<type>[scope]: <description>`

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `revert`.

## Reporting bugs and requesting features

- Use issue templates in `.github/ISSUE_TEMPLATE`.
- Include reproduction steps and expected behavior.
- For feature requests, explain workflow impact.
