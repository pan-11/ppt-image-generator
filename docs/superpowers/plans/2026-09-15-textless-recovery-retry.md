# Textless result recovery and failed-page retry

## Authorized scope

The user approved accepting the already generated textless page and requested one-click retry of failed pages while preserving successful pages. Keep the existing source selection, frozen run manifest, prompt, model and page order. No schema migration, provider setting changes, new dependencies or automatic paid generation.

## Design

- Accept at most two pixels of deviation on each requested output dimension. Compare aspect-ratio intervals derived from that shared allowance plus half a pixel for integer quantization: each observed image permits ratios between `(width - 2.5) / (height + 2.5)` and `(width + 2.5) / (height - 2.5)`. Compatible intervals account for simultaneous axis rounding and different source/output resolutions without an independent percentage cutoff. Fully decode textless source and output. Preserve image bytes.
- Use the same ratio comparison in PPT export, including source/result and result/slide-canvas validation. Textless slides use the source page's slide ratio so the original and textless decks share their layout. Anchor all pages to that fixed canvas rather than to the first rounded result.
- Add an explicit local-only restore endpoint for a textless run. Revalidate only saved results of failed validation-stage jobs at their current attempt. Atomically update result validation, job/task/batch status only if the job has not changed during decoding. Do not contact a relay, increment attempts, regenerate, change a manifest or create another image.
- Restore once when a processing record is opened; retain ordinary read-only polling afterwards. The retained successful result becomes visible through the existing image selection query.
- Add a failed-page count and a `重试失败页` button beside the export actions. Send only unique failed/unknown task IDs from the selected run through the existing retry endpoint. Disable actions during a request and preserve the existing unknown-submission confirmation.
- Distinguish confirmed remote generation failures from download/query failures using a typed adapter error persisted in the existing error-stage field. Explicit retry clears remote bindings only for confirmed failures; their new calls use the currently active provider. Downloads and unfinished remote tasks retain their original binding. Recognize the existing unambiguous GrsAI/Cangyuan terminal failure messages for old records. No automatic retry loop.

## Implementation and verification

1. Add failing regressions for the real rounded output, local restoration, corrupt/wrong-ratio results, PPT layout, partial retry, provider switching and stale/double-click UI responses.
2. Implement shared size checks, local restoration, terminal failure classification, and the scoped UI controls.
3. Run focused tests, then `npm test` and `npm run build`. Inspect the complete diff for scope and data safety.
4. Copy verified source files into the primary checkout only after confirming its source has not changed. Use the live restore endpoint for the reported run and verify the real image becomes successful and exports. Verify the retry button with mocked traffic; do not submit actual failed pages.

## Workspace convention

Use the ignored `.worktrees/textless-recovery-retry` checkout for implementation and tests. Retain it and all local user data. Source tests stay in the existing server/tests and web/src/tests directories. Validation helpers stay in server/src/lib. Retained browser/export evidence belongs to ignored primary app-data.

## Verification status

- Page-12 follow-up: the real 1670x942 result passes both two-pixel axis checks but failed the former 0.2% ratio cutoff. Reproduced 12 failing cases, then the shared pixel-based ratio check and fixed-canvas PPT comparison passed all 43 focused tests. Coverage includes 200 allowed two-axis combinations across landscape/portrait/square and different resolutions, the actual page-12 generation and local restore, and opposite rounding directions in either export order. Full checks passed 392 tests (server 266/web 126), build and diff whitespace validation.
- Page-12 delivery: guarded synchronization applied the two source files, two tests and this plan to primary. The existing local restore endpoint recovered page 12, leaving the original result ID/bytes and attempt count 2 intact; all other job rows and image bytes remain unchanged. All 23 pages are completed. Both actual exports contain 23 full-slide images in the saved order with intact bytes and identical 16:9 geometry. Live desktop/mobile browser checks show the successful 1670x942 result and zero failed pages without errors/overflow. No remote generation calls. Evidence is retained in primary app-data/textless-page12-*; source changes remain uncommitted. The checks below describe the earlier 1671x941 fix.
- Reproduced the original size/ratio failures and old terminal-task retry problem before implementation.
- Focused suite: 142 backend tests and 7 panel tests passed.
- Full suite: `npm test` passed 376 tests (server 250, web 126); `npm run build` passed; diff whitespace check passed.
- Regressions include concurrent retry during local decoding, source/result byte preservation, unchanged successful siblings, current-provider dispatch for a fresh retry, recorded-provider recovery for downloads, and matching PPT page geometry.
- All 13 source/test/plan files were synchronized to primary with matching hashes after checking its unchanged base and inactive queue. The reported existing result is now completed, with its original image ID, file bytes and attempt count retained.
- Actual final/textless PPT exports each contain one full-page image and matching 16:9 slide dimensions. Live desktop/mobile browser checks display the restored image; mocked partial retry sends only the two failed pages once. No browser errors, overflow, unexpected writes or actual generation calls. Local evidence is retained under primary app-data/textless-recovery-* and textless-retry-*.
