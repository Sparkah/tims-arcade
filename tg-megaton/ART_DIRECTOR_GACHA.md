# Megaton Gacha Art Direction Brief

## Direction

The next gacha layer should be an arsenal collection, not a missile skin shop. A collectible can be a missile body, delivery drone, mascot charm, mob cameo, reactor core, countermeasure kit, orbital relic, or prize oddity. The equipped item should be visible during the core loop through at least one of these channels:

- Missile silhouette or nose art during the fall.
- Drop rig, escort, parachute, drone, or orbital beam.
- Trail color, particles, rings, smoke, sparks, or false-target dots.
- Impact flash, debris burst, mushroom tint, shock ring, or secondary sparkle.
- Tiny cameo that appears in the collection card, on the missile, or at the crater edge.

Stats should stay capped and boring. The collection fantasy is the visual read: "I equipped this thing and the drop looks different."

## Current Game Read

- The game is mostly green terminal/Pip-Boy language: city, HUD, target reticle, default missile, and bonus text.
- Existing high-contrast accents are amber, orange, red-orange, cyan, and a few district colors.
- The default warhead is a simple vertical green silhouette, so collectible items need stronger silhouettes and non-green accent color.
- Explosions already have warm fireballs and mushroom clouds, so new explosion looks should tint the outer ring, cloud edge, debris, and particles while preserving a white-hot center.

## Style Format

Build the first pass so it works as canvas/vector art, then allow later raster sprites.

- Icon size: 128x128 source, readable at 64x64 in the collection grid.
- In-game missile size: small silhouette must read at roughly 10-26 px tall.
- Background for generated sprites: pure black #000000 for alpha processing.
- Outline: 2 px dark outline, near #07100b or #0a0a0a.
- Shading: flat arcade shading, 3 tones per color max. Do not bake large glow into sprite sheets; the engine can add glow.
- No text, logos, flags, national symbols, tiny UI labels, watermarks, or detailed insignia.
- Every item must have a primitive fallback shape that can be drawn with canvas paths.

Recommended future JSON shape:

```json
{
  "id": "rare_sky_needle",
  "name": "Sky Needle",
  "rarity": "rare",
  "family": "bombshell",
  "boost": { "kind": "yield_mult", "value": 0.017 },
  "visual": {
    "body": "needle",
    "nose": "long",
    "fins": "split",
    "dropRig": "none",
    "primary": "#5fd8ff",
    "secondary": "#eef7ff",
    "accent": "#ff7a4f",
    "trail": "cyan_sparks",
    "impact": "cool_ring",
    "mushroomTint": "#7fd4ff",
    "cameo": "none"
  }
}
```

## Palette Rules

Green is the game's world color, not the collection color. Use it as a compatibility glow or tiny trim, not as the main paint on most gacha items.

- Per item: one saturated primary, one bright accent, one dark outline, one off-white highlight.
- Keep terminal green under 15 percent of the visible item unless the item is deliberately "classic issue."
- Avoid all-purple, all-blue, all-orange, or all-green sets. The collection grid should look like a candy box against the dark green UI.
- White-hot centers stay white or cream in every explosion so impact still reads as nuclear heat.
- Explosion tints live on outer fireball, debris particles, mushroom edge, shock ring, smoke sparkle, and UI preview swatches.
- Use rarity changes in silhouette complexity, not hue alone.

Suggested palette anchors:

| Use | Colors |
| --- | --- |
| Terminal compatibility | #54ff96, #1ec873, #0f6b40 |
| Cool rare pop | #5fd8ff, #7fd4ff, #bfe9ff |
| Warm punch | #ff6a4a, #ff8a3b, #ffd24a |
| Epic candy contrast | #ff4fd8, #b76dff, #5afff6 |
| Hazard bright | #e6ff5a, #ffce45, #0a1208 |
| Legendary metal | #fff4b8, #ffb02e, #17120a |
| Mythic accent | #ffffff, #ff365e, #50f6ff, #111018 |

## Rarity Language

| Rarity | Visual promise | In-game impact |
| --- | --- | --- |
| Common | One strong silhouette swap, one accent color, simple trail. | Missile body or small trail changes. Default warm explosion with a slight tint. |
| Rare | Two-channel change. Shape plus trail, or drop rig plus impact ring. | Clear fall read and colored particles at impact. |
| Epic | Three-channel change and one small joke/detail. | Custom trail, tinted mushroom edge, cameo or shaped shock ring. |
| Legendary | Full identity package. | Unique drop staging, signature explosion, cameo, and collection card hero icon. |
| Mythic | Trophy item. | Every visual channel changes, but stat boost stays within cap. It should feel rare because it is loud and unmistakable, not because it breaks balance. |

## Item Families

| Family | Collection fantasy | Missile/drop | Trail | Explosion | Mob cameo |
| --- | --- | --- | --- | --- | --- |
| Bombshell Bodies | The actual warhead shell: darts, capsules, drills, split pods, crowned bombs. | Changes body, nose, fins, size, and paint. | Follows body material: smoke, sparks, plasma, ember. | Matching tint on mushroom edge and debris. | Usually none. |
| Courier Drones | Little delivery machines that escort or carry the payload. | Drone flies above or beside the warhead, then releases it. | Rotor sparks, laser guide, dotted exhaust. | Drone-shaped spark flicks away before impact. | Tiny helper bot can peek from crater edge. |
| Reactor Cores | Glowing payload cartridges visible through the shell. | Capsule with exposed core window. | Vent stream uses core color. | Strongest source of alternate explosion looks. | Optional slime/plasma droplet cameo. |
| Countermeasure Kits | Flares, chaff, false targets, smoke loops, decoy rings. | Side pods, flare canisters, or decoy balloons attached to missile. | False trails, ring puffs, chaff flecks. | Thin secondary ring around normal blast. | Decoy target marker or dummy silhouette. |
| Mascot Charms | Collectible toys clipped to the bomb or painted as nose art. | Small charm, sticker, rider, or bobble silhouette. | Star puffs, cap sparks, smile-shaped smoke dots. | Cloud briefly forms a face, crown, or grin on the outer edge. | Mascot pops out for one beat after the blast. |
| Mob Cameos | Tiny wasteland mobs collected as "unfortunate companions." | Jar, cage, sticker, or passenger shape on the payload. | Footprint, slime, sparks, or scrap flecks. | Vapor pop or colored burst at impact edge. | Primary use: a small mob appears in card art and crater VFX. |
| Orbital Relics | Space junk, kinetic rods, satellites, and comet fragments. | Vertical rod, falling pod, or orbital beam instead of classic missile. | Straight beam, star flecks, ion line. | Cool shock disc, glassy ring, or beam column. | Satellite ping or tiny scanner bot. |
| Prize Oddities | Gacha-toy absurdity: crates, sparklers, parade bombs, novelty payloads. | Oversized prize crate, toy rocket, wrapped bomb, button capsule. | Confetti, streamers, bright sparks. | Firework burst, color spokes, prize shards. | Tiny prize token bounces once, then vanishes. |

## Explosion Signature Rules

These should be param-driven first, sprite-sheet-enhanced later.

- Hot Bloom: default readable nuke. White core, orange fire, amber debris, smoke. Good for Common.
- Cool Ring: white core, cyan outer ring, pale blue particles, orange kept near center. Good for Rare drones and orbital relics.
- Candy Fission: white core, magenta/cyan/yellow particle spokes, pink edge on mushroom. Good for Epic prize and reactor items.
- Glass Comet: white-blue flash, cyan shard ring, thin bright debris, dark smoke. Good for Epic orbital items.
- Solar Crown: white core, gold corona, orange embers, crown-shaped shock spikes. Good for Legendary bombshells.
- Blackbox Rod: narrow white impact column, cyan crack ring, black smoke flecks, minimal fireball spread. Good for Legendary orbital items.
- Last Button: red button drop, white flash, red/cyan mushroom rim, one frame of circular warning halo. Mythic only.

Never tint the whole city or hide building destruction. Explosion color must support the impact read, not replace it.

## Rarity Examples

| Rarity | Example item | Family | Visual behavior |
| --- | --- | --- | --- |
| Common | Rust Dart | Bombshell Bodies | Rust-red dart, small gray smoke tail, normal orange impact with rust debris flecks. |
| Common | Bottlecap Buddy | Mascot Charms | Tiny cap mascot clipped to missile, cap-shaped spark on impact. |
| Rare | Sky Needle | Bombshell Bodies | Thin cyan needle with split fins, cyan spark trail, cool impact ring. |
| Rare | Chaff Bloom | Countermeasure Kits | Side pods shed pale flecks and false dots during drop, impact gets thin white/cyan ring. |
| Epic | Bubblegum Core | Reactor Cores | Magenta core window, cyan-magenta trail bubbles, candy fission edge on cloud. |
| Epic | Glass Comet | Orbital Relics | Falling blue shard, straight ion trail, glassy shard ring at impact. |
| Legendary | Sun Crown | Bombshell Bodies | Gold crowned shell, ember trail, solar crown shock spikes. |
| Legendary | Blackbox Rod | Orbital Relics | Black kinetic rod from top screen, white impact column, cyan crack ring. |
| Mythic | Last Button | Prize Oddities | Red button capsule, warning halo, full red/cyan trophy explosion package. |

## First 24 Production Assets

Produce these as six 2x2 sheets if using image generation. Each cell is a 128x128 transparent-ready icon on black background. The same asset identity should also have a canvas fallback using the `visual` fields.

| # | ID | Rarity | Family | Palette | Channels to implement |
| --- | --- | --- | --- | --- | --- |
| 1 | common_rust_dart | Common | Bombshell Bodies | Rust red, soot, tiny green trim | Needle body, gray smoke trail, rust debris flecks. |
| 2 | common_caution_capsule | Common | Bombshell Bodies | Safety yellow, black, cream | Rounded capsule, short black smoke puffs, warm impact. |
| 3 | common_scrap_courier | Common | Courier Drones | Steel gray, orange, green light | Small box drone carries default warhead, rotor sparks, no unique mushroom. |
| 4 | common_coolant_cell | Common | Reactor Cores | Pale cyan, slate, white | Core window on missile, thin cyan vent trail, cool edge on impact ring. |
| 5 | common_smoke_loop | Common | Countermeasure Kits | Off-white, gray, amber | Side smoke canisters, looped smoke puffs, normal explosion. |
| 6 | common_bottlecap_buddy | Common | Mascot Charms | Cap blue, cream, amber | Cap charm on nose, two cap sparks at impact, no cloud face yet. |
| 7 | common_barrel_imp | Common | Mob Cameos | Orange barrel, charcoal, green eyes | Sticker/passenger silhouette, scrap trail flecks, tiny crater-edge pop. |
| 8 | common_prize_crate | Common | Prize Oddities | Red-orange, cream, teal | Boxy payload, small confetti flecks, warm burst with two color sparks. |
| 9 | rare_sky_needle | Rare | Bombshell Bodies | Cyan, white, coral | Long needle body, cyan spark trail, cool ring impact. |
| 10 | rare_triwing_courier | Rare | Courier Drones | Cyan, navy, amber | Triwing escort drone, dotted laser guide, drone flicker before blast. |
| 11 | rare_blue_plasma_core | Rare | Reactor Cores | Electric blue, white, dark teal | Exposed core, blue vent trail, blue outer mushroom tint. |
| 12 | rare_chaff_bloom | Rare | Countermeasure Kits | White, pale cyan, graphite | Chaff pods, false-target dots, thin secondary ring. |
| 13 | rare_glow_slime | Rare | Mob Cameos | Lime, teal, white | Slime jar on missile, droplet trail, small vapor pop cameo. |
| 14 | rare_orbital_bolt | Rare | Orbital Relics | Blue-white, steel, amber | Short falling bolt shape, straight ion trail, cool disc impact. |
| 15 | rare_sparkler_payload | Rare | Prize Oddities | Hot pink, amber, white | Toy rocket silhouette, sparkler trail, warm firework spokes. |
| 16 | epic_splitter_pod | Epic | Bombshell Bodies | Magenta, cyan, black | Split pod body, triple mini-trails, tiny MIRV-style side flashes. |
| 17 | epic_neon_guard_drone | Epic | Courier Drones | Violet, cyan, white | Guard drone escort, arcing electric trail, drone afterimage at impact. |
| 18 | epic_bubblegum_core | Epic | Reactor Cores | Magenta, cyan, cream | Core window, bubble trail, candy fission mushroom edge. |
| 19 | epic_glass_comet | Epic | Orbital Relics | Ice blue, white, black | Shard payload, ion trail, glass comet shard ring. |
| 20 | epic_hazard_mascot | Epic | Mascot Charms | Yellow-green, black, coral | Mascot charm/rider, hazard spark trail, brief grin in smoke edge. |
| 21 | legendary_sun_crown | Legendary | Bombshell Bodies | Gold, white, orange | Crowned warhead, ember trail, solar crown shock spikes. |
| 22 | legendary_blackbox_rod | Legendary | Orbital Relics | Black, white, cyan | Vertical kinetic rod, white beam trail, cyan crack impact. |
| 23 | legendary_prism_fission | Legendary | Prize Oddities | White, cyan, magenta, gold | Prize-bomb shell, prism trail, multi-color spokes around white core. |
| 24 | mythic_last_button | Mythic | Prize Oddities | Red, white, cyan, black | Button capsule, warning halo drop, full red/cyan trophy mushroom tint. |

## 2x2 Production Batches

- Sheet 1: common_rust_dart, common_caution_capsule, common_scrap_courier, common_coolant_cell.
- Sheet 2: common_smoke_loop, common_bottlecap_buddy, common_barrel_imp, common_prize_crate.
- Sheet 3: rare_sky_needle, rare_triwing_courier, rare_blue_plasma_core, rare_chaff_bloom.
- Sheet 4: rare_glow_slime, rare_orbital_bolt, rare_sparkler_payload, epic_splitter_pod.
- Sheet 5: epic_neon_guard_drone, epic_bubblegum_core, epic_glass_comet, epic_hazard_mascot.
- Sheet 6: legendary_sun_crown, legendary_blackbox_rod, legendary_prism_fission, mythic_last_button.

Prompt prefix for later raster production:

```text
Pixel art game sprite for a Telegram Mini App. Pure black background #000000. Bold 2 px dark outline. Hard pixel edges. Flat arcade shading, 3 tones max per color. Saturated collectible item designed to pop against a dark green terminal UI. Subject centered, about 70 percent of canvas. No background scenery, no floor shadow, no text, no logo, no watermark.
```

## Implementation Notes For The Next Code Pass

- Rename product language from `SKINS` to `ARSENAL` or `COLLECTION` before production. The catalog is broader than skins.
- Keep one equipped item boost active. Multiple visual channels can change, but only one stat bonus should apply.
- The current `skinArtNode()` avatar preview should eventually become an item icon renderer. It can still use CSS/vector primitives before raster icons exist.
- The current `drawWarhead()` can map `visual.body`, `visual.nose`, `visual.fins`, `visual.primary`, and `visual.accent` without loading sprites.
- `blastAt()` can read `visual.impact`, `visual.mushroomTint`, and `visual.trail` later to choose particle colors, cloud edge tint, and shock ring style.
- Mob cameos should be decorative. They should not add new moving gameplay targets in the gacha release unless a separate balance pass approves it.
