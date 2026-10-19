# SDD ledger — plan: docs/superpowers/plans/2026-10-19-admin-figma-rev14.md

- Baseline: test / 09a36c0; isolated branch codex/admin-figma-rev14
- Ruling: native worktree creation cannot address nested repository (Not a git repository); used git worktree fallback outside the source repository — no source checkout changes
- Pre-flight: Tasks 2–5 consume Task 1 theme; preserve existing props/events and window scroll restoration
- User decision: existing repository AGENTS.md applies; shared file missing and explicitly waived
- Task 1: complete — theme, local fonts/icons, layout; pnpm check and build passed
- Task 2: complete — list, login, sorting, filtering; filter regression RED→GREEN, list/catalog tests passed
- Task 3: complete — editor, preview, media and custom audio; native audio playback/seek/rate regression RED→GREEN
- Task 4: complete — inline review and initial ZIP queue; table/staging and queue hand-off regressions RED→GREEN
- Task 5: complete — users/detail/statistics, truthful contact sources; source-label tests RED→GREEN
- Task 6: in progress — 70/70 unit tests; check/build pass; browser regression running
- Ruling: retain existing business contracts where Figma supplies demo-only behavior — omit demo login, simulated upload, and verified labels absent from API — costs visual fixture text differences
- Ruling: candidate counts are hidden on published rows with unpublished changes — API does not expose the current published counts — costs less supplementary row text
- Ruling: sorting table omits modification dates absent from OrderedCard — no backend change authorized — costs one design column
- Ruling: use current browser-installed Chrome for isolated Playwright checks — bundled browser download stalled — browser version differs from CI default

- Final review: fresh reviewer gpt-6-astra; no critical, three Important, one Minor
- Final: fixed import preview clipping — long import preview RED→GREEN using shared ScenePreview import mode
- Final: fixed publication error footer clipping — actual 422 response test RED→GREEN using a flex dialog with shrinkable body
- Final: fixed compact editor omission — three-field alignment/row height regression RED→GREEN, preserved all source/reading/reordering controls
- Final: Ruling: regraded playback rejection residue as Important state-truthfulness regression — successful playback must not retain a false failure alert — cost: one added regression test
- Final: fixed playback rejection residue — first play rejection then successful playback test RED→GREEN; no deferred findings remain
- Final: Ruling: demo login/sample uploads remain omitted — real production interaction is the approved requirement — cost: fixture-only screen labels differ
- Final: Ruling: published candidate counts remain hidden when published counts unavailable — avoid mixing versions — cost: one supplemental line absent
- Final: Ruling: sorting modified time remains omitted — OrderedCard has no field, no backend scope — cost: one design column absent
- Final: Ruling: unknown historical contact source remains unverified — no trustworthy source enum — cost: conservative label
- Final: Ruling: no new partial user-statistics contract — current AdminUser.statistics is required; existing unknown/error/zero states retained — cost: independent partial-statistics UI requires backend work
- Final: Ruling: no deployment or real cloud provider calls — local-only approved scope — cost: production integration still needs separate validation
- Final: Ruling: 80-state mapping is not an 80-frame pixel-perfect pass — actual evidence and unpictured states explicitly listed — cost: per-state visual QA remains broader than this run

- Task 6: complete — pnpm check/build pass, 71/71 unit tests, 12/12 browser tests passed in fresh isolated runtime
- Ruling: preserve local delivery worktree and feature branch as approved in the plan — no merge/push/deploy authorization needed — cost: integration remains a later user choice
- Ruling: move disposable preview runner out of plan scratch before removing scratch — user retains runnable local preview — cost: temporary files remain in /tmp until preview is stopped

- Final verification: pnpm check PASS; pnpm test 71/71 PASS; pnpm build PASS; pnpm test:e2e 12/12 PASS (34.5s), no skips
- Fixture finding: repeated runs with a frozen timestamp made the latest-10 API history sort nondeterministic; fresh isolated runner now advances its test clock — product source unchanged
- Local preview runner retained at /tmp/juya-admin-figma-rev14-preview; plan scratch removed after committing final evidence

- Final visual follow-up: scoped child fieldset max-width uses :deep; four design e2e regressions PASS, check/build PASS; no new runtime behavior
