# 执行裁定与范围

以下按实际作出顺序保留实施与审查的裁定，均以只改后台前端、保留真实业务行为为依据。

- Ruling: native worktree creation cannot address nested repository (Not a git repository); used git worktree fallback outside the source repository — no source checkout changes
- Ruling: retain existing business contracts where Figma supplies demo-only behavior — omit demo login, simulated upload, and verified labels absent from API — costs visual fixture text differences
- Ruling: candidate counts are hidden on published rows with unpublished changes — API does not expose the current published counts — costs less supplementary row text
- Ruling: sorting table omits modification dates absent from OrderedCard — no backend change authorized — costs one design column
- Ruling: use current browser-installed Chrome for isolated Playwright checks — bundled browser download stalled — browser version differs from CI default
- Final: Ruling: regraded playback rejection residue as Important state-truthfulness regression — successful playback must not retain a false failure alert — cost: one added regression test
- Final: Ruling: demo login/sample uploads remain omitted — real production interaction is the approved requirement — cost: fixture-only screen labels differ
- Final: Ruling: published candidate counts remain hidden when published counts unavailable — avoid mixing versions — cost: one supplemental line absent
- Final: Ruling: sorting modified time remains omitted — OrderedCard has no field, no backend scope — cost: one design column absent
- Final: Ruling: unknown historical contact source remains unverified — no trustworthy source enum — cost: conservative label
- Final: Ruling: no new partial user-statistics contract — current AdminUser.statistics is required; existing unknown/error/zero states retained — cost: independent partial-statistics UI requires backend work
- Final: Ruling: no deployment or real cloud provider calls — local-only approved scope — cost: production integration still needs separate validation
- Final: Ruling: 80-state mapping is not an 80-frame pixel-perfect pass — actual evidence and unpictured states explicitly listed — cost: per-state visual QA remains broader than this run
- Ruling: preserve local delivery worktree and feature branch as approved in the plan — no merge/push/deploy authorization needed — cost: integration remains a later user choice
- Ruling: move disposable preview runner out of plan scratch before removing scratch — user retains runnable local preview — cost: temporary files remain in /tmp until preview is stopped

独立审查提出的三项重要问题及播放提示残留均已修复，无暂缓项。线上部署、供应商联调、80张逐帧像素验收等未列入本轮证据的工作保留明确边界。
