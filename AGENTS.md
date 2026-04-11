# Repository Guidelines

## Project Structure & Module Organization

This is a Solid + Vite TypeScript note-taking app. Application code lives in `src/`, with the main UI in `src/App.tsx`, shared styling in `src/App.css` and `src/index.css`, and feature modules such as `notebook.ts`, `noteFile.ts`, `slideshow.ts`, and `webEmbeds.ts`. Unit tests are colocated as `src/*.test.ts`. Static public assets live in `public/`; source-only assets are under `src/assets/`. The repository also includes an agent skill definition in `skills/note-web/SKILL.md`.

## Build, Test, and Development Commands

Use `pnpm` with the checked-in `pnpm-lock.yaml`.

- `pnpm install`: install dependencies.
- `pnpm dev`: start the Vite development server.
- `pnpm build`: run TypeScript project checks, then create the production build in `dist/`.
- `pnpm test`: run the Vitest suite once.
- `pnpm preview`: serve the built app locally for final inspection.

## Coding Style & Naming Conventions

Write TypeScript using ES modules and Solid primitives. Follow the existing style: two-space indentation, single quotes, no semicolons, and extensionless relative imports such as `./notebook`. Use PascalCase for Solid components (`RichTextItem.tsx`), camelCase for functions and variables, and descriptive exported constants in uppercase when they represent stable protocol or storage keys. Keep UI state ownership local unless a module already defines the relevant domain logic.

## Testing Guidelines

Tests use Vitest in a Node environment and are discovered by `src/**/*.test.ts`. Name test files after the module under test, for example `notebook.test.ts` for `notebook.ts`. Prefer focused tests for parsing, serialization, migrations, export behavior, and other deterministic domain logic. Run `pnpm test` before committing; run `pnpm build` when changes affect types, app wiring, or production output.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects, for example `Support dark mode slide frames` and `Fix file open filters and export preview`. Keep the first line specific and avoid unrelated changes in the same commit. Pull requests should include a concise behavior summary, test results such as `pnpm test` and `pnpm build`, linked issues when applicable, and screenshots or short recordings for visible UI changes.

## Deployment & Configuration Notes

The Vite base path is derived from `GITHUB_REPOSITORY` for GitHub Pages. Avoid hardcoding deployment paths in app code; use Vite/public asset conventions instead. Do not commit generated `dist/` changes unless a release process explicitly requires them.

## Agent-Specific Instructions

When responding as an AI contributor in this repository, use Japanese for user-facing conversation unless the user explicitly requests another language.
