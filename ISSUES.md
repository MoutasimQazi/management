# Movenetics Workspace — Issues

What was found in a static pass over the code, what was fixed, and what is still
open. Kept next to [USE-CASES.md](USE-CASES.md) so a gap in one is traceable to
the other.

Nothing here came from running the app — there is no MySQL or web server on the
machine this was audited from. Everything below was found by reading the code and
cross-referencing the pages against the endpoints, so each entry names the file
and the evidence.

---

## Fixed

### I-01 · Live diagnostic endpoint, unauthenticated · **security** · fixed

`pm-backend-php/debug-headers.php` was reachable by anyone, with no auth check and
`Access-Control-Allow-Origin: *`. It echoed back the `Authorization` header, the
SAPI name and every request header. Its own comment said *"Delete this file once
auth works."* Auth works.

**Fixed:** file deleted.

---

### I-02 · A second delete endpoint carrying an already-fixed bug · **correctness** · fixed

`pm-employees-delete.php` checked only `tasks` before deleting a developer. But
`questions.employee_id` and `leave_requests.employee_id` are foreign keys into
`employees` too, and neither cascades — so it threw a raw constraint error on any
developer who had asked a question or booked a day off. This is the exact defect
that was fixed in `pm-people-delete.php`; the fix never reached the older copy.

Nothing called it — the only reference was a comment in `hr.js` saying it was
superseded but *"stays on disk — it is still a valid way to remove a developer"*.
It was not.

**Fixed:** file deleted, and the `hr.js` comment corrected to say why.

---

### I-03 · Two more superseded endpoints still reachable · **cleanup** · fixed

`pm-managers-deactivate.php` and `pm-managers-role.php` were both dead — no page
referenced either. `pm-people-role.php` is a strict superset of the second: it
handles both directions between the roster and staff logins, and guards the
last-admin case, which `pm-managers-role.php` did too but in isolation. Two admin
endpoints that can change roles is one more than can be kept in step.

**Fixed:** both deleted. 79 endpoints → 75.

---

### I-04 · Test cases could not be edited · **functional gap** · fixed

`pm-testcases-update.php` was fully written — correctly scoped through
`projectScope()`, handling partial updates, distinguishing "clear the link" from
"leave it alone" — and **no page ever called it**. A QA account could create a test
case and delete one, but never correct it.

That mattered more than a normal missing edit button, because the delete dialog
says exactly what deleting costs:

> *Every result recorded against it goes too.*

So fixing a typo in a case title meant discarding its entire run history.

**Fixed:** an Edit button on each row in `qa.js`, reusing the New test case form in
edit mode rather than adding a second form. The project a case belongs to stays
locked while editing — its results and any bugs raised from it are scoped to that
project. Opening "+ New test case" while an edit is half-done now resets the form
instead of saving over the case being edited.

---

## Open

### I-05 · No way to reactivate a deactivated account · **functional gap** · P2

Removing someone whose work is still referenced deactivates them rather than
deleting — correct, and the login stops working immediately. *Show deactivated*
brings them back into view. But there is no **Reactivate** button.

The only route back is changing the person's role, which sets `is_active = 1` as a
side effect. That works, but nobody would guess it, and it is not available at all
if you want them back in the same role they had.

**Fix:** add a Reactivate action on deactivated rows in HR › People, calling a small
endpoint that sets `is_active = 1` (staff) or `status = 'ACTIVE'` (developers).
Admin-only, same as the role change.

---

### I-06 · Openings and candidates cannot be deleted · **functional gap** · P3

`pm-openings-*` and `pm-candidates-*` have create and update but no delete. An
opening created by mistake, or a candidate entered against the wrong role, stays
forever. Closing an opening hides it from the active list, which covers most of it —
a candidate added in error has no equivalent.

This may be deliberate: recruitment records are the kind of thing you want kept.
Worth a decision either way rather than leaving it as an accident of what got built.

---

### I-07 · Marketing can be a leave approver but sees no approvals elsewhere · **consistency** · P3

Marketing accounts can approve leave, and now have the panel for it. But marketing
also owns projects and tasks like a business analyst, without the Overview page a BA
gets — no insights, no "who is on what", no extended-deadlines panel. Whether that is
right depends on whether marketing is meant to be a full project owner or a
lighter-weight one. Currently the permissions say full, and the UI says light.

---

### I-08 · Static bearer tokens · **security** · accepted

Tokens are long-lived, stored in the database and in browser storage, and never
rotate or expire on their own. A leaked token is valid until an admin deactivates
the account.

This is recorded in `auth.php` and is a known trade-off for an internal tool, not an
oversight. Listed here so it is not rediscovered as new. Deactivating an account does
revoke immediately, which is the mitigation that matters most.

---

### I-09 · No public-holiday calendar · **known limitation** · accepted

Estimated hours become a target date at 8 hours per working day, skipping weekends.
Public holidays are not modelled, so estimates that span one land a day early. The
workspace has no holiday calendar and inventing one would be worse than the small
optimism this leaves. Recorded in `auth.php` alongside the calculation.

---

## Verified, not an issue

| | Checked because | Result |
|---|---|---|
| `pm-testcases-update.php` scoping | Newly wired up, so newly reachable | Scoped through `projectScope()`; a case outside your projects is refused before the update runs |
| Demo status control | The enum exists in the backend | `#demoStatus` select is present in the demo form — settable, not orphaned |
| CRUD completeness across 11 entities | Looking for more orphaned endpoints | Only test cases were incomplete; see I-06 for the two intentional gaps |
| Endpoints called but missing | The reverse of an orphan | None — every endpoint a page calls exists |

---

*Audited 20 Aug 2026 against build `?v=46`.*
