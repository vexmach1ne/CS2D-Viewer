# Sound effects specification

The viewer currently generates procedural Web Audio tones rather than shipping recorded game audio. Replacement assets can use the cue names below.

## Delivery requirements

- Preferred formats: `.ogg` or `.wav`.
- Sample rate: 48 kHz.
- Channel layout: mono. The viewer applies map-based stereo panning.
- Normalize close to `-3 dBFS` and avoid baked positional panning or long environmental reverb.
- Provide 2–4 variations for repeated weapon and impact sounds where possible.

## Active cues

| Cue filename | Trigger / purpose | Suggested duration |
| --- | --- | ---: |
| `weapon-heavy` | AWP, G3SG1, SCAR-20, and SSG 08 shots | 0.2–0.5 s |
| `weapon-shotgun` | MAG-7, Nova, Sawed-Off, and XM1014 shots | 0.2–0.45 s |
| `weapon-rifle` | Rifles, SMGs, and machine guns not in another class | 0.08–0.2 s |
| `weapon-pistol` | Pistols and revolvers | 0.06–0.16 s |
| `flash-explode` | Flashbang detonation | 0.1–0.35 s |
| `he-explode` | HE grenade detonation | 0.25–0.7 s |
| `smoke-deploy` | Smoke grenade blooms | 0.3–0.8 s |
| `molotov-ignite` | Molotov/incendiary ignites | 0.2–0.5 s |
| `molotov-extinguish` | Fire zone ends or extinguishes | 0.15–0.4 s |
| `c4-plant-start` | Player begins planting the bomb | 0.1–0.3 s |
| `c4-plant-finish` | Bomb plant completes | 0.25–0.7 s |
| `c4-defuse-start` | Player begins defusing | 0.1–0.3 s |
| `c4-defuse-finish` | Bomb defuse completes | 0.25–0.7 s |
| `c4-explode` | Bomb explodes | 0.5–1.5 s |
| `bomb-beep-a` | Standard planted-bomb beep at A site | 0.04–0.12 s |
| `bomb-beep-a-ten` | Urgent A-site beep during the final 10 seconds | 0.03–0.1 s |
| `bomb-beep-b` | Standard planted-bomb beep at B site | 0.04–0.12 s |
| `bomb-beep-b-ten` | Urgent B-site beep during the final 10 seconds | 0.03–0.1 s |
| `damage-hit` | Standard armour/body damage impact | 0.02–0.1 s |
| `damage-headshot` | Headshot damage event | 0.02–0.12 s |
| `damage-burn` | Molotov/incendiary damage tick | 0.03–0.12 s |
| `door-open` | Door interaction/open event | 0.15–0.5 s |
| `round-win-ct` | CT round win stinger; use an original non-infringing sound or voice | 0.5–1.5 s |
| `round-win-t` | T round win stinger; use an original non-infringing sound or voice | 0.5–1.5 s |

## Optional cues

These cue types are retained in the audio catalog but are not currently triggered by the playback runtime.

| Cue filename | Intended purpose |
| --- | --- |
| `smoke-emit` | Grenade release/throw emission before smoke deploys |
| `molotov-loop` | Looping ambience while an inferno zone is active |
| `molotov-loop-fade` | Tail used when the inferno loop stops |
| `bomb-plant` | Legacy/general plant cue; the runtime uses the C4 plant cues above |
| `bomb-defuse` | Legacy/general defuse cue; the runtime uses the C4 defuse cues above |
| `round-win` | Legacy/general round-win cue; the runtime uses side-specific CT/T cues above |

## Optional weapon-specific overrides

The current runtime groups weapons into four classes. It can be extended to prefer a weapon-specific file first and fall back to its class cue. Suggested override names include `ak-47`, `m4a4`, `m4a1-s`, `awp`, `glock-18`, `usp-s`, and `desert-eagle`.
