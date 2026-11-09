# Refactor observations — found and intentionally NOT fixed

Running log of defects, smells and couplings encountered during the
structure-only refactor. Nothing here is changed by the refactor (iron rule 5);
each item records a proposed follow-up for a future, behavior-changing task.

## Backend

1. **God-classes block the 300-line target (Tier B territory).**
   `payables/service.ts` ≈ 932-line `PayablesService`; `assistant/service.ts`
   ≈ 861-line `AssistantService`; `assistant/facts.ts` ≈ 594-line
   `AssistantFacts`; `workspace/service.ts` ≈ 341-line `WorkspaceService`.
   Tier A can only shave their small top-level helpers. Splitting a NestJS
   service class into collaborating services is a behavioral risk (transaction
   boundaries, retry receipts, audit atomicity) and requires the brief's Tier B
   gate (proven mechanical equivalence + explicit approval). Proposed follow-up:
   extract pure calculation/serialization private methods into domain helpers
   behind tests first, then split classes per responsibility.
2. **Inline domain controller in the composition root.** `app.ts` defined
   `ChecklistController` (lines 79–183) while every other domain owns its
   controller file. Addressed by the sanctioned phase-B2 verbatim extraction —
   listed here because it was a structural defect, not because it remains.
3. **Mixed singular/plural domain folders.** `subscription.*` files (singular)
   sat loose in `src/` while the frontend feature is `subscriptions/` (plural).
   Phase B2 mirrors the frontend name. `checklist.*` similarly.
4. **Operator scripts depend on compiled output paths.** `backend/scripts/*.mts`
   import `../dist/src/*.js` specifiers, so every backend file move must update
   scripts even though no runtime behavior changes. A future task could add a
   single `dist` barrel or path constant to reduce this coupling.

## Frontend

5. **Single-unit oversized components (Tier B territory).** After Tier A moves
   these remain >400 lines as single function bodies and cannot be split without
   touching bodies: `payables/pages/invoice-detail.tsx` (`Detail`, 564),
   `payables/sample/development-store.ts` store internals, `operations` invoice
   editor (193) is fine, but `subscriptions` `RenewalsBody` (496),
   `checklist` `ChecklistBody` (440), `workspace` `ReceivablesRegister` (494),
   `public-chat` `PublicChat` (391), `marketing` `ProductPreview` (321),
   `app/Shell.tsx` (298). Proposed follow-up: body-level splits with dedicated
   tests per feature, post-refactor.
6. **Three different "Assistant" modules + two "Administration" modules** are
   deliberate (see `docs/repository-guide.md` naming cautions). The refactor
   preserves every exported identifier and adds folder-level disambiguation
   (`demo/legacy-assistant/`, `demo/public-assistant-slot/`,
   `assistant/components/`) plus the mandated short module-boundary comments.
7. **Marketing depends on demo state.** `marketing/ProductPreview.tsx` and
   `ReferenceHome.tsx` import `../../store`, `../../demo/selectors`,
   `../../demo/seed` to render miniature demo views on public pages. This is
   intentional public-sample coupling (fictional data on public pages), but it
   means the demo sandbox is not standalone: moving demo state (F4) necessarily
   touches marketing imports. Not a private-data boundary violation.
8. **`payables/schemas.ts` is coupled into the contracts generator.**
   `contracts/generate-payables.mts` requires the frontend source module
   directly, so `payables/api/schemas.ts` (F5) must update the generator — the
   single sanctioned contracts edit. Long-term proposal: have the generator read
   a build artifact or duplicate the schema in `contracts/` with a drift check.
9. **`styles/global.css` (2735 lines) mixes tokens/base with demo rules.**
   Phase F6 will move a contiguous demo block only if cascade order is exactly
   preservable; otherwise documented as-is (see move-map F6).
10. **`outstandingCustomers.ts` vs `OutstandingCustomers.tsx`** naming differs
    only by case (deliberate: calculation vs mode-selection UI). Preserved; the
    feature-map and README disambiguate.

## Environment (sandbox, not repository defects)

11. `test:checklist`'s "stopping the real backend…" test fails here because the
    spawned fixture can outlive SIGTERM longer than the suite's 7-second UI
    deadline; passes in CI. Recorded in the baseline as an accepted
    environment-caused deviation that must reproduce identically after each
    phase.
12. The sandbox presets `DATABASE_URL`, which `--env-file` will not override;
    all DB-backed suites need an explicit environment variable here.
13. `npm ci` in this sandbox skips postinstall scripts (esbuild, prisma) with
    warnings; builds and `prisma generate` still succeed.

## Historical evidence policy

14. `context/*.md` and the two inventory TSVs mention current file paths that
    will be stale after the refactor. They are dated evidence and stay untouched
    per the repository guide's own rule; `docs/repository-guide.md` and
    `docs/feature-map.md` are the living catalogs.
