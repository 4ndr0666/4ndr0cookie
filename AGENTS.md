# AGENTS.md

**Status:** 🔴 OPEN
**Repo:** https://github.com/4ndr0666/4ndr0cookie
**Branch:** codex

---

## High-level objective:

Start the container and download the repo. The first image shows the current GUI for the extension which I do not like. The padding, layout and alignment is off and it doesnt follow the normal futuristic and cyan-centric HUD frosted-glass type of aesthetic I normally implement. I have shared that very aesthetic in the second image. Use it as inspiration to modify the UI aesthetic similarly.

### Objective(s):

Start the container and download the repo. The first image shows the current GUI for the extension which I do not like. The padding, layout and alignment is off and it doesnt follow the normal futuristic and cyan-centric HUD frosted-glass type of aesthetic I normally implement. I have shared that very aesthetic in the second image. Use it as inspiration to modify the UI aesthetic similarly.

## General Best Practices

- Eliminate the potential for error by removing the human aspect; ensure the tasks you need done are handled via one-liners, functions or scripts and not by manual human input. 
- Never use placeholders, half-measures, or omitted code lines. Provide all functional logic end-to-end.
- Prioritize local scoping, strict error handling, and complete path resolution.
- Always lint using ShellCheck where applicable. Adhere to XDG Base Directory Specification for file paths.
- Automation must minimize user intervention while safeguarding system integrity.
- All files must be cleaned of CODEX merge artifacts before any commit or pull request merge.
- Use the utility: `0-tests/codex-merge-clean.sh <file ...>` to ensure no `<<<<<<<<<<<<<<<<<<<CODEX_`, `=========================`, or `>>>>>>>>>>>>>>>>>Main` blocks remain.
- Run this tool after CODEX-assisted merges, and before lint, test, or commit stages.

## Dev environment tips

- Use `pnpm dlx turbo run where <project_name>` to jump to a package instead of scanning with `ls`.
- Run `pnpm install --filter <project_name>` to add the package to your workspace so Vite, ESLint, and TypeScript can see it.
- Use `pnpm create vite@latest <project_name> -- --template react-ts` to spin up a new React + Vite package with TypeScript checks ready.
- Check the name field inside each package's package.json to confirm the right name—skip the top-level one.

## Testing instructions

- Find the CI plan in the .github/workflows folder.
- Run `pnpm turbo run test --filter <project_name>` to run every check defined for that package.
- From the package root you can just call `pnpm test`. The commit should pass all tests before you merge.
- To focus on one step, add the Vitest pattern: `pnpm vitest run -t "<test name>"`.
- Fix any test or type errors until the whole suite is green.
- After moving files or changing imports, run `pnpm lint --filter <project_name>` to be sure ESLint and TypeScript rules still pass.
- Add or update tests for the code you change, even if nobody asked.

## Validation Requirements

Ensure all functions explicitly check:
- Return status of critical commands
- Input/output validations
- File existence and permission conditions

### Ensure all functions are:

- **Well-defined and fully implemented**
- **Idempotent** and **accessible**
- **Logically isolated** with explicit error capture
- **Variable declarations separate from assignments**
- **Free from ambiguity, newlines, extraneous input, or bad splitting**
- **Free of cyclomatic complexity**, using clear flow constructs

## Merge & Review Protocol

1. Disclose *function count* + *line count* for every revised script in PR body.
2. Attach coverage delta (`pytest-cov` output).
3. Reviewer runs:
     ./codex-merge-clean.sh $(git diff --name-only main..HEAD)
 4. If merge artifacts remain, reject PR.

## Changelogs

* Add entry to `0-tests/CHANGELOG.md` for multi-file changes.
* Summarise outcome in `0-tests/task_outcome.md` post-merge.

## Authorization Guardrails

• Only operate on files/directories explicitly named in a work order.
• Never bypass lint, dry-run, or coverage thresholds without written exception.

---

# End of AGENTS.md
