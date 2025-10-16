# Repository Guidelines

## Project Structure & Module Organization
Source code lives in `src/`, with the React entry point in `main.tsx` and primary UI state in `App.tsx`. Feature components stay in `src/components` (e.g., `EggGacha.tsx`, `SpendingSummary.tsx`). Supabase access utilities belong under `src/lib` (notably `api.ts` and `supabase.ts`); database schemas sit in `supabase-schema.sql` with incremental updates such as `add-person-tracking.sql`. Static assets ship from `public/`, including sound effects in `public/sfx`. Production builds land in `dist/`, and Supabase setup docs/scripts live alongside the root README and `setup-supabase.sh`.

## Build, Test, and Development Commands
Install dependencies via `npm install` (or `yarn install`). Start the interactive dev server with `npm run dev` to launch Vite at http://localhost:5173. Produce optimized assets using `npm run build`, which executes `tsc -b` before `vite build`. Validate the bundle with `npm run preview`. Use `./setup-supabase.sh` to scaffold `.env.local`, install packages, and review the Supabase checklist in `SUPABASE_SETUP.md`.

## Coding Style & Naming Conventions
Write TypeScript with strict mode enabled. Favor functional React components, arrow functions, and hooks for state/effects. Keep indentation at two spaces and prefer single quotes; reserve template literals for interpolation-heavy strings. Use PascalCase for components, camelCase for helpers, and uppercase constants (see `App.tsx`). Tailwind utility classes drive styling—consolidate shared rules in `src/index.css`. Import typed Supabase definitions from `src/lib/supabase.ts` instead of redefining table shapes.

## Testing Guidelines
Automated tests are not yet configured, so rely on targeted manual passes. Before submitting changes, run `npm run dev`, verify “Surprise Me,” meal history editing, and Supabase CRUD paths using the demo user. When touching scoring, weather, or budgeting logic, add inline notes describing expected results and consider introducing Vitest suites once behavior stabilizes.

## Commit & Pull Request Guidelines
Keep commits short, imperative, and scoped (`Fix meal fetch pagination`, `Add diamond egg confetti`). Reference related SQL migrations or Supabase config tweaks in the message body where relevant. Pull requests should summarize the change, document UI impacts with screenshots/GIFs, list manual test steps, and call out any environment or schema updates that reviewers must apply.

## Supabase & Environment Notes
Mirror secrets between `env.example` and `.env.local`, and never push real credentials. Update both `supabase-schema.sql` and a companion migration when altering tables. If you adjust scheduling or keep-alive logic, revise `.github/workflows/keep-supabase-alive.yml` and document the change in SUPABASE_SETUP.md to keep operations aligned.
