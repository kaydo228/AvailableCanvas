# Game Design Canvas Implementation Plan

> Use the approved scope in ../specs/2026-10-03-game-design-canvas.md. User explicitly requested implementation of all stages and push. Execute independent domains in parallel, integrate and review before push.

**Goal:** turn Prostor into a usable visual game design document and fix arrow creation.
**Architecture:** additive optional design payload on ShapeNode, relation on ConnectorNode, named snapshots on BoardDocument; existing Konva/Zustand/storage paths.
**Tech Stack:** React, TypeScript, Konva, Zustand/Immer, Zod, Vitest/Playwright; no dependencies.
**Spec:** ../specs/2026-10-03-game-design-canvas.md

## Constraints
- Preserve old boards, freehand drawings, user sessions and existing manual routing choices.
- Canvas nodes use Konva. Side panels use accessible React forms and existing theme tokens.
- No new collaboration backend or promises of simultaneous multi-user editing.
- Push authorized; use a codex/ branch and exclude unrelated pre-existing files.

## Review focus
- New data survives JSON/clipboard/save and cloud round trips.
- Copying sections remaps memberships and internal references; deleting section preserves contents.
- Collapsed sections hide their children from rendering/selection and arrows ignore the section frame.
- Versions preserve image blobs and restore without recursively embedding snapshots.
- Switching selected cards/project while editing does not overwrite another card.

## Task 1: Connections (agent, connectors/** and useToolController)
- [x] Read pointer→endpoint→route→renderer path; reproduce seven failing regression tests.
- [x] Implement P as connector, obstacle route, external snapping and accurate draft.
- [x] Verify focused vitest, updated arrow e2e, typecheck/lint; root runs full suite.

## Task 2: Design data and persistence (agent)
- [x] Add model/actions/templates per shared/types/design.ts and task interface brief.
- [x] Add schema/repair/clipboard/duplication/snapshot image retention integration.
- [x] Test real actions, JSON round trips, references, sections and version restoration.

## Task 3: Design panels (agent)
- [x] Sidebar for search/filters/outline/templates; card/section/reference inspector.
- [x] Semantic links/backlinks, parameter tables, playtest fields, comments.
- [x] Reading and version dialogs, Markdown download, object link.
- [x] Verify UI component tests and typecheck/lint.

## Task 4: Canvas/app integration (root)
- [x] Konva card/section/reference renderers; collapsed content and selection behavior.
- [x] Integrate sidebars/inspectors/dialogs, deep linking; test complete browser workflow.
- [x] Independent review, full checks and performance; fix concrete findings.
- [x] Update README and prepare verified changes for the authorized commit and push on codex/game-design-canvas.

## Integration verification
- Independent review findings corrected: group/section ownership across grouping and ungrouping, insertion into collapsed sections, and repeated route calculations during camera movement.
- Browser inspection corrected dark-theme relation-label contrast and template spacing; fresh templates no longer trigger false repair warnings.
- TypeScript, Biome and production build pass (existing non-blocking diagnostics remain).
- 677 unit tests and 89 browser scenarios pass; all four performance checks pass. The 1,000-object camera benchmarks measured 127–131 FPS locally.
- All new data remains additive to schema version 1; Markdown is text-oriented, while JSON carries image assets and saved versions.
