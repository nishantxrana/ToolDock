# Migration guide

This is the detailed reference for ToolDock's **Migrate** mode: what every screen and field does, with examples. The screens have short hints; this page explains the rest.

- [Before you start](#before-you-start)
- [How every migration works](#how-every-migration-works)
- [Connecting the two sides](#connecting-the-two-sides)
- [Variable groups](#variable-groups)
- [Repos](#repos)
- [Pipelines](#pipelines)
- [Boards](#boards)
- [Jira to Boards](#jira-to-boards)
- [Running, pausing and resuming](#running-pausing-and-resuming)
- [The migration report](#the-migration-report)
- [Recommended order for a full project move](#recommended-order-for-a-full-project-move)
- [Troubleshooting](#troubleshooting)

---

## Before you start

**Open Migrate mode.** Use the **Tools | Migrate** switch in the top bar, or press `Ctrl+K` / `⌘K` and type "migrate". Migration screens need a window at least **1024 px wide**. On a phone or small window you'll see "Use a wider screen".

**Terms used in this guide:**

| Term | Meaning |
| --- | --- |
| **Source** | Where things are copied **from**. ToolDock only reads from it. |
| **Target** | Where things are copied **to**. This is the only side ToolDock writes to. |
| **Same organization** | Enter the same organization and token on both sides to copy between two projects of one organization, e.g. `contoso/Legacy` → `contoso/Platform`. |

**Make two tokens** (or one token that has both sets of scopes, if both sides are in the same organization):

- **Source token:** read-only scopes are enough.
- **Target token:** needs write scopes for what you migrate (listed in each section below).

Give both a short expiry (e.g. 7 days), and revoke them when you're done. Every report ends with a reminder.

**Try it on a throwaway target project first.** Nothing is ever changed in the source. In the target, ToolDock only creates things or adds to them. It never deletes your data, and it never overwrites existing variable values or work items.

---

## How every migration works

Every migration has the same steps across the top of the page. You can click a finished step to go back to it; while a run is in progress the steps are locked.

1. **Connect:** sign in to the source and the target, and pick a project on each.
2. **Choose:** tick what to copy (groups, repos, pipelines, or a query for work items).
3. **Map / Options:** decide how things that differ between the two sides are matched.
4. **Review:** a summary, plus everything ToolDock already knows it can't copy. You must tick **"I understand what won't be copied…"** to enable **Start migration**.
5. **Migrate:** live progress, a log, and Pause / Resume / Stop.
6. **Report:** what was copied, what failed, and a to-do checklist with links. You can download it.

---

## Connecting the two sides

Each side has a connection card. The **Source** card is plain. The **Target** card has an amber edge, because it's the side that gets written to.

### Azure DevOps connection

| Field | What to enter | Example |
| --- | --- | --- |
| **Organization** | Only the organization name: the part after `dev.azure.com/`. Not the full URL, not the project. | For `https://dev.azure.com/contoso/Platform`, enter `contoso`. |
| **Personal Access Token** | A PAT from that organization (User settings → Personal access tokens). The eye button shows or hides it. | `abc123…` (52 characters) |
| **Token scopes for this side** | Expand it to see exactly which scopes this migration needs on this side, plus a **Create a token** link. | |
| **Connect source / Connect target** | Checks the token by listing the organization's projects. A wrong org name or token shows an error here. | |
| **Project** | Appears once connected. Pick the project to read from (source) or write to (target). If the organization has only one project, it's picked for you. | `Platform` |
| **Same organization and token as the source** | Target card only, before it's connected. Copies the source's organization and token, so you only have to pick a different target project. | Copy `contoso/Legacy` → `contoso/Platform` |

**On a connected card:**
- `…1234`: the last 4 characters of the token, so you can tell which token is in use. The full token is never shown again.
- **Lock button** (the padlock with a ring): see [Keeping tokens through a refresh](#keeping-tokens-through-a-refresh).
- **Disconnect** (the exit arrow): forgets the token in memory and deletes its saved copy. It's disabled while a migration is running.

If the source and target are the **same project**, the page warns you and you can't continue.

### Keeping tokens through a refresh

By default, tokens live only in the tab's memory: a refresh or closing the tab forgets them. The **lock button** saves an encrypted copy in this browser for 30 minutes, so a refresh during a long migration doesn't lose them.

| What you see | Meaning |
| --- | --- |
| Open padlock, gray | In memory only. Click to lock for 30 minutes. |
| Green ring, e.g. `24m` | Locked, more than 10 minutes left. |
| Amber ring, e.g. `8m`, plus an extend icon | 10 minutes or less left. |
| Red pulsing ring, e.g. `3:58`, plus an extend icon | 5 minutes or less. The countdown updates every second. |

- An alert with **Extend 30 min** appears at 5 minutes and again at 1 minute. If a migration is running, the 5-minute alert says so.
- When the time runs out, only the **saved copy** is removed. The token keeps working until you refresh or close the tab.
- Clicking the lock again removes the saved copy straight away.
- The sidebar footer shows both connections and the lock that expires soonest. **Disconnect** there clears both sides.

> The lock protects against someone reading the browser's files. It can't protect against malicious code running on the site itself. The strict Content-Security-Policy is there to make that very hard. Don't lock on a shared computer.

---

## Variable groups

Copies variable groups and their variables to the target project.

**Target token scopes:**
- Variable Groups (Read, create & manage)
- Project and Team (Read)

The source token only needs Variable Groups (Read) and Project and Team (Read).

### Choose groups

- **One row per group in the source project.** Each row shows the number of variables, the description, and these badges:
  - **`N secrets`** (amber): the group has secret variables. Their values can't be read (see below).
  - **`Name exists in target`** (blue): a group with the same name already exists in the target. The **Options** step decides what happens to it.
  - **`Key Vault`** (gray, row disabled): the group is linked to Azure Key Vault and **can't be migrated**, because its values live in the vault. Hover the row to see why. It's listed in the report as a to-do: create it in the target and link it to the vault.
- **Select all** ticks every group that can be migrated. The search box filters by name or description.

### Options

**When a group with the same name already exists in the target:**

| Choice | What happens | Example (target already has `App-Shared` with `Region=eu`; source `App-Shared` has `Region=us`, `Owner=ops`) |
| --- | --- | --- |
| **Skip it** (default) | The target group isn't touched. | Target stays `Region=eu`. |
| **Add missing keys** | Only keys the target group lacks are added. Existing values never change. Key names are compared case-insensitively. | Target becomes `Region=eu`, `Owner=ops`. |
| **Create a copy** | A new group is created next to it, named `<name>-migrated` (then `-migrated-2`…). | New group `App-Shared-migrated` with `Region=us`, `Owner=ops`. |

**Secret variables:** Azure DevOps never returns secret values to anyone, so they can't be copied.

| Choice | What happens |
| --- | --- |
| **Create them empty** (default) | Each secret is created as an empty secret with the same name. The report lists every one, linked to its group, so you can fill it in. |
| **Leave them out** | Secrets aren't created at all. The report notes which were left out. |

**Copy descriptions:** on by default. Copies each group's description.

### Not copied

- Secret values.
- Key Vault-linked groups.
- Group security and "Pipeline permissions" (a pipeline asks for access the first time it uses the group).

---

## Repos

Copies Git repositories with **every branch, tag and commit**. Azure DevOps' own import service does the copying, server to server, so nothing is downloaded to your browser and large repos are fine.

**Target token scopes:**
- Code (Read, write & manage)
- Service Connections (Read, query & manage)

The source token only needs Code (Read).

### How a repo is copied

For each repo, ToolDock:
1. Creates the repo in the target, or reuses an existing empty one.
2. Creates a **temporary service connection** in the target project. It holds the *source* token, so Azure DevOps can read the source repo.
3. Starts the import and checks its progress every 5 seconds. You'll see steps like "Copying objects" in the log.
4. Deletes the temporary connection. Azure DevOps deletes it itself when the import finishes, and ToolDock deletes it again to be sure, including when the import fails. If it can't be deleted, the report has a to-do to delete it by hand.

If you **Stop** while an import is in progress, Azure DevOps keeps importing in the background and removes the connection itself when it's done. The report notes this.

### Choose repositories

- **One row per repo,** with its size and default branch, and these badges:
  - **`Empty`:** the source repo has no commits. An empty repo is created in the target, and nothing is imported.
  - **`Wiki`:** a project wiki's repo (named `<project>.wiki`). Optional: only tick it if you also want the wiki pages.
  - **`Over 5 GB`:** large repos import fine but slowly.
  - **Disabled row:** the repo is disabled in the source, so it can't be read. Enable it in the source first.

### Names and options

| Field | What it does | Example |
| --- | --- | --- |
| **Name in target** | The repo's name in the target. It defaults to the source name, and you can edit it. | Source `web-legacy` → target `web` |
| **What happens** | Explains the result for that name. | |
| → **New repo** | Nothing with that name exists in the target, so it will be created. | |
| → **Exists but empty: import into it** | A repo with that name exists in the target and has no commits, so the import goes into it. Useful if you pre-created repos. | |
| → **Exists and has commits: rename** | Blocked: an import can only go into an empty repo. Change the name. | |
| → **Not a valid repo name** | The name contains characters Azure DevOps doesn't allow (`\ / : * ? " < > \| # $ { } , + = [ ] ^`) or starts or ends with a dot. | |
| → **Two repos would get this name** | Two rows have the same target name. | |
| **Copy branch policies** | On by default. Copies policies scoped to each repo, such as minimum number of reviewers, linked work items, comment resolution and merge types. | |

These two branch policy types are **left out**, and each one becomes a to-do in the report with a link to the repo's policy page:
- **Build validation:** it points at a pipeline that may not exist in the target yet. Add it after migrating pipelines.
- **Required reviewers:** people and groups differ between organizations.

### Not copied

- Pull requests and their comments.
- **Git LFS objects.** If a repo uses LFS, push them yourself afterwards, e.g. `git lfs fetch --all && git lfs push --all <target-url>`.
- Repository permissions, forks, and commit-to-work-item links.

---

## Pipelines

Copies **build pipelines** (YAML and classic), **release pipelines** (classic) and the **task groups** they use.

**Target token scopes:**
- Build (Read & execute)
- Release (Read, write, execute & manage)
- Task Groups (Read, create & manage)
- Environment (Read & manage)
- Agent Pools (Read)
- Service Connections (Read & query)
- Variable Groups (Read)
- Code (Read)

**Source token scopes (all Read):** Build, Release, Task Groups, Agent Pools, Service Connections, Variable Groups and Code.

> **Copy repos first** if the pipelines build code from repos that aren't in the target yet. Pipelines whose repo has no match in the target are skipped.

### Choose pipelines

There are two lists: **Build pipelines (YAML and classic)** and **Release pipelines (classic)**, each showing its folder. If release pipelines can't be read, the source token lacks Release (Read). Task groups used by the chosen pipelines are included automatically, including task groups nested inside other task groups.

**Read and map** reads the full definitions from both sides and works out everything they depend on.

### Map resources

One table per kind of resource the chosen pipelines use. Each source item is matched to a target item **by name** where possible, and you can change any match with the drop-down. The heading of each table says how many have no match.

| Table | What it maps | If there's no match | Example |
| --- | --- | --- | --- |
| **Agent pools** | Agent queues used by pipelines, phases and release stages. Hosted pools like `Azure Pipelines` match by name. | **No match (set it later):** the pool is left unset, and the report tells you where to set it. | `Self-hosted-Linux` → `Linux-Agents` |
| **Service connections** | Connections referenced in task inputs (Azure subscriptions, Docker registries…). Credentials **never** copy, so create them in the target first, then go **Back** and **Read and map** again to refresh the list. | **No match (clear the input):** steps that use it get that input emptied, and a to-do is added. | `prod-arm (azurerm)` → `prod-arm` |
| **Variable groups** | Groups linked to pipelines or release stages. | **Copy it to the target** (default when the target doesn't have it): created like the Variable groups migration, with secrets empty. **No match (unlink it):** the pipeline loses the link. | `Shared` → Copy it to the target |
| **Repositories** | Azure Repos repos the pipelines build. | **No match (skip these pipelines).** | `api` → `api` |
| **Deployment groups** | Deployment groups used by release stages. | **No match (create it later):** stage is created, and the report says to create the group and register its agents. | `WebServers` → (none) |
| **Build pipelines used by releases** | Release artifacts that point at a build pipeline you *didn't* select. | **No match (remove the artifact).** | `nightly-ci` → `nightly-ci` (already in the target) |

**Tasks not installed in the target:** tasks from Marketplace extensions that the target organization doesn't have. Each one has a **Find the extension** link.

| "Pipelines that use them" | Result |
| --- | --- |
| **Skip those pipelines** (default) | Install the extension in the target, then run again. Skipped pipelines show as failed, and **Retry failed** picks them up. |
| **Create them with the step disabled** | The pipeline is created and the step is turned off. Turn it on after installing the extension. |

**When a pipeline with the same name already exists in the target:**
- **Skip it** (default): release pipelines still use the existing build pipeline.
- **Create a copy:** named `<name> (migrated)`.

**Keep release approvers:**
- **Off** (default): stage approvals become automatic, and the original approvers are listed in the report so you can set them again.
- **On:** approvers are matched by account to members of the target project's teams. If any approver can't be matched, that stage falls back to automatic.

### What happens to each definition

- **YAML pipelines:** keep their YAML file path, triggers and folder, and point at the matching target repo. ToolDock reads the YAML for `environment:` names and creates any missing environments in the target, empty; you add approvals and resources yourself. The first run asks you to authorize connections, pools, environments and variable groups.
- **Classic builds:** every phase, step, input, pool and task-group reference is remapped.
- **Release pipelines:**
  - Build artifacts point at the copied (or mapped) build pipeline, and Git artifacts at the mapped repo.
  - Each stage is owned by the target token's account.
  - If a folder doesn't exist in the target, the release is created in the root folder, with a note.
- **Secret pipeline variables** are created **empty**, and each one becomes a to-do.

### Not copied

- Secret variable values and service connection credentials.
- Run history, logs, test results, retention leases, badges.
- Pipeline permissions, environment approvals and checks.

---

## Boards

Copies work items from one Azure DevOps project to another, with their fields, attachments, inline images, comments and links.

**Target token scopes:**
- Work Items (Read, write & manage)
- Project and Team (Read)

The source token only needs Work Items (Read) and Project and Team (Read). To keep original created dates, the target account also needs the **"Bypass rules on work item updates"** permission. To add things to the target process, it needs process admin rights.

### Choose work items

**How to choose:**

| Choice | Fields |
| --- | --- |
| **Simple filter** | **Types:** comma-separated, empty for all, e.g. `Epic, Feature, User Story, Bug`. **States:** comma-separated, empty for all, e.g. `New, Active`. **Area path (and below):** that area and everything under it, e.g. `Legacy\Team A`. **Changed since:** only items changed on or after this date. **Include closed, done and removed items:** untick to leave out items in `Closed`, `Done` or `Removed`. |
| **WIQL query** | Paste a query. In Azure DevOps: Boards → Queries → open or build a query → **Edit WIQL** → copy. It must return work items (a flat list), e.g. `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'Legacy' AND [System.WorkItemType] IN ('Bug','Task') AND [System.CreatedDate] >= '2024-01-01'` |

**Query that will run** shows the exact WIQL. **Read work items** runs it, up to **20,000 items per run**. For more, split by area, type or date and run several times.

**Tip:** include parents and children in the same run, so the links between them can be recreated.

### Map types, states and fields

**Work item types:** each source type → a target type. Matched by name first, then by common equivalents (e.g. `User Story` → `Product Backlog Item` in a Scrum project).
- **Don't migrate this type** leaves those items out (the report counts them).
- **Create it in the target process** appears only when the target uses an *inherited* process.

**States** (one table per type): each source state → a state of the target type. Matched by name, then by the state's category, then the nearest category. Example: Agile `Resolved` (category *Resolved*) → Scrum `Done` (category *Completed*), because Scrum has no Resolved category. **First state of the type** puts items in the type's initial state.

**Fields:** every field that has a value in the chosen items. Matched by reference name or display name, and only to target fields of a compatible type.

| Choice | Result | Example |
| --- | --- | --- |
| A target field | Value is copied into it (converted to the field's type). | `Custom.Risk` → `Custom.Risk` |
| **Add to the description** | Value is written into a **"Migrated with ToolDock"** table at the end of the description, so no data is lost. Default when there's no matching field. | `Custom.CostCenter` = `CC-42` → row "Cost Center: CC-42" |
| **Skip this field** | Not copied at all. | |
| **Create a field in the target process** | Only with an inherited target process. Creates `Custom.<Name>` and adds it to the target types. | `Team Owner` → `Custom.TeamOwner` |

If Azure DevOps rejects a value for one item (e.g. a picklist value the target doesn't allow), that item is created again with only its core fields: title, state, paths, tags, description. It's marked as a warning in the log.

> **Changing the target process** affects **every project** that uses that process. The Review step warns you. A target that uses a built-in process (Agile, Scrum, Basic, CMMI) can't be changed, so map to what exists, or switch the target project to an inherited process first (Organization settings → Process).

### Options

| Field | What it does | Example |
| --- | --- | --- |
| **Put areas under** | Optional folder under the target project's root area; the source area tree is recreated inside it. Empty = directly under the root. | `Legacy` → source `Legacy\Team A` becomes target `Platform\Legacy\Team A` |
| **Put iterations under** | Same for iterations. Start and finish dates are kept. | `Legacy` → `Platform\Legacy\Release 1\Sprint 3` |
| **Tag every migrated item** | Adds this tag to each copied item. Default `migrated`. Leave empty for none. | Query `Tags Contains migrated` to find them all |
| **Write the source id to a field** | Optional: stores the source item's ID in a text field you choose (create one, e.g. `Custom.SourceId`, in the target process first). | Source `1234` → `Custom.SourceId = 1234` |
| **Copy attachments and inline images** | Downloads each attachment and image in descriptions and comments from the source, uploads it to the target, and rewrites image links. Files over 130 MB are skipped and noted. | |
| **Copy comments** | Adds comments oldest first. Comments can't be posted under someone else's name, so each starts with the original author and date. | "**Ana** · 03/02/2024, 09:00" then the text |
| **Link back to the source item** | Adds a hyperlink "Migrated from" to the source item. | |
| **Keep the original created date** | Sets Created Date (and Created By, when user mapping matches) to the original. Needs "Bypass rules on work item updates". If the target refuses, ToolDock carries on without it: items get today's date, the original goes in the description, and the report notes it. | |

**Map people and assignments (optional)** is **off by default**.
- **Off:** Assigned To and other people fields are left empty, and the original names are written in each item's description ("Original assigned to: Ana &lt;ana@contoso.com&gt;").
- **On:** two extra tables appear:
  - **People fields:** which source people field goes into which target field (e.g. Assigned To → Assigned To).
  - **People:** each person in the chosen items → a member of the target project's teams, matched by email, then by name. **Nobody (note in description)** leaves the field empty and notes the original.

### What happens during the run

1. Missing area and iteration paths are created.
2. Items are created. If the original state can't be set when the item is created, it's moved to that state right after.
3. Attachments and comments are copied.
4. Links are added between copied items: parent/child, related, predecessor/successor and duplicate.
   - Links to items **not** in this run are skipped. If you later copy the other item and run the same job again, the missing link is added then.
   - Links to commits, pull requests and builds aren't recreated; the report gives a count.

### Not copied

- Revision history: each item starts with one revision.
- Board columns, swimlanes, card styles, team settings.
- Shared queries, dashboards, test plans and suites. Test case steps copy as a field.
- @mentions become plain text.

The report also reminds you to **select the new iterations in each team's settings**. Iterations only appear on a team's backlog once they're selected there.

---

## Jira to Boards

Copies **Jira Cloud** issues into Azure Boards. Jira is **only read**: the proxy refuses any change to Jira.

**Target token scopes:**
- Work Items (Read, write & manage)
- Project and Team (Read)

**Jira:** an Atlassian account that can browse the project, and an API token.

> Jira Data Center / Server on a private network can't be reached by the hosted site. Run ToolDock yourself inside that network for that.

### Connect Jira

| Field | What to enter | Example |
| --- | --- | --- |
| **Jira site** | Your site's name, the part before `.atlassian.net`. Pasting the full URL also works. | `https://acme.atlassian.net/` → `acme` |
| **Account email** | The email of the Atlassian account the token belongs to. | `me@acme.com` |
| **API token** | Create one at id.atlassian.com → Security → API tokens (link on the card). It works like a password for this account; revoke it when you're done. | |

### Choose Jira issues

| Field | What it does | Example |
| --- | --- | --- |
| **Jira project** | The project to copy. | `Shop (SHOP)` |
| **Extra JQL filter (optional)** | Narrows the issues further. It's added to the project filter with `AND`, and any `ORDER BY` is ignored, because issues are always read oldest first. | `statusCategory != Done AND created >= -365d` |

The grey box shows the final query, e.g. `project = "SHOP" AND (statusCategory != Done) ORDER BY created ASC`. **Read issues** reads them and moves to mapping.

### Mapping (Jira specifics)

The mapping screen is the same as for [Boards](#map-types-states-and-fields), with these Jira defaults:

| Jira | Azure Boards (default) |
| --- | --- |
| Epic | Epic |
| Story | User Story, or Product Backlog Item / Requirement / Issue depending on the target process |
| Bug | Bug |
| Task | Task |
| Sub-task | Task (as a child of its parent) |
| Status | State of the same category: *To Do* → Proposed, *In Progress* → In Progress, *Done* → Completed |
| Priority | Priority 1–4 via the **Values: Priority** table: Highest/Blocker/Critical → 1, High/Major → 2, Medium → 3, Low/Lowest/Minor/Trivial → 4 (editable) |
| Story points / Story point estimate | Story Points (or Effort in Scrum) |
| Description, Environment, rich custom fields | HTML copied as is; images re-uploaded |
| Other custom fields | Matched by name, else **Add to the description** |
| Sprint (last one) | Iteration under **Put iterations under** (default folder `Jira`), with the sprint's dates |
| Labels and components | Tags |
| Parent / Epic link | Parent link |
| "blocks" link | Successor link |
| "duplicates" link | Duplicate link |
| Other issue links | Related link |
| Assignee, reporter | Only with user mapping on, matched by email if Jira shows it, otherwise by name. Jira often hides emails. |

**Start titles with the Jira key** is on by default, e.g. `[SHOP-12] Card payments`, so items are easy to find later. The Jira link back is added as a hyperlink.

### Not copied

- Workflows, transitions and automation rules.
- Worklogs, watchers and votes.
- Jira dashboards and filters.

---

## Running, pausing and resuming

**The Migrate step shows:**
- the current phase (e.g. "Creating work items"), a progress bar, and counts of copied, with warnings, skipped and failed items;
- **Pause:** finishes the items already in progress, then waits. **Resume** continues.
- **Stop:** stops after the items in progress. Everything finished so far is kept.
- **Parallel requests** (1, 2, 3 or 5): how many items are worked on at once. Lower it if Azure DevOps is slowing you down.
- **Activity:** a live log, newest first.

**Speed and limits.** Azure DevOps limits how much one account can do in a few minutes. ToolDock slows down automatically when Azure DevOps says it's close to the limit, waits when it's blocked (`429`), and retries. Large Boards migrations (thousands of items) can take hours. Keep the tab open; lock the tokens if you might refresh.

**Resuming.** Progress is saved in this browser:
- **Retry failed** on the report runs the same job again. Everything already copied is skipped, and only failed or missing items and links are done.
- **After a refresh or on another day:** the **Migrate** overview lists earlier migrations. **Resume** opens the job; reconnect the same source and target and run it again. Finished jobs show **Report**.
- If you change the source or target project, a new job starts, so nothing is wrongly skipped.
- Saved jobs never contain tokens and are removed after 30 days. **Delete** removes one sooner.

What a log or report status means:

| Status | Meaning |
| --- | --- |
| **Copied** | Done. |
| **With warnings** | Done, with something to check (e.g. secrets to fill, a field left out). |
| **Skipped** | Deliberately not done: it already existed, was already copied in an earlier run, or its linked item wasn't migrated. |
| **Failed** | Azure DevOps refused or something went wrong; the message says why. **Retry failed** tries again. |

---

## The migration report

Shown at the end of every run, and again from the overview's **Report** button.

- **Counts:** copied, with warnings, skipped, failed. In Boards these count every step (paths, items, attachments, links), not only work items.
- **To do:** things you must do yourself, as a checklist, each with an **Open** link to the exact page in the target. Examples:
  - **Fill secret value:** `DbPassword in "App-Prod"` → opens that variable group
  - **Create service connection:** `"prod-docker" (dockerregistry)` → opens Service connections
  - **Install extension:** `Task "Super Linter"` → opens the Marketplace page
  - **Set approvers:** `stage "Prod" approvers (Ana) were removed` → opens the release pipeline
  - **Recreate "Build" policy:** → opens the repo's branch policies
  - **Recreate Key Vault-linked group**, **Add environment approvals and resources**, **Add iterations to team settings**, **Revoke both tokens**
- **Check:** things that were copied but are worth a look (e.g. "Original dates not kept", links to items outside the migration).
- **Not copied:** what was left out by design (history, pull requests, run history…).
- **Failed:** each failure with its message, and **Retry failed**.

**Downloads:**
- **Excel:** a Summary sheet, plus one sheet each for To do, Check, Not copied and Failed, with clickable links.
- **Markdown:** a checklist you can paste into a wiki page or ticket.
- **CSV:** one row per item.

---

## Recommended order for a full project move

1. **Variable groups:** pipelines link to them.
2. **Repos:** pipelines build from them, and branch policies are copied with them.
3. **Pipelines:** create the target's service connections and install extensions first. The report lists what's missing.
4. **Boards** (or **Jira to Boards**).
5. **Work through every report's To do list**, then add the build-validation branch policies now that the pipelines exist.
6. **Revoke both tokens.**

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "The server did not return JSON" when connecting | The organization name is wrong (enter only `contoso`, not the URL) or the token is for another organization. |
| "Your token is valid but can't make this change. It needs the … scope" | Create a target token with the scope named in the message, or ask an admin for the permission. |
| Release pipelines list says it couldn't be read | The source token lacks Release (Read). |
| Pipelines are skipped as "repository doesn't exist in the target" | Migrate the repos first, or map them in **Repositories**. |
| Work items created with today's date | The target account lacks "Bypass rules on work item updates". The original date is in each description. |
| A built-in target process can't have types or states added | Map to existing ones, or switch the target project to an inherited process. |
| New iterations don't show on the backlog | Select them in the team's settings (link in the report). |
| A repo import failed | Check the message. Common causes: the repo is too large, or the source token expired during the import. Fix it, then **Retry failed**. The temporary connection is removed either way. |
| Jira won't connect ("did not return JSON" or "not found") on a deployed site | That deployment has no Jira proxy (e.g. Netlify). Use Vercel, nginx or a self-hosted copy. |
| Jira: "Authentication failed" | Check the account email matches the token's account and the site name is right. Tokens are tied to one Atlassian account. |
| Running slowly | That's Azure DevOps' rate limit. ToolDock is waiting as asked. Lowering **Parallel requests** can help on busy organizations. |
