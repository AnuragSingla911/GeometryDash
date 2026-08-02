# Robot Rush

A fast, colourful 2D side-scrolling platformer inspired by the feel of Geometry Dash — built entirely with **HTML, CSS, and JavaScript** using the HTML5 Canvas API. No frameworks, no build step, no copyrighted assets.

**Play online:** [https://anuragsingla911.github.io/GeometryDash/](https://anuragsingla911.github.io/GeometryDash/)

Your futuristic robot runs automatically. Jump, double-jump, collect coins, grab power-ups, and survive desert roads, neon cities, and dangerous factories as the pace ramps up.

## Difficulty

Choose **Easy**, **Medium**, or **Hard** on the start screen. Difficulty mainly changes the robot’s running speed (and spawn pacing):

| Level | Base speed | Feel |
|-------|------------|------|
| Easy | Slow | Learning / kids |
| Medium | Classic | Balanced |
| Hard | Fast | Expert |

Scores are tracked separately per difficulty when you are logged in.

## Accounts & database (no server)

Robot Rush uses a **JSON database** that works on GitHub Pages with no backend:

1. **localStorage** — instant create / login and progress on this device  
2. **`data/db.json`** — shared database file deployed with the site (readable by everyone)  
3. **Optional GitHub sync** — paste a fine-grained PAT (Contents write on this repo) under Account → Cloud sync to publish `data/db.json` back to GitHub so you can manage accounts and the leaderboard in the repo

Saved per account:

- High score / best distance / coins for Easy, Medium, and Hard  
- Total coins, games played, furthest environment, last difficulty  

Passwords are salted SHA-256 hashes (never stored in plain text).

### Enable cloud sync (optional)

1. Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens) with **Contents: Read and write** on `AnuragSingla911/GeometryDash` only.  
2. In the game: **Account → Cloud sync** → paste the token → **Save Token & Sync**.  
3. The token stays in your browser `localStorage` (not committed). You can also put it in `data/config.json` as `githubToken` for your own private fork (do not commit secrets to a public repo).

You can also **Export Save JSON** from the Account screen and commit it as `data/db.json` manually.

## How to run

### Online (GitHub Pages)

Open: [https://anuragsingla911.github.io/GeometryDash/](https://anuragsingla911.github.io/GeometryDash/)

The site deploys automatically from `main` to the `gh-pages` branch (same pattern as [21Dares](https://anuragsingla911.github.io/21Dares/)).

### Locally

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge).
2. That’s it — no server or install required.

Optional local server (useful for some browsers’ audio policies):

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080`.

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Jump | `Space`, `↑`, or mouse click | Tap the screen |
| Double jump | Jump again while airborne | Tap again in air |
| Pause / Resume | `P` or pause button | Pause button |
| Restart | `R` or Restart button | Restart button |
| Sound toggle | Sound button on menu / HUD | Same |

Page scrolling is blocked when Space / Arrow keys are used during play.

## Game rules

- The robot **runs automatically** from left to right.
- Avoid ground and flying obstacles; one hit ends the run (unless a **Shield** is active).
- **Score** grows with distance travelled; **coins** add bonus points.
- Collect coins in a row for a **combo bonus**.
- Every **500 points**, a milestone banner appears.
- Difficulty rises over time: speed, spawn rate, and pattern complexity increase.
- Impossible patterns are avoided by spacing obstacles with enough room to jump or double-jump.
- Fast cars, planes, and rockets show a **warning** before they enter.

### Environments (auto-progress)

1. **Desert Road** — sand dunes, cacti, rocks, aeroplanes, warm sunset
2. **Futuristic City** — roads, cars, buildings, drones, neon, night sky
3. **Dangerous Factory** — metal, fire, saws, pipes, flying machines

### Power-ups

| Power-up | Effect |
|----------|--------|
| Shield | Survive one collision |
| Magnet | Pulls nearby coins |
| Slow-Mo | Temporarily slows obstacles |
| Jetpack | Short flight |
| Super Jump | Higher jumps for a few seconds |

High score is stored in `localStorage` under `robotRushHighScore`.

## Code structure

| File | Role |
|------|------|
| `index.html` | Canvas, start / pause / game-over screens, HUD |
| `style.css` | Layout, responsive UI, buttons, overlays |
| `script.js` | Entire game engine (modules below) |
| `README.md` | This document |

### Classes in `script.js`

| Class | Responsibility |
|-------|----------------|
| `AudioManager` | Web Audio synth SFX + simple music; mute-safe |
| `InputManager` | Keyboard, mouse, touch; jump queue |
| `Particle` | Sparks, smoke, dust, coin bursts |
| `Robot` | Physics, animations, hitbox, trail |
| `Obstacle` | All obstacle types + drawing |
| `ObstacleManager` | Fair spawning, difficulty, warnings |
| `Coin` | Collectibles + magnet behaviour |
| `PowerUp` | Pickup gems |
| `Background` | Parallax layers, env transitions, day/night |
| `UIManager` | Screens, HUD, sound buttons |
| `Game` | Loop, scoring, collisions, state machine |

The game loop uses `requestAnimationFrame` and **delta time** so movement stays consistent across devices. The canvas letterboxes a logical `960×540` view and scales to mobile, tablet, and desktop.

## Adding new obstacles

1. Add a case in `Obstacle._initByType()` for size / position / motion.
2. Add a matching branch in `Obstacle.draw()` (and optional `_drawYourThing`).
3. Tune `get hitbox()` if the art needs a tighter box.
4. Register the type string in `ObstacleManager._pickPattern()` ground or flying lists for the right environment(s).
5. If it moves in very fast, set `needsWarning = true` and optionally `extraSpeed`.

Example sketch:

```js
case "boulder":
  this.w = 48; this.h = 48; this.y = GROUND_Y - this.h;
  break;

// in draw():
case "boulder":
  this._drawBoulder(ctx);
  break;

// in _pickPattern grounds array:
"boulder",
```

## Adding new environments

1. Add an entry to `ENVIRONMENTS` with `id`, `name`, and `unlockAt` score.
2. Extend `Background._drawSky`, `_drawFar`, `_drawMid`, `_drawNear`, and `_drawGround` with a branch for the new `env` id.
3. Add ground / flying obstacle pools for that id in `ObstacleManager._pickPattern()`.

## Audio notes

Sound is generated with the **Web Audio API** (no external files). If audio is blocked or unavailable, gameplay continues silently. Toggle with the sound buttons; preference is saved as `robotRushSound`.

## License

Original game code and artwork (Canvas-drawn). Not affiliated with Geometry Dash or its publishers. Do not use copyrighted Geometry Dash characters, art, or music.
