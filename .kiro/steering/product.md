---
inclusion: always
---
# Product steering: skeletext

- The product is a skeleton plus two apps. The skeleton must stay small enough to read in one sitting and must contain no app-specific code.
- Each app lives in its own folder under `apps/` and imports only the public API of `skeleton/`.
- All data shown by the apps is real and fetched live from public endpoints that need no key. Never invent sample numbers for the demo.
- The visual target is a 40 column by 24 row teletext screen with the Level 1 control code behavior from ETS 300 706. When unsure about a control code, check the specification text instead of guessing.
- Plain, factual wording in every file, README and commit message. No marketing language.
