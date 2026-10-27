# Skills used to build Blemia

Agent skills (Cursor / Claude) that guided the development of Blemia. They are copied here as they were
when the work was done, so the process can be reproduced. They are not part of the app and are not built or deployed (the product's own agent skills are in `skills/`).

| Skill | Used for |
|---|---|
| `threejs-game-director` | Routing the 3D landing work across the other Three.js skills |
| `threejs-game-ui-designer` | The chat dock, HUD-style panels, responsive layout and text fit |
| `threejs-aaa-graphics-builder` | Materials, lighting and the render pipeline for Blemi |
| `threejs-3d-generator`, `threejs-image-generator` | Asset sourcing options (concept art, textures, models) |
| `threejs-qa-release` | Release checks: builds, captures, budgets |
| `verifying-game-visuals` | Lockstep captures and projection tests (`scripts/visual/`) |
| `threejs-loaders`, `threejs-animation`, `threejs-materials`, `threejs-performance`, `threejs-postprocessing` | Blender skills for the Blemi model: meshopt GLB loading, clips, materials, render budget |
| `karpathy-guidelines`, `ponytail` | Coding behaviour: small changes, stated assumptions, verifiable goals |
| `building-with-typesafe-jev` | The Jev decision layer (effort picker, lead triage, claim check) |

Sources: most come from the author's local skill folders (`~/.claude/skills`, `~/.cursor/skills`); the five Blender
skills come from `Blender/piano-ai/skills` (see `superpowers-LICENSE`); `ponytail` is from
https://github.com/DietrichGebert/ponytail. Check each upstream's license before making this repo public.
