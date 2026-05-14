# Audit Apply Note — AIAgingInPlaceHomeModificationAssessor

## Audit recommendations (from batch_00.md)

The audit reports 1 AI endpoint. **Scanner false-negative.** `backend/routes/ai.js` defines:
`/assess-home`, `/fall-risk-assessment`, `/recommend-modifications`, `/estimate-costs`, `/budget-optimizer`, `/compliance-report`, `/find-grants`, `/modifications/stream`, `/results`.

Most audit "missing AI" items already exist:
- AI fall risk prediction → `/fall-risk-assessment`
- AI cost estimation → `/estimate-costs`
- AI accessibility score generation → covered by `/assess-home`
- AI contractor matching → not yet present
- AI ROI modeling → not yet present

### Missing non-AI features
- Photo upload for home assessment
- Contractor collaboration (shared quote review)
- Insurance claim guidance
- Post-modification follow-up

## Implemented in this pass

None. Most recommendations are already implemented (audit count incorrect). The genuinely missing ones (contractor matching, ROI modeling) need new DB joins/schema work — TOO-RISKY for mechanical add.

## Backlog (not implemented)

| Item | Category | Reason |
|---|---|---|
| AI contractor matching | TOO-RISKY | Needs contractor skills schema + matching logic |
| AI ROI modeling | NEEDS-PRODUCT-DECISION | Outcome attribution model |
| Photo upload | TOO-RISKY | File-upload pipeline + storage |
| Insurance claim guidance | NEEDS-CREDS | Insurance carrier APIs |
| Post-modification follow-up | NEEDS-PRODUCT-DECISION | Survey/measurement design |
| Microchip/registry integration | NEEDS-CREDS | (N/A — different domain) |

## Apply pass 5 (all backlog)

**Action:** SKIP — backend cannot be smoke-tested due to a pre-existing schema-init bug.

The pass-5 protocol mandates "pkill → start → login → if fails, REVERT changes". When attempting to run the backend, `initDb()` in `backend/db.js` fails with `relation "contractors" does not exist` because line 81 (CREATE TABLE modifications) references `contractors(id)` before the `contractors` CREATE TABLE statement at line 90. This is a pre-existing bug unrelated to pass 5: only `.gitignore` is committed in this repo (per `git ls-tree`), so the entire backend/frontend folder is untracked at initial state and was already broken.

In line with the pass-5 revert rule, all pass-5 BE+FE drafts (`/api/ai/contractor-match`, `/api/ai/roi-modeling`, `/api/ai/insurance-claim-guide`, FE page `AdvancedAITools.jsx`) were reverted. Files restored to their pre-pass-5 state.

The remaining backlog items (contractor matching, ROI modeling, insurance claim guidance, photo upload, post-modification follow-up, registry integration) all remain TOO-RISKY / NEEDS-CREDS / NEEDS-PRODUCT-DECISION until the schema-init bug is fixed and a working seed is provided.

## Apply pass 4 (mechanical backlog)

**Action:** SKIP — no MECHANICAL items in backlog.

Reviewed the backlog table above: every remaining item is tagged TOO-RISKY (contractor matching, photo upload), NEEDS-CREDS (insurance APIs, registry integration), or NEEDS-PRODUCT-DECISION (ROI modeling, post-modification follow-up). All AI counterparts the audit flagged are already implemented in `backend/routes/ai.js` (verified earlier). Nothing to add mechanically without risking working code or guessing product direction.

## Apply pass 3 (frontend)

**Action:** LEFT-AS-IS — FE already comprehensively wired.

Verified that `frontend/src/pages/HomeDetail.jsx` and `frontend/src/pages/AssessmentResults.jsx` already call all backend AI endpoints: `/ai/assess-home`, `/ai/fall-risk-assessment`, `/ai/recommend-modifications`, `/ai/estimate-costs`, `/ai/budget-optimizer`, `/ai/find-grants`, `/ai/compliance-report`, plus the SSE stream `/api/ai/modifications/stream`. Axios client (`frontend/src/api/client.js`) injects `Authorization: Bearer <token>` from localStorage and handles 401 redirects. No FE changes needed.
