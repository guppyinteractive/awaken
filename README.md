# Awaken

Unofficial fan-made companion tools for the board game *Primal: The Awakening*, served at **www.guppyinteractive.com/primal/**.

Not affiliated with or endorsed by the game's publisher. Component names from the game's sheets are used as plain labels; the repo contains no game art, icons, logos, or rules text.

- Design: [`design/ux-plan.md`](design/ux-plan.md) (living document)
- Status: in use at the table. The landing page and the fight, hunter, and campaign trackers all work and install as one app; the visual design is still plain grayscale.

## Develop

```sh
npm install
npm run dev      # dev server, also reachable on your local network (--host)
npm test         # rules engine tests (Vitest)
npm run build    # type-check and build to dist/
```

Pushes to `main` are tested, built, and deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Layout

| Path | What |
|---|---|
| `src/engine/` | Fight rules as pure functions, with tests |
| `src/landing/`, `src/fight/`, `src/hunters/`, `src/campaign/` | One folder per page |
| `src/shared/` | Wireframe styles, storage, and shared helpers |
| `design/` | UX plan (`design/reference/` is git-ignored) |
| `rules/` | Rulebook PDFs for reference (git-ignored) |
