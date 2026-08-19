# Movenetics Workspace — Use Case Report

Everything the application can do, who can do it, and where. Compiled from the
shipped code: the `requireRole()` call in each of the 75 endpoints, the routing
table in `fireflies.js`, and the pages themselves.

**Actors** — `ADM` Admin · `BA` Business Analyst · `HR` · `MKT` Marketing ·
`QA` · `DES` Designer · `DEV` Developer

A tick means the role can do it. **Scope** says how much they see: *all* is
every row in the workspace, *own* is limited to what they own or were assigned.

---

## UC-01 · Access & session

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Where |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-011 | Sign in with email and password | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `login.html` |
| UC-012 | Stay signed in on this browser, or only for the tab | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Sign-in form |
| UC-013 | Be taken to your own section automatically | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | On sign-in |
| UC-014 | Switch between light and dark | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Every page |
| UC-015 | Sign out from any page | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Top bar |

**Landing pages** — HR → `hr.html` · Marketing → `marketing.html` · QA → `qa.html` ·
Designer → `designers.html` · Developer → `employee.html` · Admin and BA → `index.html`

---

## UC-02 · Meetings

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Where |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-021 | Browse meetings captured by Fireflies | ✓ | ✓ | | | | | | Meetings |
| UC-022 | Read a meeting's notes and action items | ✓ | ✓ | | | | | | Meeting detail |
| UC-023 | Open the recording — a fresh link is fetched each time | ✓ | ✓ | | | | | | Meeting detail |
| UC-024 | Send a dispatch | ✓ | ✓ | | | | | | Meetings › Dispatch |
| UC-025 | See action items from the last 24 hours | ✓ | ✓ | | | | | | Overview |

---

## UC-03 · Projects

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-031 | Create a project with client, priority, due date | ✓ | ✓ | | ✓ | | | | own |
| UC-032 | Edit name, client, description, status, priority, due date | ✓ | ✓ | | ✓ | | | | own |
| UC-033 | Delete a project | ✓ | ✓ | | ✓ | | | | own |
| UC-034 | See which business analyst owns each project | ✓ | | | | | | | all |
| UC-035 | Reassign a project to a different business analyst | ✓ | | | | | | | all |
| UC-036 | See every project you are involved in | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | own |
| UC-037 | Staff a project — add developers, QA, designers | ✓ | ✓ | | ✓ | | | | own |
| UC-038 | See who is on what, and which projects have a role missing | ✓ | | | | | | | all |

Project status: `PLANNING` `ACTIVE` `ON_HOLD` `COMPLETED` `CANCELLED` ·
Priority: `LOW` `MEDIUM` `HIGH` `CRITICAL`

---

## UC-04 · Tasks

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-041 | Create a task on a project | ✓ | ✓ | | ✓ | | | | own |
| UC-042 | Assign a task to a developer | ✓ | ✓ | | ✓ | | | | own |
| UC-043 | Edit a task's name, description, estimate, due date | ✓ | ✓ | | ✓ | | | | own |
| UC-044 | Delete a task | ✓ | ✓ | | ✓ | | | | own |
| UC-045 | See every task assigned to you, across all projects | | | | | | | ✓ | own |
| UC-046 | Move a task's status as you work | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| UC-047 | Filter tasks by status | ✓ | ✓ | | ✓ | | | ✓ | own |

Task status: `TODO` `IN_PROGRESS` `BLOCKED` `COMPLETED` `CANCELLED`

---

## UC-05 · Questions

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-051 | Raise a question against one of your tasks | | | | | | | ✓ | own |
| UC-052 | See open questions waiting on you | ✓ | ✓ | | ✓ | | | | own |
| UC-053 | Answer a question | ✓ | ✓ | | ✓ | | | | own |
| UC-054 | Read the answer to your question | | | | | | | ✓ | own |

---

## UC-06 · Bugs

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-061 | Report a bug with severity and steps to reproduce | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-062 | Attach a screenshot or recording link | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-063 | Assign a bug to a developer | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-064 | Assign a bug to QA or to a designer | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-065 | See bugs assigned to you | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| UC-066 | Move a bug's status | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| UC-067 | Give a bug a due date, and extend it with a reason | ✓ | ✓ | | ✓ | ✓ | ✓ | | own |
| UC-068 | Search and filter bugs by status | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-069 | Delete a bug | ✓ | ✓ | | ✓ | ✓ | | | own |

Bug status: `OPEN` `IN_PROGRESS` `FIXED` `VERIFIED` `CLOSED` `REOPENED` ·
Severity: `LOW` `MEDIUM` `HIGH` `CRITICAL`

Assigning a bug to someone who is not yet on that project **also grants them access to it**,
so the bug is actually reachable by the person it was given to.

---

## UC-07 · Test cases

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-071 | Write a test case with steps and an expected result | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-072 | Link a case to the spec it came from | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-073 | Edit an existing case without losing its history | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-074 | Record a result for a round of testing | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-075 | Open a bug straight from a failing run | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-076 | See each case's last result and when it was run | ✓ | ✓ | | ✓ | ✓ | | | own |
| UC-077 | Delete a case and its recorded results | ✓ | ✓ | | ✓ | ✓ | | | own |

Run result: `PASS` `FAIL` `BLOCKED` `SKIPPED`

---

## UC-08 · Design work

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-081 | Create a design task with a brief | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-082 | Assign design work to a designer | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-083 | Get an estimate and a target date from the rate card | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-084 | Override the estimate with your own due date | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-085 | Link to the Figma file or wherever the work lives | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-086 | Move design work through review and changes | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-087 | Filter by assigned to me / everyone's / unassigned | ✓ | ✓ | | ✓ | | ✓ | | own |
| UC-088 | Delete a design task | ✓ | ✓ | | ✓ | | ✓ | | own |

Design status: `TODO` `IN_PROGRESS` `IN_REVIEW` `CHANGES` `APPROVED` ·
Kind: `UI` `UX` `BRANDING` `ILLUSTRATION` `OTHER`

---

## UC-09 · Rate cards

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-091 | Read the design and developer rate cards | ✓ | ✓ | | ✓ | | ✓ | | all |
| UC-092 | Change what a deliverable is estimated at | ✓ | | | | | | | all |
| UC-093 | Add a new deliverable to the card | ✓ | | | | | | | all |
| UC-094 | Retire a deliverable so it stops being offered | ✓ | | | | | | | all |

Each row carries four rates — with and without an FRD, best and worst case — across
complexity `EASY` `MODERATE` `COMPLEX`. Estimated hours are turned into a target date at
**8 hours per working day, weekends skipped**. Public holidays are not modelled.

---

## UC-10 · Demos

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-101 | Put a demo date on a project | ✓ | ✓ | | ✓ | | | | own |
| UC-102 | Set several demos of different kinds on one project | ✓ | ✓ | | ✓ | | | | own |
| UC-103 | Set the time in 12-hour AM/PM | ✓ | ✓ | | ✓ | | | | own |
| UC-104 | See demos coming up on projects you are on | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | own |
| UC-105 | Mark a demo done or cancelled | ✓ | ✓ | | ✓ | | | | own |
| UC-106 | Delete a demo | ✓ | ✓ | | ✓ | | | | own |

Demo kind: `INTERNAL` `CLIENT` `STAKEHOLDER` `DRY_RUN` `OTHER` ·
Status: `PLANNED` `DONE` `CANCELLED`

---

## UC-11 · Deadlines

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-111 | Push a task, design task or bug's due date | ✓ | ✓ | | ✓ | ✓ | ✓ | | own |
| UC-112 | Record why the date moved | ✓ | ✓ | | ✓ | ✓ | ✓ | | own |
| UC-113 | See every deadline that has slipped, and the reason | ✓ | | | | | | | all |
| UC-114 | See slipped deadlines on your own projects | | ✓ | | ✓ | | | | own |

A reason of **at least 10 characters** is required, and the date and the audit record are
written together or not at all.

---

## UC-12 · Leave

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-121 | Request time off, with a reason | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| UC-122 | Choose one or more approvers — any one can approve | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| UC-123 | Book leave directly, without asking anyone | ✓ | | | | | | | own |
| UC-124 | See where your own requests stand | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| UC-125 | Approve or reject a request sent to you | ✓ | ✓ | | ✓ | ✓ | ✓ | | own |
| UC-126 | See the requester's whole month before deciding | ✓ | ✓ | | ✓ | ✓ | ✓ | | own |
| UC-127 | Be warned when leave clashes with a demo | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | own |
| UC-128 | Track everyone's leave | ✓ | ✓ | ✓ | | | | | all |
| UC-129 | See who takes leave often, or right before demos | ✓ | | ✓ | | | | | all |

**Who approves whom** — a business analyst's own leave goes to an **admin and nobody else**;
everyone else may send to any admin, BA, marketing or QA lead. **HR is never an approver** —
HR tracks leave, it does not decide it. Nobody is ever offered as their own approver.

**A demo counts as a clash** if it falls during the leave, or within **7 days** of the person
getting back.

---

## UC-13 · People

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-131 | See everyone in the workspace in one directory | ✓ | | ✓ | | | | | all |
| UC-132 | Add a developer to the roster | ✓ | | ✓ | | | | | all |
| UC-133 | Create a staff login for any other role | ✓ | | | | | | | all |
| UC-134 | Change someone's role, in either direction | ✓ | | | | | | | all |
| UC-135 | Reset a password | ✓ | | | | | | | all |
| UC-136 | Remove someone | ✓ | | ✓ | | | | | all |
| UC-137 | See deactivated accounts | ✓ | | ✓ | | | | | all |
| UC-138 | Search and filter the directory by role | ✓ | | ✓ | | | | | all |
| UC-139 | Give a QA account access to a project | ✓ | ✓ | | ✓ | | | | own |
| UC-13A | Give a designer access to a project | ✓ | ✓ | | ✓ | | | | own |

Roles: `ADMIN` `MANAGER` (Business Analyst) `HR` `MARKETING` `QA` `DESIGNER` — plus
developers, who live on a separate roster. Removing someone whose work is still referenced
**deactivates them instead of deleting**: the login stops working immediately and the
history is kept. There is no direct *reactivate* — bringing a deactivated account back
means changing its role, which sets it active again as a side effect (see [ISSUES.md](ISSUES.md), I-05).

---

## UC-14 · Recruitment

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-141 | Open a role with a department and notes | ✓ | | ✓ | | | | | all |
| UC-142 | Add candidates against an opening | ✓ | | ✓ | | | | | all |
| UC-143 | Move a candidate through the hiring stages | ✓ | | ✓ | | | | | all |
| UC-144 | Put an opening on hold or close it | ✓ | | ✓ | | | | | all |

Opening: `OPEN` `ON_HOLD` `CLOSED` ·
Candidate: `APPLIED` `SCREENING` `INTERVIEW` `OFFER` `HIRED` `REJECTED`

---

## UC-15 · Campaigns

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-151 | Plan a campaign with a channel and a date | ✓ | ✓ | | ✓ | | | | own |
| UC-152 | Move it from idea through to published | ✓ | ✓ | | ✓ | | | | own |
| UC-153 | Delete a campaign | ✓ | ✓ | | ✓ | | | | own |

Campaign: `IDEA` `PLANNED` `IN_PROGRESS` `PUBLISHED` `CANCELLED`

---

## UC-16 · Oversight

| UC | What you can do | ADM | BA | HR | MKT | QA | DES | DEV | Scope |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| UC-161 | See headline numbers, each linking to its list | ✓ | ✓ | | ✓ | | | | own |
| UC-162 | See insight charts over the last 12 weeks | ✓ | | | | | | | all |
| UC-163 | Open the numbers behind any chart | ✓ | | | | | | | all |
| UC-164 | See who is on what, and where a role is missing | ✓ | | | | | | | all |
| UC-165 | See every deadline that has moved and why | ✓ | | | | | | | all |
| UC-166 | See who is on leave right now | ✓ | ✓ | ✓ | | | | | all |
| UC-167 | See leave taken month by month | ✓ | | ✓ | | | | | all |

---

## What the application deliberately does not do

| | Why |
|---|---|
| Send any email or notification | Everything is seen by signing in. Assignments and approvals surface on the assignee's own page — there is no outbox. |
| Upload or store files | Screenshots, recordings and design files are linked, not hosted. Nothing has to be kept in step with Drive, Loom or Figma. |
| Track time or timesheets | Estimates set expectations; actual hours are not recorded. |
| Model public holidays | Target dates skip weekends only. |
| Let developers change scope | A developer moves a task's status and asks questions. Renaming, reassigning and moving dates are manager decisions. |
| Let anyone delete an opening or a candidate | Recruitment records are kept once created. |
| Expire sessions on a timer | A session ends when you sign out, or when an admin deactivates the account. |

---

*Compiled 20 Aug 2026 against build `?v=46`, 75 endpoints.*
