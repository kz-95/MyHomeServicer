# Task Completion Protocol (Kilo Code)

**Usage**: Standard close-out steps to run every time a task is finished.

## Rule

When a task is done, run these in order **every time**:

1. **Update relevant Markdown docs** in the same session — `TODO.md` (task
   state), `docs/ai-context/schema-notes.md` (schema), `docs/api-reference/api-doc.md`
   (endpoints), and the agent's own `*-log.md`, as applicable.
2. **Summarize in chat** — short summary of what changed and why.
3. **Commit + push** — stage the task's changes, write a clear commit message,
   then push.
   - **Default: push to `master`** when working solo / sequentially.
   - **Parallel multi-role work:** each role (backend, frontend, qa, devops)
     pushes to its own branch, then merges to `master`.
   - Commit only the files this task touched; no blanket `git add -A` over
     unrelated working-tree changes.
   - Never bypass hooks (`--no-verify`); if a hook fails, fix the cause.

A task is "finished" only after all three steps complete.

## Why

Keeps docs, chat history, and git in sync per task, so state never drifts.
Use `rtk git ...` for git commands to keep output compact (see [rtk-rules.md]).
