# Movenetics Workspace — QA Test Cases

Derived from the shipped code: the `requireRole()` calls in `pm-backend-php/`,
the validated enums, the routing table, and the defects fixed to date.

**Priority** — P1 data loss, privacy breach or a role locked out · P2 a documented
workflow is broken · P3 cosmetic. **REG** covers a defect already fixed once.

## TS-01 · Access & session

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-101` | Valid sign-in lands on the role's own page | P1 | 1. Open `login.html`.<br>2. Enter a valid email and password for each of the 9 test accounts in turn.<br>3. Submit. | Each account lands on its own page: **HR → hr.html, MARKETING → marketing.html, QA → qa.html, DESIGNER → designers.html, EMPLOYEE → employee.html, ADMIN and MANAGER → index.html**. Role badge in the top bar matches. |
| `TC-102` | Wrong password is rejected without hinting which half was wrong | P1 | 1. Enter a valid email with a wrong password. Submit.<br>2. Enter an email that does not exist at all. Submit. | Both show the identical message **"That email and password combination was rejected."** No enumeration difference in text or response time. Neither writes a session. |
| `TC-103` | Account with no token set up says so | P2 | 1. Create a person with an email but no login token.<br>2. Attempt sign-in as them. | **"This account has no login token set up yet. Contact an admin."** — distinct from a bad password, because the fix is different. |
| `TC-104` | Keep me signed in controls which store is used | P2 | 1. Sign in with the box *ticked*. Close the tab, reopen the site.<br>2. Sign out. Sign in with the box *unticked*. Close the tab, reopen. | Ticked → still signed in (localStorage). Unticked → back at the sign-in form (sessionStorage). **Only one store ever holds a token at a time.** |
| `TC-105` | Signed-in visitor is not shown the form, and Back does not bounce | P3 | 1. While signed in, navigate to `login.html` directly.<br>2. Press the browser Back button. | Redirected straight to the role home. Back goes to wherever you were **before** — it does not ping-pong between login and dashboard (`location.replace`, not assign). |
| `TC-106` | Expired token on a deep page explains itself | P2 | 1. Sign in, open `projects.html#/tasks`.<br>2. Invalidate the token in the database.<br>3. Trigger any data load (switch tabs). | Sent to `login.html?m=expired` showing **"Your session expired. Please sign in again."** The marker is stripped from the URL, so a refresh does not repeat a message about a past event. |
| `TC-107` | Sign out clears both stores | P1 | 1. Sign in with "keep me signed in".<br>2. Sign out from any page.<br>3. Inspect localStorage and sessionStorage.<br>4. Press Back. | `login.html?m=out` with "Signed out." **No session key in either store.** Back does not restore a working session. |
| `TC-108` | Deactivated account cannot sign in or use a live token | P1 | 1. Sign in as qa.mkt, keep the tab open.<br>2. As admin, deactivate that account from People.<br>3. In the first tab, trigger a data load.<br>4. Try to sign in again as qa.mkt. | The open tab stops working immediately — every auth query filters on `is_active = 1`. Fresh sign-in is refused. **Deactivation takes effect without waiting for the session to expire.** |

## TS-02 · Role routing & navigation

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-201` | Admin-only section links stay hidden for every other role | P1 | 1. Sign in as each non-admin role.<br>2. Inspect the top bar; also check the DOM for `.nav-admin` elements. | Only the account's own section is visible. **Hidden links are inert** — the check is on the server too, so revealing one in devtools still gets a 403. |
| `TC-202` | Design and QA appear in the nav for admin on every section page | P2 REG | 1. As admin, visit projects.html, hr.html and marketing.html.<br>2. Confirm all seven section links are present and reachable.<br>3. Narrow the window through 1240px and below. | All seven visible at every width. **No horizontally clipped links** — the bar previously overflowed with `scrollbar-width:none`, silently hiding Design. |
| `TC-203` | Typing another role's page URL does not grant it | P1 | 1. Sign in as qa.dev1.<br>2. Manually navigate to hr.html, marketing.html, qa.html, designers.html, projects.html. | Each page loads its shell but every data call is refused. **No list renders any row.** The page either sends them to the sign-in door or shows the "not available to your account" message — never partial data. |
| `TC-204` | Projects: Overview is its own tab and one click reaches the list | P2 REG | 1. From anywhere, click the top-bar *Projects* link.<br>2. Note which sub-nav tab is highlighted.<br>3. Click *Projects* in the sub-nav once. | Landing shows the overview with **Overview** highlighted — not Projects. One click on Projects shows the list. **Clicking an already-highlighted tab is never required to see content.** |
| `TC-205` | Sub-nav highlight matches the visible page on every route | P3 | 1. On projects.html visit each hash in turn: `#/dashboard`, `#/projects`, `#/project/1`, `#/tasks`, `#/questions`, `#/rates`. | Highlight follows the section shown. **A single project's detail is the one exception** — it highlights Projects, which is where it belongs. |
| `TC-206` | Rate card tab is admin-only and unreachable by hash | P2 | 1. As qa.ba1, confirm no Rate card tab.<br>2. Navigate to `projects.html#/rates` directly. | Silently redirected to the overview. **The rate card is company policy about how long work takes** — the endpoint refuses non-admin writes regardless. |
| `TC-207` | Unknown hash falls back to the section landing page | P3 | 1. Visit `projects.html#/nonsense` and `qa.html#/../etc`. | Router clamps to the default page. **No blank screen, no JS error in the console.** |

## TS-03 · Authorization

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-301` | Every N in the matrix returns 403 with a useful message | P1 | 1. For each row, call the endpoint with each denied role's bearer token.<br>2. Record status and body. | **403 every time**, body `{"error":"This action requires one of: …"}`. No row of data is ever returned alongside a 403. |
| `TC-302` | Missing, malformed and stale tokens all give 401 | P1 | 1. Call `pm-projects-list.php` with no Authorization header.<br>2. Repeat with `Bearer` + empty, a random string, and a token belonging to a deactivated account. | **401 "Invalid or missing token"** in all four cases. Never a 500, never an empty 200. |
| `TC-303` | Company-wide leave roster is refused to developers, QA, design and marketing | P1 REG | 1. As qa.dev1, call `pm-leave-list.php` with no query string.<br>2. Repeat as qa.tester, qa.design, qa.mkt.<br>3. Repeat each with `?mine=1`. | Unscoped call → **403 "You can only see your own leave. Ask HR for anyone else's."** `?mine=1` → 200 with only their own rows. This was previously open to every signed-in account. |
| `TC-304` | A BA sees only their own projects | P1 | 1. As qa.ba1, list projects, tasks, questions and demos.<br>2. Note ba2's project id, then request it directly by id. | Lists contain ba1's projects only. Direct request for ba2's project is **refused, not merely absent from a list**. |
| `TC-305` | QA is scoped to qa_assignments | P1 | 1. As qa.tester, open My projects, Bugs and Test cases.<br>2. Ask an admin to remove the assignment; reload. | Only the assigned project and its bugs/cases appear. **After removal the lists empty out** and My projects explains how to get access back. |
| `TC-306` | Designer is scoped to design_assignments | P1 | 1. As qa.design, open My work and Projects.<br>2. Attempt to create a design task against an unassigned project id. | Only assigned projects listed and selectable; the crafted create is **refused**. |
| `TC-307` | Developer is scoped to the projects they hold tasks on | P1 | 1. As qa.dev1, list tasks, bugs, questions and demos.<br>2. Sign in as qa.dev2, who has no tasks. | dev1 sees only their own project. dev2 sees **empty states with guidance, not errors and not everyone's data**. |
| `TC-308` | Admin sees everything the scope helpers gate | P2 | 1. As admin, list projects, tasks, demos, bugs, design tasks and extensions. | Every row in the database is present — **both scope helpers short-circuit to `1=1` for ADMIN**. |
| `TC-309` | Role change takes effect on the next request | P2 | 1. Sign in as qa.mkt in one browser.<br>2. As admin, change that account's role to QA.<br>3. In the first browser, reload. | The account now gets QA's access and lands on qa.html. **No stale permissions survive the reload** — role is read from the database per request, never from the client session. |

## TS-04 · Projects & tasks

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-401` | Create a project with only the required fields | P2 | 1. As qa.ba1, open Projects → + New project.<br>2. Enter a name only; submit.<br>3. Submit again with the name blank. | Created with sensible defaults (priority MEDIUM, status ACTIVE). Blank name → **"A name is required."** and nothing written. |
| `TC-402` | Invalid status or priority is rejected, not silently defaulted | P2 | 1. Call `pm-projects-update.php` with `status:"DONE"` and again with `priority:"URGENT"`. | Values outside the enum **fall back to the documented default rather than being stored**. Confirm by re-reading the row — no free text ever reaches the status column. |
| `TC-403` | Business analyst shown on the projects list, and reassignable by admin | P2 | 1. As admin, open Projects → the list.<br>2. Confirm a *Business analyst* column.<br>3. Reassign a project from ba1 to ba2. Sign in as each. | Column shows the owning BA. After reassignment **ba2 sees the project and ba1 no longer does**. |
| `TC-404` | A project can only be owned by an active BA or an admin | P2 | 1. Attempt to set a project's owner to an HR, QA, designer or deactivated account. | **"A project can only be owned by an active business analyst or an admin."** Owner unchanged. |
| `TC-405` | Assigning a task makes it appear in that developer's login | P1 | 1. As ba1, create a task on a project and assign it to qa.dev1.<br>2. Sign in as qa.dev1 → My tasks. | The task is listed. **Assigned work must always be visible to its assignee** — this is the single most repeated defect class in this codebase. |
| `TC-406` | Developer can move their own task's status and nothing else | P2 | 1. As qa.dev1, change a task from TODO to IN_PROGRESS to COMPLETED.<br>2. Call `pm-tasks-update.php` as the same account to rename the task.<br>3. Call `pm-tasks-status.php` for a task belonging to another developer. | Status moves succeed. Rename is **403 — tasks-update is manager-only**. Another developer's task is refused. |
| `TC-407` | Who is on what shows real allocation and names the gaps | P2 | 1. As admin, open the panel on both the Overview and the Projects overview.<br>2. Create a project with no QA and no designer. | Each project lists its BA, developers, QA and designers. **Projects missing a role are called out** rather than silently showing a short list. Non-admin gets no panel and the endpoint refuses them. |
| `TC-408` | Deleting a project does not orphan its work | P1 | 1. Create a project with tasks, a bug, a test case, a design task and a demo.<br>2. Delete the project.<br>3. Re-check every list and the database. | Either the delete is **refused with a message naming what is attached**, or all children go with it. No half-deleted state, no rows pointing at a missing project, no 500. |
| `TC-409` | Overview stat numbers link to the pages behind them | P3 | 1. On the Overview, click each headline figure. | Each opens the matching list — projects, tasks, questions — **filtered to what the number counted**, not the unfiltered page. |

## TS-05 · Questions

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-501` | Developer raises a question against one of their tasks | P2 | 1. As qa.dev1, open Questions.<br>2. Confirm the task picker lists only their own tasks.<br>3. Submit a question. | Only their tasks are selectable. Question appears in their list as unanswered and **on the owning BA's dashboard**. |
| `TC-502` | Only a manager can answer | P2 | 1. Call `pm-questions-answer.php` as qa.dev1, qa.tester and qa.design.<br>2. Then as ba1. | First three **403**. BA succeeds and the answer shows on the developer's page. |
| `TC-503` | Open questions surface where they demand action | P3 | 1. Leave a question unanswered.<br>2. Check the BA's Overview and the Projects overview. | Listed under Open questions with a link through. **Answered questions drop off** that panel. |
| `TC-504` | A BA cannot see another BA's questions | P1 | 1. Raise a question on a ba2 project.<br>2. List questions as ba1. | **Absent from ba1's list**, and refused if requested by id. |

## TS-06 · QA module

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-601` | Report a bug with the minimum fields | P2 | 1. As qa.tester, report a bug with project, title and severity only.<br>2. Retry with the title blank. | Created as OPEN. Blank title → **"A project and a title are required."** |
| `TC-602` | Bug sorting puts what needs work at the top | P3 | 1. Create bugs across all six statuses and all four severities.<br>2. Open the Bugs list. | **OPEN and REOPENED first, most severe first within that**; closed and verified sink. |
| `TC-603` | Bug assigned to a developer appears in their login | P1 REG | 1. As qa.tester, assign a bug to qa.dev1.<br>2. Sign in as qa.dev1 → Bugs.<br>3. Move its status. | Listed under "Assigned to me". Developer can **change status but not edit the report** — the rest belongs to whoever raised it. |
| `TC-604` | Bug can be assigned to QA and to a designer, not only developers | P2 REG | 1. As ba1, assign one bug to qa.tester and another to qa.design.<br>2. Sign in as each. | Both see their bug. **Assigning also grants project access** if they did not already have it — otherwise the bug would be invisible to its assignee. |
| `TC-605` | Reassigning clears the previous assignee column | P2 | 1. Assign a bug to a developer, then reassign to a designer, then clear it.<br>2. Inspect both assignee columns after each step. | **Never both set at once**; clearing empties both. No stale value left in the column that was not being changed. |
| `TC-606` | Assigning to an inactive or wrong-role account is refused | P2 | 1. Craft an assign call naming a deactivated account, then an HR account. | Request **halted with a clear message**; the bug keeps its previous assignee. |
| `TC-607` | Bug and test case link fields accept only http(s) | P1 | 1. Save a bug with link `https://example.com/x`.<br>2. Save another with `javascript:alert(1)`, then `data:text/html,<script>…`.<br>3. View the list. | Valid link renders and opens. **Non-http(s) schemes render as no link at all** — never as a clickable href. See TC-1701. |
| `TC-608` | Test case records a result per round and can raise a bug from a failure | P2 | 1. Create a test case with steps, expected result and a spec link.<br>2. Record PASS, then FAIL.<br>3. Open a bug from the failing run. | Both runs kept in history. The bug is **pre-filled from the case** and lands on the same project. |
| `TC-609` | QA sees clearly which projects they are on | P2 | 1. As qa.tester, open My projects.<br>2. Have an admin add a second project. | Assigned projects listed with their bug and case counts. New assignment appears on reload, and **the empty state says who to ask for access**. |
| `TC-610` | A BA can assign QA to their own project | P2 REG | 1. As ba1, add qa.tester to a project from the project's team panel.<br>2. Sign in as qa.tester. | Access granted the same way design access works. **The BA does not need an admin to staff their own project.** |

## TS-07 · Design & rate card

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-701` | Estimate maths: rate × quantity, rounded to 2dp | P1 | 1. Pick a deliverable whose FRD-best rate is known.<br>2. Set quantity 1, then 3, then 0.5.<br>3. Toggle FRD off, then Case to Worst, checking the figure each time. | Hours = **rate for the chosen condition × quantity**. All four condition combinations select a different column. Quantity 0 or negative yields **no estimate rather than zero hours**. |
| `TC-702` | Target date counts working days and skips weekends | P1 | 1. Set a start date of a Monday with 8 hours.<br>2. Then 9 hours; then 40 hours.<br>3. Then start on a Saturday with 8 hours.<br>4. Then a Thursday with 24 hours. | 8h → **same Monday** (day one is the start date). 9h → Tuesday. 40h → Friday. Saturday start → rolls to Monday. Thursday + 24h → **Monday, not Saturday**. Public holidays are deliberately not modelled. |
| `TC-703` | Admin can edit a rate; every rate must exceed zero | P2 | 1. As admin, open the Rate card and change one figure.<br>2. Save a row with a 0 and again with a negative number.<br>3. Create a new deliverable with a duplicate name and complexity. | Edit persists and drives new estimates. Zero/negative → **"Every rate must be more than zero hours."** Duplicate → **"There is already a row for …"** |
| `TC-704` | Non-admin can read the rate card but not change it | P1 | 1. As qa.design and qa.ba1, load estimates (should work).<br>2. Call `pm-design-estimates-save.php` and `-delete.php` as each. | Reads succeed — they need it to estimate. Writes **403**. |
| `TC-705` | A retired rate cannot be used on a new task | P2 | 1. Deactivate a rate-card row as admin.<br>2. Create a design task referencing that estimate id. | **"That estimate is no longer on the rate card."** Existing tasks that already used it keep their stored dates. |
| `TC-706` | Explicit due date wins over the estimate | P2 | 1. Create a design task with an estimate and leave Due date blank.<br>2. Create another, same estimate, with an explicit earlier due date. | Blank → due date is the computed target. Explicit → **the typed date is kept**, and the estimate is still shown for reference. |
| `TC-707` | Design work can only be taken on by a designer account | P2 | 1. Assign a design task to qa.tester, then to a developer, via a crafted call. | **"Only a designer account can take design work on."** / "That account is not an active designer." |
| `TC-708` | Reassigning a design task grants project access, like creating one does | P1 REG | 1. Create a design task on project P assigned to designer A.<br>2. Reassign it to designer B, who has no access to P.<br>3. Sign in as B. | B sees the task and project P. **Create granted access but reassign did not** — the task was invisible to its new owner. |
| `TC-709` | A BA can assign work directly to a designer | P2 | 1. As ba1, create a design task on their project and assign a designer.<br>2. Sign in as that designer. | Task visible with brief, estimate and due date. **No admin step in between.** |
| `TC-710` | Design page order and scope filters | P3 | 1. As qa.design, switch the scope filter through Assigned to me / Everyone's / Unassigned.<br>2. Combine with a status filter and a search term. | Filters combine rather than override. **Unfinished work first, nearest deadline at the top** in every combination. |

## TS-08 · Leave

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-801` | Every role has a leave tab and can file a request | P1 | 1. Sign in as developer, QA, designer, marketing, HR and BA in turn.<br>2. File one request each. | All six have a Leave tab and can submit. **HR files their own here too** — they were once the only role tracking everyone's leave with no way to ask for their own. |
| `TC-802` | Submitting leave returns 200, not 500 | P1 REG | 1. Submit a leave request from each of the six roles.<br>2. Watch the network response and the server error log. | 200 with the new leave id. **No 500.** A PHP parse error once made every single submission fail — smoke-test this first on any leave change. |
| `TC-803` | A BA's leave can only go to an admin | P1 | 1. As qa.ba1, open the Send to list.<br>2. Craft a request nominating ba2 and marketing directly. | Picker offers **admins only**. The crafted call is refused with **"A business analyst's leave has to go to an admin."** — the form is not the enforcement. |
| `TC-804` | Admin books leave rather than requesting it | P2 | 1. Sign in as admin, open the leave form.<br>2. Pick dates and submit. | **No approver picker**; the button reads "Add leave". Saved as APPROVED with reviewed_by set to themselves, visible to everyone the same day. Decided from the token, not the page. |
| `TC-805` | Nobody is offered as their own approver | P2 | 1. As qa.mkt (a marketing account, which is an eligible approver role), open Send to.<br>2. Repeat as qa.tester. | Their own name is **absent from the list**, and a crafted self-nomination is rejected. |
| `TC-806` | Request with no approver selected is refused | P2 | 1. Submit with every approver box unticked.<br>2. Submit with a nonexistent manager id. | **"Select at least one manager to send this request to."** / "None of the selected approvers can approve leave." Nothing written. |
| `TC-807` | Any one named approver can approve; the others cannot double-review | P2 | 1. File a request naming ba1 and qa.mkt.<br>2. Approve as ba1.<br>3. Attempt to reject as qa.mkt. | First decision wins. The second finds **nothing pending** — the update only matches rows still PENDING. |
| `TC-808` | An approver who was not named cannot review | P1 | 1. File a request naming ba1 only.<br>2. Call `pm-leave-review.php` as ba2, then as qa.mkt.<br>3. Then as admin. | Non-named managers get **"This request was not sent to you — only its listed approvers (or an admin) can review it."** Admin succeeds. |
| `TC-809` | HR cannot approve, only track | P1 | 1. Confirm HR is absent from every Send to list.<br>2. Manually insert HR as an approver row, then call review as HR. | **"Only managers review leave requests."** — blocked even when listed as an approver. |
| `TC-810` | QA and marketing can approve what was sent to them | P2 REG | 1. File a request naming qa.tester; sign in as qa.tester → Leave.<br>2. Approve it.<br>3. Repeat naming qa.mkt on marketing.html. | A **Leave approvals panel** appears with Approve/Reject. Both roles could previously be nominated with nowhere to act, leaving requests PENDING forever. Panel is **hidden when nothing is waiting**. |
| `TC-811` | Approver sees the requester's whole month | P2 | 1. Give one person three separate requests in the same month, one still pending.<br>2. Open the approvals panel.<br>3. Add a request spanning a month boundary. | Shows total days that month **including the one being reviewed**, plus the others by date and status. Rejected leave is not counted. A request spanning two months is **not double-counted** — only days inside the month. |
| `TC-812` | Developers and QA no longer see the whole company's leave | P1 REG | 1. Approve leave for several people, including dates months in the past.<br>2. Open the Leave tab as developer, QA, designer and marketing. | Only **My requests**. No "Team on leave" panel anywhere. The page previously listed every approved request in the workspace, history included, to everyone. |
| `TC-813` | Date validation | P2 | 1. Submit with the end date before the start date.<br>2. Submit with one date blank.<br>3. Submit a single-day request (start = end). | Missing → **"start_date and end_date are required."** Reversed range is refused or normalised, never stored as a negative span. Single day is valid and counts as 1. |
| `TC-814` | HR sees pending, this month, all requests and patterns | P2 | 1. As qa.hr open Leave.<br>2. Check Pending, the monthly summary, All requests, and Leave patterns at 3/6/12 months.<br>3. Confirm All requests pages after 3 rows. | All four panels populate. Monthly summary **rolls over on the 1st by itself** — driven off request dates, not a stored snapshot. All requests shows the last 3 with a Show more button. |
| `TC-815` | Leave-by-month chart shows leave and months only | P3 | 1. On HR → Leave, inspect the Leave by month chart.<br>2. Switch the range selector.<br>3. Toggle light and dark. | Total days per month across everyone. **No demo markers.** Axis labels legible and non-overlapping in both themes at every range. |

## TS-09 · Demos & clash warnings

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-901` | Multiple demos of different kinds on one project | P2 | 1. As ba1, add an internal demo and a client demo to the same project with different dates and times. | Both saved and listed in date order with their kind labelled. **Missing project or date → "A project and a date are required."** |
| `TC-902` | Everyone on the project sees the demo | P1 | 1. Add a demo to a project staffed with a developer, QA and a designer.<br>2. Sign in as each.<br>3. Sign in as someone not on the project. | All three see Upcoming demos. The outsider sees **nothing, and the panel is hidden rather than empty**. |
| `TC-903` | Only managers can create or delete a demo | P2 | 1. Call demos-save and demos-delete as QA, designer and developer. | **403**. They can read demos on their projects but not change them. |
| `TC-904` | Leave during a demo is flagged to the approver | P1 | 1. Give qa.dev1 a task on project P; add a client demo on the 12th.<br>2. As qa.dev1, request leave covering the 10th–13th.<br>3. Open the approver's panel. | Warning naming the project, demo kind and date, marked **during**. Shows the count of open work they hold on that project. |
| `TC-905` | A demo within a week of return is flagged; beyond that is not | P2 | 1. Leave ending the 10th; demo on the 13th → check.<br>2. Demo on the 17th (7 days) → check.<br>3. Demo on the 18th (8 days) → check. | 13th and 17th flagged as **after** with the day count. **18th produces no warning** — the boundary is exactly 7 days. |
| `TC-906` | The requester sees the same warning when asking | P2 | 1. As qa.dev1, file leave that clashes with a demo.<br>2. Look at My requests. | The same clash note appears on their own row — **they are better placed to move a day off than the person approving it**. Shown for PENDING and APPROVED only. |
| `TC-907` | A warning never names a demo the reader cannot open | P1 | 1. Have ba1 approve leave for someone whose clash is on a ba2 project. | The warning is about the **requester's** involvement, so it appears — but any link in it must resolve for the reader, or carry no link at all. No leak of another BA's project detail. |
| `TC-908` | Time picker is 12-hour with AM/PM | P3 | 1. Set a demo time via the picker; save; reopen.<br>2. Check the displayed time on the developer, QA and designer pages. | Consistent 12-hour AM/PM display everywhere. **Round trip does not shift the hour** (no 24h/12h conversion drift). |

## TS-10 · Due-date extensions

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1001` | Extending requires a reason of at least 10 characters | P1 | 1. Extend a task with reason "asdf".<br>2. Then "waiting" (7 chars).<br>3. Then a real 10+ character sentence. | First two → **"Give a reason of at least 10 characters — this is what the admin will read."** and **the date does not move**. Third succeeds. |
| `TC-1002` | Works for all three kinds of work | P2 | 1. Extend a developer task, a design task and a bug.<br>2. Send `work_type: "EPIC"`. | All three succeed and land in one list. Unknown type → **"Unknown kind of work: …"** |
| `TC-1003` | Date and audit row are written together or not at all | P1 | 1. Extend a date successfully; confirm both the item and the audit row changed.<br>2. Force the audit insert to fail (e.g. drop the table on a scratch database) and retry. | On failure: **"Could not record the extension, so the date was left alone."** and the due date is **unchanged**. Both or neither. |
| `TC-1004` | Re-submitting the same date is refused | P3 | 1. Extend to a date, then submit that same date again. | **"That is already the due date."** No duplicate audit row. |
| `TC-1005` | Days moved is recorded, and is null when there was no date before | P2 | 1. Extend an item that has a due date; check days_moved.<br>2. Set a due date on an item that had none; check days_moved.<br>3. Move a date *earlier*. | Positive count for a push; **null when there was nothing to move from**; a pull-in records a negative or is labelled as brought forward — never displayed as slippage. |
| `TC-1006` | Every extension is visible to the admin | P1 | 1. Have a BA, a designer and QA each extend something.<br>2. As admin, open Extended deadlines on the Overview.<br>3. Repeat as ba1. | Admin sees **all three, most recent first, with reason and who moved it**. A BA sees only their own projects. Panel hidden when nothing has slipped. |
| `TC-1007` | A developer cannot extend their own deadline | P1 | 1. Call `pm-due-extend.php` as qa.dev1. | **403** — pushing a date is a scheduling decision. Developers ask; managers, QA and designers move it. |

## TS-11 · People

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1101` | Adding a person writes to the right table for the role | P2 | 1. Add one person for each of the 7 roles.<br>2. Check which table each landed in and whether a login was created. | Developer → `employees`; every other role → `managers`. **"Staff logins need an email address."** when a staff role is added without one. |
| `TC-1102` | Only an admin creates staff logins | P1 | 1. As qa.hr, add a developer (allowed), then add a MANAGER and an ADMIN. | Developer succeeds. Staff roles → **"Only an admin can create staff logins."** |
| `TC-1103` | Deleting a developer who has leave records works | P1 REG | 1. Create a developer, give them an approved leave request, no tasks.<br>2. Delete them from People.<br>3. Repeat with a developer who has only a question, then only tasks, then nothing at all. | **Never a 500.** With nothing attached → deleted outright. With leave, questions or tasks → deactivated, and the message names exactly what is holding the row. Previously only `tasks` was checked, so a developer who had ever asked for a day off hit a raw constraint error. |
| `TC-1104` | Deleting a staff account works from the People screen | P1 REG | 1. Delete a BA, an HR, a marketing, a QA and a designer account.<br>2. Try one with a project and one with nothing attached. | Every role has a working Delete. Unreferenced → gone. Referenced → **deactivated with the holds listed**. The list previously offered Delete on developers only. |
| `TC-1105` | Show deactivated brings back both kinds of person | P2 REG | 1. Deactivate one staff account and one developer (via a blocked delete).<br>2. Confirm both vanish from the default list.<br>3. Tick *Show deactivated*. | **Both reappear, marked Deactivated.** The developer half previously hardcoded active-only, so a deactivated developer disappeared with no way back — the one case the checkbox exists for. |
| `TC-1106` | Project access rows never block a deletion | P2 | 1. Give a QA account project assignments and nothing else.<br>2. Delete them. | **Deleted outright**, assignment rows cleaned up. Pure access carries no history and must never be the reason someone cannot be removed. |
| `TC-1107` | You cannot delete your own account | P1 | 1. As admin, attempt to delete the account you are signed in as. | **"You cannot remove your own account."** |
| `TC-1108` | The last active admin cannot be demoted or removed | P1 | 1. Reduce the workspace to one active admin.<br>2. Try to change their role, deactivate them, and delete them. | **"This is the only active admin — promote someone else first."** for all three. Locking everyone out is not recoverable from inside the app. |
| `TC-1109` | Changing a role moves the person between tables cleanly | P2 | 1. Change a developer with tasks into a DESIGNER.<br>2. Check the directory for duplicates.<br>3. Change them back. | One row in the directory, not two. The source row is **deactivated rather than deleted** (its tasks still reference it), and the round trip reactivates rather than duplicating. |
| `TC-1110` | Temporary passwords are only ever sent to an admin | P1 | 1. As qa.hr, call `pm-people-list.php` and inspect the raw JSON.<br>2. Repeat as admin.<br>3. Reset a password as HR, then as admin. | HR's response contains **no `temp_password` field at all**. Password reset is admin-only; a developer with no email → **"This developer has no login to reset — add an email first."** |

## TS-12 · HR

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1201` | Create an opening and move candidates through every stage | P2 | 1. Create an opening; add three candidates.<br>2. Move one through all six stages.<br>3. Submit an invalid stage via the API. | Each stage persists and the opening's counts update. Invalid stage **rejected, not stored**. |
| `TC-1202` | Recruitment is HR and admin only | P1 | 1. Call openings and candidates endpoints as BA, marketing, QA, designer, developer. | **403 for all five.** Candidate data is not general staff reading. |
| `TC-1203` | Leave patterns flags repeat and pre-demo absence | P2 | 1. Give one person frequent short absences, several just before demos.<br>2. Open Leave patterns at 3, 6 and 12 months. | That person ranks by frequency, with the pre-demo count called out. **Range selector actually changes the window** rather than re-rendering the same rows. |
| `TC-1204` | Monthly summary rolls over on its own | P2 | 1. Note the summary contents.<br>2. Move the server clock past the 1st, or seed leave in the next month.<br>3. Reload. | The new month is shown with **no manual upkeep** — it is computed from request dates, not a stored snapshot. |
| `TC-1205` | QA access and Design access pages are admin-only | P1 | 1. As qa.hr, confirm the two tabs are hidden.<br>2. Navigate to `hr.html#/qa` and `#/design` directly.<br>3. Call the assign endpoints as HR. | Tabs hidden; direct hashes render nothing useful; endpoints **403**. |
| `TC-1206` | Directory search and role filter combine | P3 | 1. Search a name, then add a role filter, then tick Show deactivated. | All three narrow together. **The count reflects what is displayed**, not the unfiltered total. |

## TS-13 · Marketing

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1301` | Campaign lifecycle | P3 | 1. Create a campaign; move it IDEA → PLANNED → IN_PROGRESS → PUBLISHED.<br>2. Cancel another. Delete a third. | Each state persists and sorts sensibly. Delete removes it from the calendar. |
| `TC-1302` | Marketing can run projects and tasks like a BA | P2 | 1. As qa.mkt, create a project, add a task, assign a developer.<br>2. Sign in as that developer. | Works exactly as for a BA, scoped to marketing's own projects. **Developer sees the task.** |
| `TC-1303` | Campaigns are not visible to other roles | P2 | 1. Call the campaigns endpoints as QA, designer and developer. | **Refused** — campaigns are manager-side. |
| `TC-1304` | Marketing leave approvals panel appears and works | P2 REG | 1. File a request naming qa.mkt.<br>2. Sign in as qa.mkt → Leave.<br>3. Approve; then check with nothing pending. | Panel present with the month context and clash warning; approving updates the requester's view. **Hidden entirely when nothing is waiting.** |

## TS-14 · Admin insights

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1401` | Insights are admin-only | P1 | 1. Confirm the panel is absent for a BA.<br>2. Call `pm-insights.php` as BA, HR and marketing. | Panel hidden; endpoint **403**. |
| `TC-1402` | Charts render correctly in both themes | P2 | 1. View every chart in light, then dark, then with the OS set to dark and the site toggle set to light. | Series colours, gridlines and labels legible in all three states. **No element keeps a colour that only works in one theme.** |
| `TC-1403` | Series labels never overlap | P3 | 1. Seed data so two series end at nearly the same value, then identical values.<br>2. Seed one series at the very top of the range and another just below. | Labels are spaced apart and **stay inside the chart**. The top label is clamped first, then the rest space downward — the reverse order loses the first gap. |
| `TC-1404` | Show numbers opens a readable table | P2 | 1. Click Show numbers on each chart.<br>2. Narrow the window to 380px. | Table matches the plotted figures. **It does not force a horizontal scrollbar on a 3-column table**, and the chart grows rather than shrinks when opened. |
| `TC-1405` | Empty and single-point data do not break a chart | P2 | 1. Run against a freshly reset database.<br>2. Then with exactly one week of data. | An honest empty state, then a single point rendered without a divide-by-zero or a collapsed axis. **No console errors.** |

## TS-15 · Meetings

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1501` | Recording opens a fresh link in the same tab | P1 REG | 1. Open a meeting and click the recording link.<br>2. Wait past the link's expiry, then click again.<br>3. Watch for any tab that opens and immediately blanks. | A newly fetched URL each time, opened in the **current tab — never an about:blank** placeholder. An expired or missing URL fails loudly; it must not silently fall back to the stale meeting link. |
| `TC-1502` | Meeting list and detail render | P2 | 1. Open Meetings; sort and search.<br>2. Open a meeting with no action items, and one with many. | Newest first. Both detail states render; the empty one shows a message, not a blank panel. |
| `TC-1503` | Dispatch sends and reports its outcome | P2 | 1. Send a dispatch.<br>2. Send with a required field blank.<br>3. Send while the webhook is unreachable. | Success confirmed on screen. Validation caught before sending. **A dead webhook produces a readable error, not a silent no-op or a raw stack trace.** |
| `TC-1504` | Action items from the last 24 hours surface on the Overview | P3 | 1. Check the Overview against the meetings list.<br>2. Age an item past 24 hours. | Only recent items shown; older ones drop off but remain on the meeting itself. |
| `TC-1505` | Meetings is not exposed to non-admin roles | P2 | 1. As QA, designer, HR and developer, look for the Meetings link and open meetings.html directly. | Link hidden; direct access **shows no meeting data**. |

## TS-16 · UI & cross-cutting

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1601` | Theme survives a reload and applies before first paint | P2 | 1. Switch to dark; reload every page in turn.<br>2. Watch the first frame carefully.<br>3. Set the OS to dark with the site set to light. | Choice persists across pages. **No white flash before dark paints** — `theme.js` is in the head and must not be deferred. An explicit site choice beats the OS setting. |
| `TC-1602` | Custom scrollbar applied site-wide without hiding overflow | P3 | 1. Check the page scrollbar and any inner scrolling panel on every page, in both themes.<br>2. Check the top nav bar at 1240px and narrower. | Consistent styling, visible track. **Nothing scrolls with its scrollbar hidden** — that is how a nav link went missing without anyone noticing. |
| `TC-1603` | No native confirm or prompt dialogs anywhere | P2 | 1. Trigger every destructive action: delete a project, task, bug, test case, design task, demo, campaign, person.<br>2. Trigger anything that asks for text input. | All use the styled in-page dialog. **No browser-chrome confirm/prompt box.** Cancel always leaves the data untouched. |
| `TC-1604` | Select controls keep their caret and styling | P3 | 1. Inspect every dropdown on every page in both themes: filters, role pickers, status selects, time pickers. | Every select shows its custom caret. **None has lost it to a `background` shorthand** overriding `background-image`. |
| `TC-1605` | Date fields open the picker from anywhere in the field | P3 | 1. Click the middle of a date input, not the calendar glyph, on leave, demo, task and design forms.<br>2. Repeat in a browser without `showPicker` support. | Calendar opens from a click anywhere. Where unsupported, **the field still works as a normal date input** — no error. |
| `TC-1606` | Pages are usable on a phone-width viewport | P2 | 1. At 390px wide, open every page.<br>2. Check every table and chart. | Wide content scrolls **inside its own container**; the page body never scrolls sideways. No overlapping or clipped controls. |
| `TC-1607` | Cache-buster is bumped in lockstep | P1 | 1. Grep every HTML file for `?v=`.<br>2. Hard-reload with devtools open and confirm the new assets are fetched. | **One version across every HTML file**, bumped for this build. A mixed set means some users get old JS against new HTML — this has already caused one "the fix did not work" investigation that was purely a deployment issue. |
| `TC-1608` | Keyboard and focus | P2 | 1. Tab through a form end to end and submit with Enter.<br>2. Open a dialog and press Escape. | Focus is always visible and follows a sensible order. Dialogs trap focus and **Escape cancels without performing the action**. |

## TS-17 · Security

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1701` | Stored XSS through link fields | P1 REG | 1. Save these in every link field — bug, test case, design task: `javascript:alert(1)`, `JaVaScRiPt:alert(1)`, `data:text/html,<script>alert(1)</script>`, `vbscript:msgbox(1)`, ` javascript:alert(1)` (leading space).<br>2. View each list as another user and click through. | **None renders as a clickable href.** Only `http://` and `https://` survive. HTML escaping alone does not stop this — a scheme check is required. |
| `TC-1702` | Stored XSS through text fields | P1 | 1. Put `<img src=x onerror=alert(1)>` and `</div><script>alert(1)</script>` into a project name, task name, bug title, steps, reason, question and person name.<br>2. View each wherever it is displayed, including the approver's month context and the extension audit list. | Rendered as literal text everywhere. **No alert, no broken layout.** Check the panels that re-display someone else's text — those are the ones that get missed. |
| `TC-1703` | Direct object references are scoped, not just hidden | P1 | 1. As ba1, note a project, task, bug and design task id belonging to ba2.<br>2. Request and then update each by id.<br>3. Repeat as QA, designer and developer. | **Refused every time.** Absence from a list is not the control being tested — the id must be rejected when named explicitly. |
| `TC-1704` | SQL injection through search and filter inputs | P1 | 1. Enter `' OR 1=1 --` and `"; DROP TABLE tasks; --` into every search box and filter.<br>2. Send the same in `status`, `month` and id parameters directly. | Treated as literal search text; **no extra rows, no error, no schema change**. Every query is a prepared statement. |
| `TC-1705` | Privilege escalation through the role field | P1 | 1. As qa.dev1, call `pm-people-role.php` to make themselves ADMIN.<br>2. As qa.hr, do the same.<br>3. Send `role: "SUPERADMIN"` as an admin. | First two **403**. Unknown role rejected — only the six named roles are accepted. |
| `TC-1706` | Errors do not leak internals | P2 | 1. Send malformed JSON, a missing body, and wrong types to a sample of endpoints.<br>2. Point one at a missing table. | A JSON error message. **No SQL text, file path, stack trace or PHP notice** in any response body. |
| `TC-1707` | Debug endpoint is not reachable in production | P2 | 1. Request `pm-backend-php/debug-headers.php` signed out and signed in. | Not reachable, or returns nothing sensitive. **It must not echo the Authorization header** to an unauthenticated caller. |
| `TC-1708` | Reset script cannot run by accident | P1 | 1. Import `tools/reset-test-data.sql` unedited.<br>2. Confirm every table still has its rows.<br>3. Then arm it, set `@KEEP_ADMINS = 0`, and import. | Unarmed → stops on the first statement, **nothing deleted**. KEEP_ADMINS off → refuses rather than deleting every admin. |

## TS-18 · Regression pack

| ID | Test case | Pri | Steps | Expected result |
|---|---|---|---|---|
| `TC-1801` | Assignment sweep — every kind of work reaches its assignee | P1 | 1. Assign, in one pass: a task to a developer; a bug to a developer, to QA, to a designer; a design task to a designer; a leave request to each approver role.<br>2. Sign in as every assignee in turn. | **Every single item is visible to the person it was given to**, with the access it needs to be actionable. Any miss is P1 regardless of how small it looks. |

---

**134 test cases.** P1 cases are a release gate — no exceptions.
