# Karvio ERP contribution workflow

- Start work from the current `main` on a task-specific `draft/<task>` branch. Commit and push meaningful checkpoints to the draft branch while working so another session can resume from GitHub. Keep unrelated work out of each checkpoint.
- If the user explicitly prohibits all pushes for a task, honor that instruction. Save a Git patch in durable storage if available and verify it can be retrieved before calling the work backed up.
- Use a draft pull request targeting `main` to run the build, backend, and Chromium checks. Verify the results for the latest revision. Never treat a local-only change as backed up.
- Update `main` only when the user explicitly authorizes that release and the checks have passed. Verify the deployment workflow after merge.
