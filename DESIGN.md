# Design System: PumaMech

PumaMech wears Airborne Puma's design system (its `DESIGN.md` is the reference): the tilted overhead field as hi-bit pixel art lit by a low south-west sun, with flat dark translucent panels over it. What follows is only what this game adds or changes.

## The field

- 480×300, 24-pixel tiles, scaled by whole numbers where the window allows. Shadows fall north-east and are multiplied in the zone's cool shade in one pass.
- One continuous world in three zones painted by Airborne Puma's ground painters (temperate for most of Pardalis, desert for the Kiln Badlands, arctic for the High Spurs), plus this game's tiles in `js/town.js`: stone setts, dirt roads with wheel ruts, a plank bridge, crop rows, and the Vault's deck plates, grating and plated walls.
- Buildings (`js/buildings.js`) show their roof and their south face, in four styles: concrete and olive metal at the Bastion, brick and red tile in Portgate, timber and green shingle in Fernwick, adobe in Kiln Hollow. A hanging sign with a 7×7 pixel icon says what each place is.

## Mechs and creatures

- Every chassis is a small 3D model of boxes and limbs (`js/mechs.js`), posed (the legs by two-bone reach), turned to one of eight headings, and sampled into a depth buffer in the field's own projection (a model's depth halved on screen). Each sample is lit from its surface normal by the same south-west sun, dithered into its material's six-step ramp; where a nearer part crosses a farther one the farther pixel darkens, so parts read apart. Then the outline and the cast shadow.
- Paints: **claw** (sand and olive, sunset-orange stripe) for the player's side, **academy** (olive, yellow) for the Bastion's, **wolf** (slate, night trim, red, a red eye) for the Grey Pact, **founders** (ivory, steel, blue) for the Vault's mechs, **drone** (hazard yellow) and **rogue** (rust) for the rest.
- The scrub and ridge drakes and the Founders' sentries are made the same way at a person's scale.

## People

Airborne Puma's people rig, with the peoples of Pardalis added in `js/people.js`: fox, bear, hare, otter, raccoon, badger, owl, capybara, stoat, mouse and hedgehog heads (a front map each; three-quarter, side and back views derived), and outfits for the cast and the townsfolk. Faces in the sheets are the head and shoulders of the same sprite.

## Chrome

The panels, type (Barlow Semi Condensed for words, Pixelify Sans for numbers and keys) and the three signals (green ready, amber caution, red-orange danger) are Airborne Puma's. Added:

- **Exploring:** where you are and when, crowns in gold, a minimap of what the party has seen (with the locator's arrow), and the party strip along the bottom.
- **Fighting:** it opens on the enemy, then pans to yours. The active unit's card top left and the target's top right (a friend's says "yours"), each with an armour doll (eight locations shaded green, amber, red, with one dark stripe for worn and two for badly hurt, crossed out when gone), a heat bar with this round's peak (→, amber from 14, red from 20), and on the orders card a small header over the weapons: key, name, damage · close/far range, ammo, what it aims at (the enemy's letter, or "hold"), and its chance on that target this round (green when it gets the close shot; a held weapon shows its chance on the enemy under the cursor in brackets). The round pill top centre; the log bottom left (hidden until there is something in it: the contact line, the cadet's one-line summary of each unit's round, notable hits); the keys bottom right, grouped and only what can be used now. On the field, reachable tiles are outlined (bone to walk, amber to run, blue to jump), the route as dots (amber past this round, "NEXT" where it ends), a corner-bracket cursor (red-orange when aiming), dashed lines to what the unit aims at, a health tick over every head the whole fight, each enemy's letter in a small dark tab (inverted when aimed at), an amber word over the target of a kick, charge or medkit, arrows at the screen's edge for enemies off it, and units among trees show through faintly. The cadet nicknames each enemy mech for the fight (Grumpy, Big Ears...) and the log uses the names.
- The Vault's codes are always written in their colours: red, blue, yellow.
