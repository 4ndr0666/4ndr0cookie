###########################################################################
# AGENTS.md — Work Order
# Status: 🔴 OPEN
#
Project or Sprint name? 4ndr0cookie
# Project/Sprint Name: 4ndr0cookie
Repo URL or short name? https://github.com/4ndr0666/4ndr0cookie
# Repo: https://github.com/4ndr0666/4ndr0cookie
Branch (feature/main/dev...)? codex
# Branch: codex
#
High-level objective (1-2 lines): (End with a single '.')
Start the container and download the repo. The first image shows the current GUI for the extension which I do not like. The padding, layout and alignment is off and it doesnt follow the normal futuristic and cyan-centric HUD frosted-glass type of aesthetic I normally implement. I have shared that very aesthetic in the second image. Use it as inspiration to modify the UI aesthetic similarly.
.
# Objective(s):
# Start the container and download the repo. The first image shows the current GUI for the extension which I do not like. The padding, layout and alignment is off and it doesnt follow the normal futuristic and cyan-centric HUD frosted-glass type of aesthetic I normally implement. I have shared that very aesthetic in the second image. Use it as inspiration to modify the UI aesthetic similarly.
###########################################################################

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

## PR instructions
- Title format: [<project_name>] <Title>
- Always run `pnpm lint` and `pnpm test` before committing.


## ▪︎ Deliverable Matrix
| ID | Output / Path | Owner | Acceptance Tests |
|----|---------------|-------|------------------|

## ▪︎ Task Breakdown (Actionable, Assignable)

## ▪︎ Audit Log / Exceptions (append as found)
> _Append any audit exceptions, unmapped data, or unresolved issues here for team review._

# END CODEX.md
