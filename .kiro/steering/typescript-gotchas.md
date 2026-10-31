---
inclusion: always
---
# TypeScript gotchas in this repository

These rules were added after earlier Kiro runs spent many credits on the same compiler errors.

- `tsconfig.base.json` sets `noUncheckedIndexedAccess`. Every `array[i]`, `uint8Array[i]` and `string[i]` is typed `T | undefined`. Handle it once, close to the read: `const b = page[i] ?? 0x20;` or `as number` when an earlier bounds check proves it. Do not weaken `tsconfig` files to make errors go away.
- Relative imports inside a package use the `.js` suffix (`import { x } from './grid.js'`), the bundler resolves it to the `.ts` file.
- Use plain `number` for page numbers. Do not introduce branded types.
- `Uint8Array.map` returns a `Uint8Array`, `Array.from(uint8Array)` returns a `number[]`.
- Run `npx tsc -p <package>/tsconfig.json` and the package tests before ticking a task. The repository tests must not be left in watch mode: use `vitest run`.
- Property tests: write the expected value from the requirement text or the reference doc, never from the implementation under test. A property test that restates the implementation will pass while both are wrong. Inside `fc.property` use a block body (`{ expect(...); }`) so the callback does not return a value.
- Do not mutate inputs. Functions that take a page, a store or a state return a new value.
