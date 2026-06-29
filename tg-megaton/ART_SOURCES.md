# Megaton Art Sources

### Kenney Smoke Particles
- Source page: https://kenney.nl/assets/smoke-particles
- Direct source file: https://kenney.nl/media/pages/assets/smoke-particles/23249a0d35-1677695171/kenney_smoke-particles.zip
- License: CC0 / public domain
- Downloaded source cache (local only, ignored): `_source_assets/explosion_candidates/kenney_smoke_particles/kenney_smoke-particles.zip`
- Local game assets: `game/fx/free_explosion_candidates/kenney_*.png`
- Use: 10 fire/flash/smoke ingredients sampled by the procedural explosion generator.
- Publish requirement: none; attribution optional.

### FreeSVG Mushroom / Nuclear Explosion Candidates
- Source pages:
  - https://freesvg.org/atomic-bomb-cloud-vector-graphics
  - https://freesvg.org/color-mushroom-cloud-vector-image
  - https://freesvg.org/mushroom-cloud-boom
  - https://freesvg.org/mushroom-cloud-vector-image
  - https://freesvg.org/mushroomcloud2
  - https://freesvg.org/nuclear-bomb-explosion
  - https://freesvg.org/nuclear-explosion
  - https://freesvg.org/nuclear-explosion-drawing
  - https://freesvg.org/nuclear-explosion-image
- License: CC0 / public domain, as declared in each page's `itemprop="license"` metadata.
- Downloaded source cache (local only, ignored): `_source_assets/explosion_candidates/nuke_mushroom/freesvg_cc0/*.png`
- Local candidate assets: `game/fx/nuke_mushroom_candidates/freesvg_*.png`
- Use: candidate mushroom cap/stem masks, smoke texture, contour masks, blast column references.
- Best candidates for integration: `freesvg_atomic_bomb_cloud.png`, `freesvg_mushroomcloud2.png`, `freesvg_color_mushroom_cloud.png`, `freesvg_mushroom_cloud_boom.png`, `freesvg_mushroom_cloud_vector.png`.
- Weaker candidates: `freesvg_nuclear_explosion_drawing.png` and `freesvg_nuclear_explosion_image.png` may work only after heavy processing.
- Likely reject after review: `freesvg_nuclear_bomb_explosion.png` is too low-contrast, and `freesvg_nuclear_explosion.png` is too toy-like against the current style.
- Rejected/quarantined: `freesvg_nuclear_blast.png`, `freesvg_nuclear_explosion_pictogram.png`, `freesvg_untitled_mushroom_cloud.png`.
- Publish requirement: none; attribution optional.

### OpenGameArt / LPC Nuclear Mushroom Cloud
- Source page: https://lpc.opengameart.org/content/nuclear-mushroom-cloud
- Direct source file: https://lpc.opengameart.org/sites/default/files/Castle_Romeo.jpg
- License: CC0 / public domain
- Downloaded source cache (local only, ignored): `_source_assets/explosion_candidates/nuke_mushroom/oga_castle_romeo.jpg`
- Local candidate asset: `game/fx/nuke_mushroom_candidates/oga_castle_romeo.jpg`
- Use: color, glow, and late mushroom lighting reference. It is stronger as procedural reference than as a direct sprite.
- Publish requirement: none; attribution optional.

### Wikimedia MOAB Reference Footage
- Source page: https://commons.wikimedia.org/wiki/File:Aerial_Footage_of_MOAB_Bomb_Striking_Cave,_Tunnel_System.webm
- Direct source file: https://commons.wikimedia.org/wiki/Special:Redirect/file/Aerial_Footage_of_MOAB_Bomb_Striking_Cave,_Tunnel_System.webm
- License: public domain, as declared on the Wikimedia file page.
- Downloaded source cache (local only, ignored): `_source_assets/explosion_candidates/moab_reference/aerial_moab_footage.webm`
- Local reference frames: `game/fx/moab_reference_candidates/moab_dust_plume_*.png`
- Use: dust plume, shock-darkening, and aerial smoke-spread reference only. Not recommended as direct in-game sprites.
- Publish requirement: none; attribution optional.
