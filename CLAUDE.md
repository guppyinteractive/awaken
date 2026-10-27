# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install
npm run dev      # dev server on the local network (--host)
npm test         # rules engine and storage tests (Vitest)
npm run build    # type-check and build to dist/
```

Pushing `main` deploys: `.github/workflows/deploy.yml` tests, builds, and
publishes `dist/` to GitHub Pages at www.guppyinteractive.com/primal/.

## Architecture Overview

Static multi-page PWA (Vite + TypeScript, no UI framework, no backend). Each
device keeps its own state; there is no sync or accounts.

- `src/engine/` — fight rules as pure functions returning `{fight, events}`, with tests.
- `src/landing/`, `src/fight/`, `src/hunters/`, `src/campaign/` — one folder per page;
  each renders with `innerHTML` and handles clicks by `data-act` delegation.
- `src/shared/` — wireframe styles, helpers, component names (`game.ts`), and saved data
  (`store.ts`: versioned IndexedDB records; a format change needs an upgrade step and a fixture).
- `src/sw/` — the offline service worker; `vite.config.ts` writes `dist/sw.js` with every built file to cache.
- `design/ux-plan.md` — the living UX plan. Record decisions in its decision log.

## Conventions & Patterns

- Game content: component names from the sheets are fine as plain labels. Never commit
  game art, icons, logos, or rulebook/card text; state hints are in our own words with
  a page reference. `rules/` and `design/reference/` are git-ignored and must stay so.
- Keep the "Unofficial fan-made tool" disclaimer on every page.
- Every page must work in portrait and landscape at phone width with no horizontal scroll.
