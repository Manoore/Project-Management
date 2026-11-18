# Project delivery guide

Choose a project in the left sidebar. Work, Modules, Documents, Insights, and Workflow use the same PostgreSQL records and project access rules.

## Bulk work
Select individual cards/rows or Select visible work (up to 100 items). Choose a field and new value. Bulk actions support workflow stage, assignee, priority, due date, labels, cycle, and module. Labels replace existing labels; clear controls remove deadlines or labels. Invalid selections reject the whole update. Activity and task changes commit together.

## Workflows
Managers and administrators can rename and order stages and add custom stages. Each stage maps to To do, In progress, Review, or Done, keeping reports consistent. Changing a custom stage category updates its tasks. Removing a custom stage retains the tasks in their default category. Default categories cannot be changed or removed.

## Modules
Create an initiative or release area with an owner, target date, and outcome. Assign tasks in Work allocation. View module work opens a filtered board. New tasks created in that filtered view inherit the module. Bulk actions can move several tasks into a module. Archived modules retain their tasks and clear module assignments.

## Documents
Save document creates a numbered revision. Revision history shows older content; Restore into draft copies a revision for editing, and saving creates a new revision. Concurrent edits use version checks. A stale save preserves your draft; copy it before reloading and merging. Unsaved drafts are protected by in-app switching prompts. Archiving retains stored revisions.

## Insights
Live reports show completion, overdue work, missing deadlines, unscheduled backlog, stages, priority, task age, owner workload, and cycle delivery. Charts include labels and data tables. CSV export contains summary, owner breakdown, and daily delivery events.

Delivery activity records actual creation, completion, and reopening events over 30 days. The report shows when tracking started; earlier history is not invented. Re-completion after reopening is a new completion event. Dates use the database calendar.

## Keyboard shortcuts
Outside inputs and task dialogs, / focuses search, N focuses new work, B chooses Board, L chooses List, and ? toggles help. Left/right arrows move through the project tabs.

## Access
Viewers can read shared projects. Members can edit work and documentation. Managers and administrators configure workflows and modules within visible projects. Project membership is checked by API handlers; hiding UI is not the permission boundary.
