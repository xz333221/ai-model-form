---
name: auto-commit
description: "After every meaningful code change, automatically stage all modified files and create a conventional commit message. Use when the user says 'commit', 'save changes', 'auto commit', or after completing a development task."
agent_created: true
---

# Auto Commit Skill

## Overview

After completing a code change, automatically stage all modified files and generate a
clean conventional commit message based on what was changed.

## When to Use

- After implementing a feature or fix
- When user says "commit", "auto commit", "save changes", "提交代码", "提交"
- At the end of each task or subtask in a multi-step workflow

## Conventional Commit Format

```
<type>(<scope>): <short description>

[optional body]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or component |
| `fix` | Bug fix |
| `style` | UI/CSS-only changes |
| `refactor` | Code restructure, no behavior change |
| `docs` | Documentation only |
| `chore` | Build, config, dependency changes |
| `test` | Tests added or updated |

## Workflow

### Step 1: Check git status

```bash
git status
git diff --stat
```

### Step 2: Stage all changes

```bash
git add -A
```

### Step 3: Analyze changed files

Look at the diff summary and determine:
- What files were added, modified, or deleted
- What feature or fix was implemented
- Which scope (component, module, route) was affected

### Step 4: Generate commit message

Based on the changes:

```bash
git commit -m "feat(ai-model-form): implement add model form with Vue 3 + Express"
```

Or with a body for larger changes:

```bash
git commit -m "feat(form): add endpoint/model comboboxes with dropdown

- Built-in provider presets (13 providers)
- Auto-fetch model list from OpenAI-compatible /v1/models
- API connection test before saving
- API Key show/hide toggle"
```

### Step 5: Confirm

Output the commit hash and message to confirm success.

## Rules

- Never commit `node_modules/`, `dist/`, or `.env` files
- Always use English for commit messages
- Keep subject line under 72 characters
- Use imperative mood: "add feature" not "added feature"
- If unsure of scope, omit it: `feat: description`
