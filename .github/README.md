# GitHub Onboarding

If you just cloned this repository, run:

```bash
npm install
npm run init
```

`npm run init` walks you through an interactive setup: it builds `config/context.md` from your answers, seeds `config/rss_sources.txt`, and personalizes all agent prompts in `config/prompts/*.local.txt`. Nothing tracked in git is changed.

Re-running `npm run init` is safe — it detects existing files and asks before overwriting.
