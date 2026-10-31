# Review notes

Kiro generated a first version of `skeleton/src/interpreter.ts` and its tests (model claude-haiku-4.5, custom agent `teletext-builder`, 61 tests passing). A review against `docs/ets300706-level1-reference.md` found defects that the generated tests did not detect, because the tests repeated the same misreadings:

1. "Bit 6" of the G1 mosaic set was read as `0x40`. The requirement text listed the right ranges (0x20 to 0x3F and 0x60 to 0x7F), the implementation did not follow them.
2. Mosaic colour codes 0x11 to 0x17 mapped to colour index 0 to 6 instead of 1 to 7.
3. The lower row of a double-height pair took its background from the lower row's own data instead of from the cells above it.
4. Release Mosaics (set-after) lost the held mosaic on its own cell, and the held mosaic took the current separated form instead of the original one.
5. Control cells used an empty string instead of a space, and the no-effect codes were not identical to 0x20.

The interpreter and its tests were rewritten by hand. The new test file fails 9 of 22 tests against the original implementation and passes completely against the rewrite. The original files are kept here as `.txt` copies:

- `kiro-interpreter-as-generated.ts.txt`
- `kiro-interpreter-test-as-generated.ts.txt`
