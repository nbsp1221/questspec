# Repository agent instructions

These are the default working agreements for this repository. Follow a user's explicit instructions when they conflict with these defaults.

## Branches

- Do not make changes directly on `main`. Read-only inspection on `main` is allowed, but create or switch to a task branch before editing tracked files.
- Use a focused branch for each task and keep unrelated work separate.

## Commits

- On a task branch, commit completed work without waiting for user approval.
- Always invoke the `$commit` skill when creating a commit. Follow the repository convention it detects, run its required verification, stage files intentionally, and use its commit guard rather than calling `git commit` directly.
- Create commits at coherent, reviewable checkpoints. Do not combine unrelated changes, and do not create noisy commits for trivial intermediate states.
- If the `$commit` skill is unavailable or its required verification cannot be completed, stop and report the problem instead of bypassing it.

## Pushes and pull requests

- Pushing a task branch is authorized without additional approval when no pull request exists for that branch.
- Before every push, check whether the current branch already has a pull request. If it does, do not push without explicit user approval.
- If pull-request status cannot be determined reliably, do not push until the user approves.
- Never create a pull request without explicit user approval.

## Temporary work and QA

- Freely use temporary locations such as `/tmp` without asking for approval when research, scratch documents, one-off scripts, generated artifacts, or QA work benefits from them.
- Treat temporary inputs, scripts, and reports as local working material. Do not commit them or promote them into CI merely because they were useful during QA.
- Promote temporary QA material into the repository only after deliberately reviewing its licensing, reproducibility, maintenance cost, and suitability as a committed test or tool.
