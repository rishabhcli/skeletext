---
inclusion: always
---
# Tech steering: skeletext

- Language: TypeScript with strict mode, ES modules, no framework in the skeleton.
- Runtime for tests and tooling: Node.js 20 or newer. Browser apps are static files that can be hosted on any free static host.
- Tests: Vitest for unit tests and fast-check for property-based tests. Every requirement in a spec that states an invariant gets a property test.
- The skeleton has zero runtime dependencies.
- Network access happens only in app code, never in the skeleton, and every fetch has a timeout and a visible error page.
