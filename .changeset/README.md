# Changesets

## Usage

```bash
pnpm changeset          # Create a new changeset (interactive)
pnpm changeset add      # Same as above
pnpm run version        # Version packages and update changelogs
pnpm changeset status   # Check pending changesets
```

## Workflow

1. After making changes, run `pnpm changeset` and select the bump type
2. Commit the generated `.md` file with your changes
3. When merged to `main`, CI creates a "Version Packages" PR
4. Merging that PR versions the package, generates changelog, and creates a git tag
5. The tag triggers binary release builds

## Policy

- Only `@vncsleal/quillby` is published. All `@quillby/*` packages are private.
- Private packages are also version-bumped (necessary because changesets requires consistent versioning across the dependency chain). These bumps are internal-only — they never get published or tagged.
- Semver: follow semantic versioning (major/minor/patch).
- CHANGELOG.md: auto-generated from changeset descriptions (only for packages with changeset files).

## Tag Format

The version workflow creates a `vX.Y.Z` git tag on release. This matches the existing binary release workflow (`release.yml`) which triggers on `v*` tags.
