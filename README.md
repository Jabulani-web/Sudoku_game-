# Sudoku — nine numbers, one clean line of logic

A dependency-free browser Sudoku with a daily challenge, level progression,
auto-notes, unlimited undo and a full keyboard mode.

**Play it live:** https://3000-662b0a29-d08f-470e-b6ab-6be64c5ef97c.daytonaproxy01.net

## What's in the game

- **Daily challenge** — one seeded grid per date, identical for everyone, with a
  streak counter that survives browser restarts.
- **Guaranteed unique puzzles** — grids are carved digit by digit only while a
  solver still finds exactly one solution, so no "valid but marked wrong" answers.
- **Undo** every move, including notes and hints.
- **Auto-notes** — fills each empty square with its live candidates and keeps them
  in sync as you play.
- **Levels and XP** — score every solve from time, mistakes and hints; level up,
  and keep personal bests for Easy, Medium, Hard and Daily.
- **Pause** with the board hidden, plus hints, mistake tracking and a clean result
  summary with score, new bests and XP earned.
- **Light and dark themes**, responsive layout, and keyboard controls
  (`1–9`, arrows, `Backspace`, `N`, `U`/`Ctrl+Z`, `H`, `P`).

## Run locally

No dependencies, just Node:

```bash
node server.js          # http://localhost:3000
node server.js --build  # static bundle in dist/
```

Or use the package scripts: `npm run dev`, `npm run build`.

## Hosting

The game is plain HTML, CSS and JavaScript, so `dist/` can be served by any static
host. In Freebuff, press **Deploy** once to choose a domain; after that,
`freebuff-deploy start` redeploys the latest commit.
