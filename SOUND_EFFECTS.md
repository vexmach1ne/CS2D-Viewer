# Sound effects

CS2D Viewer ships recorded OGG event sounds in `assets/audio/`. They are decoded through Web Audio so the viewer can apply the user's volume setting and viewport-relative stereo panning.

The current catalog contains 18 recordings for weapon classes, utility, plants, explosions, damage, doors, and CT/T round wins. The renderer retains a small procedural fallback only for runtime cues without a supplied file: bomb beeps and C4 defuse start/finish. It does not synthesize any cue that has a supplied OGG asset.

## Included cue mapping

| Supplied file | Viewer cues |
| --- | --- |
| `weapon-heavy.ogg` | AWP, G3SG1, SCAR-20, SSG 08 |
| `weapon-shotgun.ogg` | MAG-7, Nova, Sawed-Off, XM1014 |
| `weapon-rifle.ogg` | Rifles, SMGs, machine guns, unknown firearm fallback |
| `weapon-pistol.ogg` | Pistols, revolvers, and dual pistols |
| `flash-explode.ogg` | Flash detonation |
| `he-explode.ogg` | HE detonation |
| `smoke-deploy.ogg` | Smoke deployment |
| `molotov-ignite.ogg` | Molotov/incendiary ignition |
| `molotov-extinguish.ogg` | Inferno extinguish |
| `c4-plant-start.ogg` | Plant start |
| `c4-plant-finish.ogg` | Plant finish |
| `c4-explode.ogg` | Bomb explosion |
| `damage-hit.ogg` | Damage/armour hit |
| `damage-headshot.ogg` | Headshot damage |
| `damage-burn.ogg` | Fire damage |
| `door-open.ogg` | Door opening |
| `round-win-ct.ogg` | Counter-Terrorist round win |
| `round-win-t.ogg` | Terrorist round win |

## Missing recordings

Provide these files to eliminate the remaining procedural fallback:

- `bomb-beep-a.ogg`
- `bomb-beep-a-ten.ogg`
- `bomb-beep-b.ogg`
- `bomb-beep-b-ten.ogg`
- `c4-defuse-start.ogg`
- `c4-defuse-finish.ogg`

Preferred format is mono OGG or WAV at 48 kHz, normalized near `-3 dBFS`, without positional panning or long environmental reverb.

## Attribution and redistribution

Some OGG sounds were sourced from Pixabay. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the maintainer remains responsible for confirming provenance and redistribution rights for every supplied asset.