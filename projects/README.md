# Projects

Each folder in `projects/` is a standalone Even Realities app, plugin, prototype, or experiment.

## Current Projects

- `even-starter`: Minimal Vite + TypeScript Even Hub starter app.
- `terminal-session`: Terminal-style session buffer renderer for Even Realities G2 glasses.
- `tmux-glasses`: Minimal tmux pane mirror optimized for the G2 text viewport.

## Conventions

- Keep project-specific manifests, build output, and source inside the project folder.
- Keep each project runnable from its own folder with `npm run dev`, `npm run build`, and `npm run pack` when those commands apply.
- Use root scripts for common workflows or projects you open frequently.
- Move duplicated utilities into `shared/` only after a second project needs the same code.
