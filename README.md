[![Mothlight](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![Rank](https://make.fun/badge/best-game-01/renxweb3/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01)
[![Reward](https://make.fun/badge/best-game-01/renxweb3/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01)

# Mothlight

**Mothlight — the last night of the luna moth.** An original arcade game: you are a luna moth in a moonlit garden. Dawn comes in 90 seconds; bloom all 7 moonflowers before dawn by gathering light orbs. Bats cross the garden — a hit costs one of 3 lives; dashing through a bat scares it away. **Seven nights, not one:** each dawn you clear earns a blessing draft — choose 1 of 3 blessings to carry into the next night — and from night 2 a web-spider crawls to the unbloomed flowers and spins webs that slow your wings. Clear all seven nights to see the last dawn.

Built for the [Make.fun bounty "Make the best game"](https://make.fun/bounty/best-game-01) (best-game-01).

## How to play

- **Steer**: mouse, arrow keys, or WASD — the moth follows with lag.
- **Dash**: Space or click — a burst of speed (1.2 s cooldown). Dashing through a bat scares it (+25).
- **Goal**: 4 orbs fill the glow ring, then touch a moonflower to bloom it (+500). Orbs collected within 2 s of each other build a combo multiplier (up to x5).
- **Web-spider** (from night 2): crawls to the nearest unbloomed flower and spins a web (radius 55 px, lasts 9 s). Flying through a web slows the moth to 0.45× — dash to tear free (+15). Dashing into the spider drives it off for 8 s (+25). A spider's touch costs no life: it shoves you and resets your combo.
- **Blessing draft** (after each night you clear, nights 1–6): choose 1 of 3 blessings — keys **1 / 2 / 3**, arrow keys + Space/Enter to highlight and confirm, or click a card. There are 11 blessings (faster wings, a shield that blocks the first bat hit each night, a longer combo window, webs torn by any dash, and more); each one really changes the rules for the nights that follow. Blessings are lost when a run ends.
- **Campaign**: 7 nights, each harder than the last — faster bats, more bats, more spiders, more webs, and a bat surge at 45 seconds from night 2. The title screen shows a night map of all seven nights and your furthest night; the game-over screen shows a campaign summary. Progress (furthest night, runs, victories, best score) is kept in localStorage.
- **Win**: all 7 moonflowers bloomed before dawn → the night is cleared; clear night 7 to win the campaign.
- **Lose**: dawn arrives with flowers unbloomed, or all lives lost → game-over screen; R restarts a new run.
- **P** pause · **M** mute · **R** restart · **H** how to play · **Q** quit to title from the pause menu · **Enter/Space/click** confirm on menus. The title screen has a HOW TO PLAY button (top right) that opens a help screen with the rules, the dangers, and the whole 11-blessing codex; a night-start banner names each night as it begins, and a low bell warns when 10 seconds of night remain.

HUD: score, night, 7 flower dots, lives, dawn bar with the seconds left, glow ring around the moth, dash-cooldown arc, combo text, and the glyphs of your held blessings. Win and game-over screens show a grade (S–D, from lives kept, time left and score), three stars, and five stats (orbs gathered, moonflowers bloomed, bats scared, dashes, best score). Best score is kept in localStorage.

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

- `screenshots/1-play.jpg` — night 3 gameplay: a web-spider, a web, HUD blessing glyphs
- `screenshots/2-start.jpg` — title screen with the seven-night campaign map
- `screenshots/3-win.jpg` — the blessing draft after clearing a night
- `screenshots/4-end.jpg` — game over with the campaign summary

## License

MIT — see [LICENSE](LICENSE).
