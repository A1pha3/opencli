# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCLI is a TypeScript CLI tool that turns any website, Electron app, or local CLI into a command-line interface. It features a YAML-driven adapter system, browser automation via a Chrome extension bridge, and is designed for AI agents.

## Build & Run Commands

```bash
npm ci                          # Install dependencies
npm run build                   # Clean dist → tsc → copy YAML → build manifest
npm run dev                     # Run in dev mode via tsx
npm start                       # Run compiled output
npm run typecheck               # Type-check without emitting
npm run lint                    # Same as typecheck (tsc --noEmit)
```

## Testing

Uses **vitest** with 4 projects (unit, adapter, e2e, smoke):

```bash
npm test                        # Unit tests only (src/**/*.test.ts)
npm run test:adapter            # Adapter tests (clis/**/*.test.ts)
npm run test:e2e                # E2E tests (requires `npm run build` first)
npm run test:all                # All projects
npx vitest run src/pipeline/executor.test.ts   # Single test file
npx vitest src/                 # Watch mode for unit tests
```

E2E and smoke tests run against the built `dist/src/main.js` — always `npm run build` first.

## Architecture

### Entry Point (`src/main.ts`)
Bootstraps PATH, discovers adapters (built-in → user → plugins), handles shell completions fast-path, emits startup hooks, then hands off to `runCli()`.

### Adapter System (`clis/`)
Each directory under `clis/` is a site adapter containing YAML definitions and optional TypeScript helpers. Example: `clis/bilibili/hot.yaml`.

YAML adapters define:
- `site`, `name`, `description`, `domain`, `strategy` (public/browser/hybrid)
- `args` with types and defaults
- `pipeline` — a sequence of steps executed by the pipeline engine

Adapters with `browser: true` require the Browser Bridge Chrome extension. Public adapters call APIs directly.

### Pipeline Engine (`src/pipeline/`)
- **Executor** (`executor.ts`) — runs pipeline steps sequentially with retry logic for browser steps
- **Template** (`template.ts`) — expression evaluation (`${{ args.limit }}`, `${{ item.title }}`)
- **Steps** (`steps/`) — handlers: `fetch`, `browser` (navigate/click/type/etc.), `transform` (map/filter/limit/sort), `download`, `intercept`, `tap`

### Browser Bridge (`src/daemon.ts`, `src/browser/`)
- HTTP + WebSocket micro-daemon on `localhost:19825`
- Connects CLI to Chrome via a Browser Bridge extension
- Anti-detection: patches `navigator.webdriver`, stubs `window.chrome`, fakes plugins, sanitizes stack traces
- Auto-spawns on first browser command, auto-exits after idle timeout

### External CLI Hub (`src/external.ts`)
Registers external CLIs (gh, docker, obsidian, etc.) for passthrough execution with auto-install.

### Discovery (`src/discovery.ts`)
Sequential: built-in CLIs → user CLIs (`~/.opencli/clis/`) → plugins. Last registration wins (plugins can override built-ins).

### Command Registration (`src/commanderAdapter.ts`)
Converts adapter YAML definitions into Commander.js commands dynamically.

## Key Patterns

### Creating a New Adapter
1. Create directory: `clis/mysite/`
2. Create YAML: `clis/mysite/command.yaml` with pipeline steps
3. Add optional `.ts` helpers alongside the YAML
4. Add tests: `clis/mysite/command.test.ts` (adapter project)

### Adding a Pipeline Step
1. Add handler in `src/pipeline/steps/`
2. Register in the pipeline registry
3. Add unit tests in the same directory

### Exit Codes
Follows Unix `sysexits.h`: 0 (success), 1 (error), 2 (usage), 66 (empty), 69 (browser unavailable), 75 (timeout), 77 (auth), 78 (config), 130 (SIGINT).

## Build Output
- TypeScript compiles to `dist/src/`
- YAML adapters copy to `dist/clis/`
- Manifest generated at `dist/cli-manifest.json`
- The `prepare` script runs build on `npm install` (guarded by `[ -d src ]` for published packages)

## CI
- **ci.yml**: build check + unit tests (Node 20/22, sharded) + smoke tests (scheduled)
- **e2e-headed.yml**: real Chrome with xvfb on Linux, real browser automation tests
- E2E uses `OPENCLI_BROWSER_EXECUTABLE_PATH` env var for Chrome path injection
