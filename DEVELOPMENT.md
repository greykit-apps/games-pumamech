# Developing PumaMech

Plain scripts, no build step, nothing fetched at play time: every picture is drawn and every sound synthesised in the page; the two typefaces ship with it. `.gitlab-ci.yml` runs `tools/check-assets.js`, a parse of every script, `tools/sim-check.js`, `tools/playthrough.js` and `tools/stamp-assets.js --check` on every branch.

## What's in here

| | |
|---|---|
| `index.html` | the page: the 480×300 field, the title, the note for small screens |
| `css/gk-tokens.css` | the Tactical palette, byte for byte from games-meta `canon/` (STANDARD.md §4) |
| `css/pumamech.css` | the page, the HUD and every sheet: flat dark panels over the field (Airborne Puma's) |
| `fonts/` | Barlow Semi Condensed and Pixelify Sans (SIL Open Font License; the licences are beside them) |
| `js/gk-title.js` | the greykit.games boot, byte for byte from games-meta `canon/` (§3); the title after it is the game's own, in `js/main.js` |
| `js/data.js`, `js/world.js`, `js/story.js` | the tables (weapons, chassis, kit, cast, foes, the Exchange), the world of Pardalis and the Vault, the plot |
| `js/engine/*.js` | the game itself, with no DOM in it: state and saves, walking and encounters, the battle rules, the enemy's mind |
| `js/kit.js`, `js/ground.js`, `js/things.js`, `js/people.js` | Airborne Puma's art kit, ground, installations and people, carried over; `people.js` gains the peoples of Pardalis |
| `js/town.js`, `js/buildings.js`, `js/mechs.js` | paving, roads, the bridge, fields and the Vault's floors; buildings in four towns' styles; the mechs and creatures, each a small 3D model rendered to pixel art at eight headings |
| `js/render.js`, `js/hud.js`, `js/ui.js`, `js/screens.js`, `js/places.js`, `js/battle.js` | the field, the panels, the sheets, the sheets that are places, and the fight on screen |
| `js/sfx.js`, `js/main.js` | Web Audio (effects and the title march), and boot, title, the walk and the loop |
| `tools/sim-check.js` | headless: battles end and replay the same from the same seed; every door, town and the Vault can be walked to; the Vault's doors are solvable |
| `tools/playthrough.js` | headless: the story stage by stage, walked with the game's own step; every door, person and Vault fitting can be reached by a way the player can see (not under a roof, a Vault wall's top, or through people and parked mechs) |
| `tools/balance.js` | headless: how often the AI wins the fights the story deals out (for tuning) |
| `tools/stamp-assets.js`, `tools/check-assets.js` | content hashes on every script and stylesheet URL; every file the page names exists (games-meta §10) |
| `tools/make-icons.js`, `tools/og.html`, `tools/icon-art.json` | the icons and the share card, from the game's own sprites |
| `tools/preview.html`, `tools/openspots.js` | a sprite sheet for the art, and where on the map a fight has room |

## Debug parameters

`?quick=1` on the page starts a new game at once, for testing; add `&invaded=1` to skip the academy, `&lance=1` for three mechs and three recruits, `&money=n`, `&at=x,y`, or `&vault=1`.
