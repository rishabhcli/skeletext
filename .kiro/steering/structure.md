---
inclusion: always
---
# Structure steering: skeletext

- `skeleton/src/` holds the engine, `skeleton/test/` holds its tests.
- `apps/<name>/src/` holds app code and `apps/<name>/test/` its tests.
- Specs live in `.kiro/specs/<feature>/` as `requirements.md`, `design.md` and `tasks.md`.
- Never add `.kiro/` or any subfolder of it to `.gitignore`.
