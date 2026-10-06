# Documentation index

Design and planning artifacts for Fisio Architect 2.0. The root
[`README.md`](../README.md) is the authoritative user/developer guide; this folder holds the
historical blueprints the build was executed against.

| Path | What it is |
|---|---|
| `blueprint_v2.md` | Approved v2 design notes (Indonesian): brand profile fields, the five-agent split, batch CSV + concurrency, and the five implementation stages (IndexedDB migration first). |
| `superpowers/plans/2026-10-01-fisio-architect-2.0.md` | Strict TDD implementation plan (Tasks 0–18, checked off) for the v2 rebuild. |
| `superpowers/specs/2026-10-01-fisio-architect-2.0-design.md` | Design spec accompanying the v2 plan. |
| `superpowers/plans/2026-10-02-deterministic-scoring-loop.md` | TDD plan for deterministic scoring: measured `scoreDraft` (no fabricated scores), shared Markdown/HTML document extractor, real Flesch reading-ease, ±20% word-count band, and the revise-until-quality loop. |
| `superpowers/specs/2026-10-02-deterministic-scoring-loop-design.md` | Design spec for the scoring loop. |
| `UI/fisio.pen` | UI design file for the app shell and views. |
| `images/app-generate.png` | Screenshot of the Generate view (used in the root README). |

**Reading order for new contributors:** root `README.md` → `blueprint_v2.md` (the "why") →
the plan/spec pair for the area you are touching → the code (`src/pipeline`, `src/server`).
