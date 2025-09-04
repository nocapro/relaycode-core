# relaycode-core 🚀

[![npm version](https://img.shields.io/npm/v/relaycode-core.svg)](https://www.npmjs.com/package/relaycode-core)
[![npm downloads](https://img.shields.io/npm/dm/relaycode-core.svg)](https://www.npmjs.com/package/relaycode-core)
[![License](https://img.shields.io/npm/l/relaycode-core.svg)](https://github.com/nocapro/relaycode-core/blob/main/LICENSE)

> The shared engine behind **RelayCode** and **Noca.pro** – a zero-friction, AI-native patch engine that turns your clipboard into a surgical code-editing laser.
> Powered underneath by [`apply-multi-diff`](https://github.com/nocapro/apply-multi-diff) for bullet-proof, fuzzy-matching, indentation-preserving patches.

---

## TL;DR

Paste a code block from any LLM → we parse it, patch it, and commit it.
No IDE plugins. No CLI gymnastics. Just **paste → preview → push**.

---

## What is this?

`relaycode-core` is the parser + patch engine that powers **both** RelayCode and Noca.pro.
It takes raw LLM output (with or without YAML frontmatter) and converts it into deterministic file operations:

- ✅ `write` (with `replace`, `standard-diff`, or `search-replace`)
- ✅ `delete`
- ✅ `rename`

All wrapped in Zod schemas so TypeScript screams *before* you ship a broken diff to prod.

---

## Install

```bash
bun add relaycode-core
```

(We ship ESM-only. CJS is dead, long live ESM.)

---

## Quick Start

```ts
import { parseLLMResponse, applyOperations } from 'relaycode-core';

const raw = await navigator.clipboard.readText(); // or anywhere you got LLM goo
const parsed = parseLLMResponse(raw);
if (!parsed) throw new Error('Invalid LLM response');

const originalFiles = new Map([
  ['src/index.ts', oldContent],
  ['package.json', pkg],
]);

const result = await applyOperations(parsed.operations, originalFiles);
if (!result.success) throw new Error(result.error);

// result.newFileStates is now a Map<string,string|null> ready to write to disk
```

---

## Clipboard Grammar (the 30-second spec)

We accept **three** markdown dialects:

1. **Plain code fence**
   ````ts
   ```ts
   // src/utils.ts
   export const pi = 3.14;
   ```
   ````

2. **With patch strategy**
   ````ts
   ```ts src/utils.ts search-replace
   <<<<<<< SEARCH
   export const pi = 3;
   =======
   export const pi = 3.14;
   >>>>>>> REPLACE
   ```
   ````

3. **With control YAML trailer**
   ````yaml
   projectId: relay-42
   uuid: 550e8400-e29b-41d4-a716-446655440000
   gitCommitMsg: "feat: moar digits of pi"
   ```
   (YAML can be fenced or bare at the bottom – we’re not picky.)

---

## Patch Strategies

| Strategy        | When to use                          | Example trigger                     |
|-----------------|--------------------------------------|-------------------------------------|
| `replace`       | Full-file overwrite (default)        | No diff markers                     |
| `standard-diff` | Classic `---` / `+++` / `@@`         | Starts with `--- a/file`            |
| `search-replace`| Git-style `<<<<<<< SEARCH` blocks    | Contains `>>>>>>> REPLACE`          |

We auto-detect, or you can force it in the fence header.
Under the hood we delegate to [`apply-multi-diff`](https://github.com/nocapro/apply-multi-diff) so you get **fuzzy matching**, **hunk-splitting**, and **indentation preservation** for free.

---

## Logger

Set `LOG_LEVEL=debug` and we’ll spam your terminal with gray `[DEBUG]` lines.
Otherwise we stay quiet like a good Unix citizen.

---

## Types (the good stuff)

Everything is Zod-validated so you get **runtime + compile-time** safety:

- `ParsedLLMResponse` – the holy grail object after parsing
- `FileOperation` – discriminated union of write/delete/rename
- `Config` – the user’s `relaycode.config.json` schema
- `StateFile` – transaction log we write to `.relay/`

---

## Edge Cases We Handle So You Don’t Have To

- Paths with spaces **must** be quoted (`"my file.ts"`).
- Trailing newlines are preserved (we only strip *one* leading newline for `replace`).
- Renames are atomic – old path set to `null`, new path inherits content.
- Deleting a non-existent file is an error – we bail fast.
- Search-replace on a new file is an error – we bail fast.
- Malformed YAML? We ignore it and keep parsing.
- Multiple YAML blocks? We take the **last** one (LLMs love to echo examples).

---

## Performance

- Single-pass regex for code blocks.
- LCS diff calculation in `O(n·m)` but on **lines**, not characters – plenty fast for real files.
- Zero deps outside `js-yaml`, `zod`, and our own [`apply-multi-diff`](https://github.com/nocapro/apply-multi-diff) (also written in Bun).

---

## Roadmap (PRs welcome)

- [ ] Directory-level operations (`mkdir`, `rmdir`)
- [ ] Conflict markers à la `git apply --reject`

---

## License

MIT. Hack it, ship it, make millions, tell your friends.

---

## One-liner Pitch

If `git apply` and `sed` had a baby, and that baby was raised by LLMs, it would be `relaycode-core`.
