[![Mothlight](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![Rank](https://make.fun/badge/best-game-01/renxweb3/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01)
[![Reward](https://make.fun/badge/best-game-01/renxweb3/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01)

# Mothlight

**Mothlight — the last night of the luna moth.** An original arcade game: you are a luna moth in a moonlit garden. Dawn comes in 90 seconds; bloom all 7 moonflowers before dawn by gathering light orbs. Bats cross the garden — a hit costs one of 3 lives; dashing through a bat scares it away.

Built for the [Make.fun bounty "Make the best game"](https://make.fun/bounty/best-game-01) (best-game-01).

## How to play

- **Steer**: mouse, arrow keys, or WASD — the moth follows with lag.
- **Dash**: Space or click — a burst of speed (1.2 s cooldown). Dashing through a bat scares it (+25).
- **Goal**: 4 orbs fill the glow ring, then touch a moonflower to bloom it (+500). Orbs collected within 2 s of each other build a combo multiplier (up to x5).
- **Win**: all 7 moonflowers bloomed before dawn → victory screen; Space starts a harder next night.
- **Lose**: dawn arrives with flowers unbloomed, or all 3 lives lost → game-over screen; R restarts.
- **P** pause · **M** mute · **R** restart · **Enter/Space/click** confirm on menus.

HUD: score, night, 7 flower dots, 3 lives, dawn bar, glow ring around the moth, dash-cooldown arc, combo text. Best score is kept in localStorage.

All art is drawn on canvas and all sound is synthesized WebAudio — no external assets, no network requests.

## Run it

Serve the game locally:

```sh
node serve.ts
# then open http://localhost:8080
```

Or build the entry output (what `main.ts` hands in):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22) validates the entry against the scorer's caps, copies `game/` and `screenshots/` to the output directory, and writes `dossier.json` with the vendored make.fun library.

## Screenshots

- `screenshots/1-play.jpg` — mid-gameplay with full HUD
- `screenshots/2-start.jpg` — title screen
- `screenshots/3-win.jpg` — victory ("DAWN BLOOMS!")
- `screenshots/4-end.jpg` — game over ("THE NIGHT ENDS")

## License

MIT — see [LICENSE](LICENSE).
