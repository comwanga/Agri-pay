# CI/CD Backend Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that auto-deploys the backend to Railway after CI passes on every push to `main` that touches backend files.

**Architecture:** A new `deploy.yml` workflow triggers via `workflow_run` when the existing `CI` workflow completes. It skips if CI failed or if no backend files changed. If both conditions pass, it installs the Railway CLI and runs `railway up`.

**Tech Stack:** GitHub Actions, Railway CLI (`@railway/cli`), bash

---

### Task 1: Create the deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the file**

Create `.github/workflows/deploy.yml` with this exact content:

```yaml
name: Deploy Backend

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'success'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Check if backend files changed
        id: changes
        run: |
          git diff --name-only HEAD~1 HEAD | grep -qE '^(src/|migrations/|Cargo\.toml|Cargo\.lock|Dockerfile)' \
            && echo "changed=true" >> $GITHUB_OUTPUT \
            || echo "changed=false" >> $GITHUB_OUTPUT

      - name: Install Railway CLI
        if: steps.changes.outputs.changed == 'true'
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        if: steps.changes.outputs.changed == 'true'
        run: railway up --service sokopay
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

> **Note:** The `workflows: ["CI"]` name must exactly match the `name:` field in `.github/workflows/main.yml`. It is currently `name: CI` — no change needed.

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add CD workflow: auto-deploy backend to Railway after CI passes"
git push
```

---

### Task 2: Verify the workflow runs correctly

**Files:** none — this is a verification task

- [ ] **Step 1: Watch CI run**

Go to **GitHub → SokoPay → Actions → CI**. Wait for it to finish on `main`.

- [ ] **Step 2: Watch deploy workflow trigger**

Go to **GitHub → SokoPay → Actions → Deploy Backend**. It should appear a few seconds after CI finishes.

Expected outcomes:

| Scenario | Expected result |
|---|---|
| CI passed + backend files changed | Deploy job runs, Railway builds and deploys |
| CI passed + only frontend files changed | Deploy job runs but skips after the file check step |
| CI failed | Deploy job is skipped entirely (not even queued) |

- [ ] **Step 3: Confirm deploy in Railway**

Go to **Railway → SokoPay project → Deployments**. A new deployment should appear with status `Success`.

- [ ] **Step 4: Confirm migrations ran**

In Railway → your service → **Logs**, look for the SQLx migration log line on startup, e.g.:

```
Running migrations...
Applied migration: 20240101_init
```

If you see no migration errors and the app responds to requests, migrations ran correctly.
