# Repository Guidelines

## Project Structure & Module Organization
All runtime code currently lives under `api/line/webhook.ts/`, the serverless handler that bridges Lark events into LINE. Keep entrypoints slim: route files should orchestrate parsing, validation, and outbound messaging, delegating heavy lifting to helpers. Place shared utilities in a new `api/lib/` folder and mirror directory names between source and tests so paths stay predictable.

## Build, Test, and Development Commands
Install dependencies with `npm install` (Node 18+). Run `npx vercel dev` from the repo root to emulate the Vercel runtime; add an `npm run dev` script wrapping that command if it is not already present. Use `npm run build` before shipping to confirm TypeScript compiles without errors. Execute `npm test` (wire it to your chosen test runner) so CI can reuse the same entry point.

## Coding Style & Naming Conventions
Author runtime code in TypeScript, using 2-space indentation and trailing commas in multiline literals. Name route folders with lowercase hyphenated tokens (e.g. `api/line/message-status/route.ts`). Export a single default handler per webhook file, and keep helper utilities camelCase (e.g. `sanitizePayload`). Run `npx eslint --ext .ts api` before committing; add the config if missing.

## Testing Guidelines
Add unit tests alongside source under `tests/api/...`, mirroring the folder structure (`tests/api/line/webhook.spec.ts`). Prefer Vitest or Jest with ts-node; whichever you pick, document it in `package.json`. Ensure new features include unhappy-path coverage for signature verification and payload transformations. Gate merges on `npm test` passing and target at least basic happy-path coverage for every handler.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (e.g. `feat: add line webhook validator`) to keep history searchable while the repository is pre-release. Describe the change, motivation, and testing notes in each PR; include sample webhook payloads or screenshots when UI-adjacent behavior changes. Link to the relevant Lark or LINE ticket, and request at least one review before merging.

## Security & Configuration Notes
Store secrets such as `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, and any Lark credentials in `.env.local`; never commit them. When sharing logs, redact personally identifiable information. Rotate credentials immediately after testing in shared environments and document any new environment variable in `AGENTS.md`.
