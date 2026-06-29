# BLOODTREAD - ART DIRECTION & STYLE BIBLE
Top-down biomechanical body-horror tank-survivors. Iron war-machines fused with
raw flesh, crushing a screaming horde. Reference set studied: cover, menu_bg_a/b,
creatures_a/b/c/d, relic_heavybore/twinmaw/ironheart, skin_gore/void, plus the new
en_/spr_ enemy sheets.

================================================================================
## 1. STYLE BIBLE
================================================================================

### Core concept (one sentence)
Rusted military iron welded onto living oxblood muscle, bone, and tendril; lit
low and hot; everything wet, everything screaming.

### Palette (lock these hex values)
Primary structure:
- Gunmetal iron (armor):     #2C3035  base  /  #565C63 mid  /  #9AA2A8 spec edge
- Rust / corrosion:          #6E3F22  base  /  #9C5A2E mid  /  #C07A3E rim
- Bone (teeth, claws, skull):#C9BB99  base  /  #E4DAC0 hi   /  #8F8164 shadow
- Near-black (outline/recess):#141013  (NEVER pure #000000 inside a subject)

Flesh family:
- Oxblood muscle (deep):     #5A1418  base  /  #7E2125 mid
- Blood-red (arterial wet):  #A81C1C  base  /  #D6342A hi   /  #F2C9C0 wet-spec
- Flesh-pink (husk/bloat skin):#B98A82 base /  #D6B2A4 hi   /  #8A5E57 shadow

Accents (use SPARINGLY, one per creature max):
- Toxic venom-green (acid/ooze): #6FA02A  /  glow #B6F23A
- Void-purple (eldritch/skins):  #46285C  /  glow #9B4FD0
- Hot-red self-glow (eyes/wounds/optics/rim): #FF3A12 core, #FF8A4D bloom

### Rendering style
Two registers. Do not mix them on one asset.

REGISTER A - CINEMATIC (cover, menu_bg, skins, relics, boss splash):
Near-photoreal 3D-render painterly. Heavy specular on wet blood and metal,
deep low-key lighting, hot red/orange rim-glow or red ambient fog, strong
vignette. This is marketing/UI skin, NOT gameplay sprites.

REGISTER B - INKED BESTIARY (ALL enemy sprites + concept sheets):
This is the sprite look. Bold dark-brown ink outline (heavier on the outer
silhouette, lighter on interior lines), painterly semi-cel fill with clear
form shadow, wet specular dabs on metal edges and exposed flesh, rust/grime
streaks. Reads cleanly at 64px. creatures_a/b and en_gnasher_walk are the
gold standard; match them, not the cover.

### Lighting rules
- Single key from upper-front, consistent direction across every frame of a sheet.
- Deep occlusion in recesses (between plates, inside the maw).
- Self-illumination: eyes, open wounds, optic lenses, and acid glow emit their
  own color (#FF3A12 red default; green/purple for themed units).
- SPRITE RIM-LIGHT (mandatory, also solves the alpha cut): trace the full
  silhouette with a THIN 1-2px, NON-NEON rim in rust/bone (#C07A3E / #C9BB99) so
  it reads on the dark gameplay floor AND keeps the cut edge off pure black.
  Keep it subtle - a full hot-red/bright rim reads as a glow or a selection
  outline. Reserve emissive hot-red (#FF8A4D) rims ONLY for units meant to glow
  (eyes, wounds, acid). Default rim = quiet warm rust.

### Silhouette principles
- Every enemy must be identifiable as a solid black blob at 64px. No two enemies
  share a silhouette.
- Silhouette telegraphs role: spiky = ranged/danger, bloated round = exploder,
  hunched wide = tank, low+long = fast, winged = flyer, tall+bladed = elite.
- Keep one dominant shape idea per creature; resist greebling that mushes the
  outline. Read the blob first, detail second.

================================================================================
## 2. SPRITE-SHEET FORMAT SPEC  (THE #1 RULE - non-negotiable)
================================================================================
The spr_ batch FAILED on format, not art. Every future enemy sheet MUST obey:

SOURCE vs ACCEPTANCE (keep these separate):
- SOURCE = the generation-only background the model paints behind the subject
  (flat pure black, OR green chroma - see safety below). It exists only to be
  keyed out; it is NOT what ships.
- ACCEPTANCE = the shipped asset: a TRANSPARENT PNG with a clean alpha, zero
  background halo or color fringe, no leftover gutter pixels. Judge the cutout,
  not the source.

HARD RULES:
1. TRANSPARENT PNG output, alpha-cut from a FLAT chroma source (pure black
   #000000 by default; green #00FF00 for very dark creatures - see safety).
2. NO drawn borders. NO panel boxes. NO grid lines. NO DIVIDERS. NO frame
   numbers. If you can see a rectangle or a line around a frame, it is REJECTED.
   (Transparent empty padding INSIDE equal-width frames is fine and expected -
   what is banned is any VISIBLE box/gutter/rule, not the spacing itself.)
3. NO WHITE anywhere in the canvas (white cells, white bg, white gutters all
   forbidden). Source background is one flat chroma ONLY.
4. SINGLE CLEAN HORIZONTAL STRIP, one row, N frames left-to-right, equal width.
   (A perfect uniform grid is tolerated only if zero-gutter and equal cells;
   prefer one row.)
5. SAME character every frame: identical scale, identical design, identical
   color. No frame zoomed, cropped, or restyled.
6. SHARED GROUND ANCHOR: the feet/ground-contact point sits on the SAME Y line
   in every frame; horizontal center consistent; no floating or sinking.
7. SIDE PROFILE for walk/run cycles, facing screen-RIGHT by convention. NOTE:
   this is a top-down game but enemies are drawn as side-on SILHOUETTES (the
   Vampire-Survivors convention) for readability in a swarm - NOT a literal
   top-down body angle. Engine flips horizontally for left movement; a slight
   3/4 lean is fine. Attacks may angle but stay side-readable.
8. CONSISTENT FRAME COUNT: walk/run = 6, attack/spit = 6-8, death = 6. No empty
   cells, no missing frames, no half-frames.

ALPHA-CUT SAFETY (critical - the art uses black):
- The bestiary fills shadows and limbs with near-black, which a black chroma key
  will EAT. So: forbid pure #000000 inside the subject (darkest allowed #141013),
  AND require the mandatory silhouette rim-light from section 1. That rim makes
  every edge brighter than the background so the cut never bites into a black leg.
- Because near-black IS a major subject color, GREEN chroma (#00FF00) is the
  FIRST-LINE fallback (not a last resort) for any dark/black-limbed creature -
  reach for it the moment a black-on-black source shows clipping. Pure-black
  source is fine for lighter/rust-dominant creatures.
- Never source on white for the shipping pipeline (en_gnasher cut OK on white
  only because of its heavy outline; do not rely on it).
- After cutout, REJECT any black halo, color fringe, or anti-alias contamination
  ringing the silhouette - that is a failed key, re-cut it.

ACCEPTANCE CHECKLIST (run on every returned sheet before it ships):
[ ] transparent alpha only, no background pixels, no halo/fringe
[ ] no visible box/border/grid/gutter/divider/number/text anywhere
[ ] equal frame canvas width; one horizontal row (or zero-gutter uniform grid)
[ ] identical creature, identical scale, every frame (incl. across walk vs attack)
[ ] shared foot/ground anchor Y; nothing floats or sinks
[ ] no cropped extremities (a wing/scythe/tail clipped at a frame edge = REDO)
[ ] correct frame count (walk 6, attack 6-8, death 6)
[ ] reads as a clear, unique silhouette at 64px

================================================================================
## 3. CONSISTENCY REVIEW  (KEEP / REDO per sheet)
================================================================================
Headline: the ART is on-brand and excellent across the board. The spr_ FORMAT is
the universal failure (comic-panel cells / borders / white / empty cells). The
en_ reference-guided pass is the proven fix.

NEW REFERENCE-GUIDED PASS (the correct pipeline):
- en_gnasher_walk.png  - KEEP. Clean transparent alpha-cut, side profile, 6
  consistent frames, on-palette. Minor: came off a WHITE source (cut OK thanks to
  the dark outline) and is a 2x3 grid - move to pure-black source + single row.
- en_gnasher_walk.jpg  - KEEP (source). At full res it nails Register B: bold
  outline, gunmetal plates over exposed red ribcage, good run cadence.

OLD spr_ FRAME-STRIPS (great art, broken format - REDO all in en_ pipeline):
- spr_gnasher_walk    - REDO format. Strong art; every frame boxed in a thick
  black panel on white. Superseded by en_gnasher.
- spr_juggernaut_walk - REDO format + frames. White grid cells, a near-empty
  cell, and inconsistent scale/anchor (one frame zoomed with a dust kick).
- spr_bloat_walk      - REDO format. Chaotic layout: 5 boxed frames + a stray
  divider rule + 2 unboxed floating frames. Design is a keeper.
- spr_needler_walk    - REDO format. Grey grid lines + a clipped gradient band
  bleeding across the bottom edge.
- spr_reaper_walk     - REDO format. White cells with black gutters. Art is
  superb (gaunt scythe elite) - top priority to re-cut.
- spr_shrieker_fly    - REDO format. Black-bordered panels on white WITH one
  empty cell (missing frame). Good winged-skull flyer.
- spr_spitter_spit    - REDO format. White cells + black borders. Animation arc
  itself is excellent (charge -> green acid glob -> spit); keep the timing.
- spr_death_collapse  - REDO format (light touch). Closest to correct: already a
  single horizontal row, just strip the black gutter lines and move to black bg.
- spr_gnasher_bite    - REDO format. Same panel-box defect (montage-confirmed);
  on-brand attack art.
- spr_reaper_slash    - REDO format. Panel boxes (montage); on-brand.
- spr_bloat_burst     - REDO format. Panel boxes (montage); good exploder burst.
- spr_juggernaut_slam - REDO format. Panel boxes (montage); on-brand slam.
- spr_mawworm_move    - REDO format. Panel boxes (montage); on-brand.
- spr_weeper_walk     - REDO format. Panel boxes (montage); on-brand.
- spr_spawnling_run   - REDO format. Panel boxes (montage); on-brand swarm.
- spr_harvester_walk  - REDO format. Panel boxes (montage); on-brand.

NET: 0 art rejections, 16 format REDOs, 1 proven KEEP pattern (en_). Re-run the
entire roster through the en_ reference-guided template below. Re-cut reaper and
juggernaut first (best designs, worst current cells).

CROSS-ASSET NOTES (not gameplay, but fix for consistency):
- relic_ironheart sits on WHITE while heavybore/twinmaw sit on black with a hot
  rim-glow. Unify all relics on black + red rim-glow.
- concept sheets creatures_a/b are on black, c/d on white. Standardize on black.

================================================================================
## 4. REFERENCE-GUIDED PROMPT TEMPLATE  (gemini-3-pro-image)
================================================================================
Attach as style refs: creatures_b.jpg + en_gnasher_walk.jpg (Register B look).
For richer single-creature detail you may add creatures_c.jpg. Fill the <SLOTS>.

----- PROMPT SKELETON -----
"A horizontal sprite-sheet strip of a single biomechanical body-horror creature,
matching the attached reference art style EXACTLY: bold dark ink outline,
painterly semi-cel shading, rusted gunmetal iron plates fused with wet oxblood-red
muscle and bone, grime and rust streaks, glowing red eyes, thin warm rust rim-light
tracing the whole silhouette.

Subject: <CREATURE NAME>, <1-LINE SILHOUETTE>. Palette: gunmetal #2C3035, rust
#9C5A2E, oxblood #7E2125, blood-red #D6342A, bone #C9BB99 <+ ONE accent e.g.
toxic-green #B6F23A IF applicable>.

Action: <walk cycle / spit attack / death collapse>, strict SIDE PROFILE facing
right. Exactly <N> animation frames in ONE single horizontal row, left to right,
the SAME creature at the SAME scale in every frame, feet resting on one shared
ground line, evenly spaced.

Background: flat pure solid black (#000000) filling the ENTIRE image, edge to edge,
behind and between every frame. Isolated subject, clean for alpha-cut.

Mood: grimdark biomechanical horror, top-down game enemy, reads clearly at small
size."

----- NEGATIVE / BANNED (kill the white-cell + border defect) -----
"no white background, no white, no grey background, no panel borders, no frame
borders, no boxes around frames, no grid lines, no gutters, no dividers, no
rectangles, no comic panels, no separating lines between frames, no empty cells,
no frame numbers, no text, no labels, no UI, no caption, no signature, no
watermark, no drop shadow on the ground, no inconsistent scale, no zoomed frames,
no extra characters, no duplicated different creatures."

KEY ENABLERS (why this works):
- "flat pure solid black filling the ENTIRE image edge to edge" + the rim-light
  instruction is what produces a clean chroma source without eating black limbs.
- "ONE single horizontal row, same scale, shared ground line" kills the grid/box
  habit that wrecked the spr_ batch.
- If borders still appear, append "absolutely seamless background, frames flow
  directly into one continuous black field" and re-roll the seed - it is often
  just an unlucky generation.

================================================================================
## 5. PROPOSED CONSISTENT ENEMY ROSTER (~10, one coherent bestiary)
================================================================================
Covers every gameplay gap (fodder / fast / swarm / tank / exploder / 2x ranged /
flyer / elite / summoner). All share the iron+oxblood+bone palette and Register B
ink look so they read as one family.

1.  HUSK        (fodder swarm)   - emaciated flesh-pink humanoid, reaching arms,
    gaping maw; the cover-horde body. Slow, dies in one hit, comes in tides.
2.  GNASHER     (fast charger)   - low+long cybernetic flesh-hound, exposed
    ribcage, bladed paws. Sprints in straight lunges. [en_gnasher = locked]
3.  SPAWNLING   (swarm runner)   - knee-high iron-tick scuttler, single red eye,
    skittering legs. Tiny, fast, arrives in clusters.
4.  JUGGERNAUT  (tank)           - hunched wide iron-muscle brute, plated back,
    knuckle-walking. Soaks damage, ground-slam in melee.
5.  BLOAT       (exploder)       - obese gas-mask zombie, distended veined belly,
    waddles; bursts into a toxic-green cloud on death. [accent: green]
6.  SPITTER     (ranged arc)     - quadruped armored hound-lizard, lobs a glowing
    green acid glob in an arc. Clear charge telegraph. [accent: green]
7.  NEEDLER     (ranged volley)  - armored centipede bristling with bone spines,
    rears up and fires a spread of bone needles. Spiky = danger read.
8.  SHRIEKER    (flyer)          - winged skull trailing a red spine, leathery
    bat wings; ignores ground, dive-screams. [floats, no ground anchor]
9.  REAPER      (elite striker)  - tall gaunt hooded horror, twin bone-scythe
    arms, single red optic. Fast, high-damage, mini-threat. [best design - lead]
10. BROODMAW    (summoner / sub-boss) - bloated translucent egg-sac on iron legs,
    embryos visible inside; periodically births SPAWNLINGS. Slow, high HP.

STRETCH / BOSS TIER (Register A splash, Register B in-field):
- RAM-RIG (6-wheeled ram-skull war vehicle, creatures_d) - vehicle mini-boss.
- BRAINSPIDER (exposed barbed brain, creatures_d) - psychic caster elite.

OPTIONAL GAP-FILLER (positional pressure, if the design wants terrain denial):
- BURROWER (iron-tick mawworm, reuse spr_mawworm) - submerges, erupts under the
  tank, leaves a hazard patch. Forces the player to keep moving rather than camp.

Silhouette spread check: 1 upright-thin, 2 long-low, 3 tiny-round, 4 wide-hunched,
5 round-fat, 6 mid-quadruped, 7 segmented-spiky, 8 winged, 9 tall-bladed,
10 huge-round-legged. All distinct at 64px. Roster is coherent and gap-complete.
