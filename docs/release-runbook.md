# Release Runbook — Local Mode

## Prerequisites

- [ ] `NPM_TOKEN` secret set in GitHub repository
- [ ] `GITHUB_TOKEN` has `contents: write` and `id-token: write` permissions
- [ ] Local build passes: `pnpm build && pnpm test:unit`
- [ ] No uncommitted changes in the working tree

## Steps

### 1. Create changeset

```bash
pnpm changeset
# Select @vncsleal/quillby, minor bump, describe changes
```

Or create manually: add a `.md` file in `.changeset/` with frontmatter and description.

### 2. Commit and push to main

```bash
git add .changeset/
git commit -m "chore: add changeset for release"
git push origin main
```

Create a PR to `main`, merge it.

### 3. Version bump PR is auto-created

After merge, the `version.yml` workflow runs:
- Bumps `@vncsleal/quillby` version in `package.json`
- Creates a "Version Packages" PR
- When merged, creates git tag `v<version>`

### 4. Tag triggers release

The `release.yml` workflow runs on `v*` tag push:

| Job | Produces | Time |
|-----|----------|------|
| `build-macos` | `quillby-macos.pkg`, `quillby-macos.dmg`, arch binaries | ~5 min |
| `build-windows` | `quillby-windows.exe`, arch binary | ~5 min |
| `build-linux` | `quillby-mcp-linux-x64`, smoke tested | ~3 min |
| `publish-npm` | `@vncsleal/quillby` published to npm | ~2 min |

### 5. Verify release

- [ ] GitHub Release created with all artifacts
- [ ] `npm info @vncsleal/quillby` shows new version
- [ ] Download `.dmg` or `.pkg` from release, install on macOS, test
- [ ] `npx -y @vncsleal/quillby quillby-mcp` works on any platform

## Post-release

- [ ] Update the site if needed (download URLs already use `/latest/download/`)
- [ ] Announcement (if applicable)

## Rollback

If a release breaks:

1. `npm unpublish @vncsleal/quillby@<version>` (within 72h)
2. Delete the GitHub Release and tag
3. Fix the issue, create a new changeset
