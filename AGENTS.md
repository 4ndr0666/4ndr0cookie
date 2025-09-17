# AGENTS.md

## Requirements

- **All files must be explicitly cleaned of CODEX merge artifacts before any commit or pull request merge.**
- **Use the utility: `0-tests/codex-merge-clean.sh <file ...>` to ensure no `<<<<<<<<<<<<<<<<<<<CODEX_`, `=========================`, or `>>>>>>>>>>>>>>>>>Main` blocks remain.**
#
# ```bash
# #!/usr/bin/env bash
# set -e
# for f in $(git diff --cached --name-only); do
#     [ -f "$f" ] && 0-tests/codex-merge-clean.sh "$f"
# done
# git add .
# ```
#
- Run this tool after your merges, and before lint, test, or commit stages.
- Never use placeholders, half-measures, or omitted code lines.
- Provide all functional logic end-to-end.
- Prioritize local scoping and complete path resolution.
- Adhere to XDG Base Directory Specification for file paths where applicable.

## Workflow

1. **Review respective linter findings for all code in the codebase.**
2. For each issue, apply remediation according to standards detailed below.
3. Remove all merge artifact markers before proceeding.
4. Validate that all code now passes their respective linters with zero warnings or errors.
5. Ensure all variable assignments, quoting, and control structures are correct and robust.
6. For any remaining ambiguity or policy conflict, write it in the summary of changes at `0-tests/task_outcome.md`.
7. Proceed with the users instructions.

## Testing (minimum)

- Find the CI plan in the .github/workflows folder.
- Run `pnpm turbo run test --filter <project_name>` to run every check defined for that package.
- From the package root you can just call `pnpm test`. The commit should pass all tests before you merge.
- To focus on one step, add the Vitest pattern: `pnpm vitest run -t "<test name>"`.
- Fix any test or type errors until the whole suite is green.
- After moving files or changing imports, run `pnpm lint --filter <project_name>` to be sure ESLint and TypeScript rules still pass.
- Add or update tests for the code you change, even if nobody asked.

**Changelogs:**

* Comprehensively capture and detail all changes into `0-tests/CHANGELOG.md`.
* Similarly, summarise any specific or nuanced outcomes in `0-tests/task_outcome.md` post-merge.

**Development Environment Tips:**

- Use `pnpm dlx turbo run where <project_name>` to jump to a package instead of scanning with `ls`.
- Run `pnpm install --filter <project_name>` to add the package to your workspace so Vite, ESLint, and TypeScript can see it.
- Use `pnpm create vite@latest <project_name> -- --template react-ts` to spin up a new React + Vite package with TypeScript checks ready.
- Check the name field inside each package's package.json to confirm the right name—skip the top-level one.

---

# Success Criteria

## Validation

* Each function must be:
  * **Well-defined and fully implemented**.
  * **Idempotent** and **accessible**.
  * **Logically isolated** with explicit error capture.
  * **Appropriately declared and separated from assignments**.
  * **Free from ambiguity, newlines, extraneous input, or bad splitting**.
  * **Free of cyclomatic complexity**, using clear flow constructs
  * Properly quoted (expansions), especially in command arguments and redirections.
  * Free from short flags unless standard. (use long-form flags e.g., `--help`).
  * Non-interactive/pipeline-safe (e.g., `printf` over `echo`).
  * Explicitly error handling; check all critical command returns.
  * Checking for file existence/permissions and validating input/output and export.
  * Bounded appropriately with no arbitrary variables; they must be assigned.
  * XDG Specifications compliant.
  * Linted (no errors/warnings).

## Merge & Review Protocol

1. Attach coverage delta (`pytest-cov` output).
2. Run: codex-merge-clean.sh $(git diff --name-only main..HEAD)
3. If merge artifacts remain, reject PR and clean the conflicts.
