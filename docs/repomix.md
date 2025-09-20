# Directory Structure
```
src/
  constants.ts
  index.ts
  logger.ts
  parser.ts
  patch.ts
  types.ts
package.json
README.md
tsconfig.json
```

# Files

## File: src/constants.ts
`````typescript
export const DELETE_FILE_MARKER = '//TODO: delete this file';
export const RENAME_FILE_OPERATION = 'rename-file';
`````

## File: src/index.ts
`````typescript
export * from './types';
export * from './constants';
export * from './parser';
export * from './patch';
export * from './logger';
`````

## File: src/logger.ts
`````typescript
// A simple logger for debugging within the core package.
// To enable debug logs, set LOG_LEVEL=debug in the environment.
const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
type LogLevelName = keyof typeof levels;

const isValidLogLevel = (level: string): level is LogLevelName => {
    return level in levels;
}

const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const LOG_LEVEL: LogLevelName = isValidLogLevel(envLogLevel) ? envLogLevel : 'info';

const currentLevel = levels[LOG_LEVEL];

const log = (level: number, prefix: string, ...args: any[]) => {
  if (level >= currentLevel) {
    if (level === levels.debug) {
        console.log(`\x1b[90m${prefix}\x1b[0m`, ...args); // Gray for debug
    } else {
        console.log(prefix, ...args);
    }
  }
};

export const logger = {
  debug: (...args: any[]) => log(levels.debug, '[DEBUG]', ...args),
  info: (...args: any[]) => log(levels.info, '[INFO]', ...args),
  warn: (...args: any[]) => log(levels.warn, '[WARN]', ...args),
  error: (...args: any[]) => log(levels.error, '[ERROR]', ...args),
};
`````

## File: README.md
`````markdown
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
`````

## File: src/parser.ts
`````typescript
import yaml from 'js-yaml';
import { logger } from './logger';
import { z } from 'zod';
import {
  ControlYamlSchema,
  ParsedLLMResponseSchema,
  PatchStrategySchema,
} from './types';
import type {
  FileOperation,
  ParsedLLMResponse,
  PatchStrategy,
} from './types';
import {
  DELETE_FILE_MARKER,
  RENAME_FILE_OPERATION
} from './constants';

const CODE_BLOCK_REGEX = /```(?:\w+)?\s*([^\r\n]*?)\r?\n([\s\S]*?)```/g;

type ParsedHeader = {
  filePath: string;
  patchStrategy: PatchStrategy | null;
};

const parseCodeBlockHeader = (headerLine: string): ParsedHeader | null => {
  // This regex handles:
  // 1. A quoted file path, optionally followed by a strategy.
  // 2. An unquoted file path, optionally followed by a strategy.
  // It's more robust than splitting by space.
  const match = headerLine.match(/^(?:"([^"]+)"|(\S+))(?:\s+(\S+))?$/);

  if (!match) {
    // If the regex fails, it might be a path with spaces that isn't quoted.
    // The instructions say paths with spaces MUST be quoted, but we can be lenient.
    // We'll check if the last word is a strategy. If so, the rest is the path.
    const parts = headerLine.split(/\s+/);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1]!;
      const parsedStrategy = PatchStrategySchema.safeParse(lastPart);
      if (parsedStrategy.success) {
        const filePath = parts.slice(0, -1).join(' ');
        return { filePath, patchStrategy: parsedStrategy.data };
      }
    }
    // Otherwise, assume the whole line is a file path with no strategy.
    return headerLine.trim() ? { filePath: headerLine.trim(), patchStrategy: null } : null;
  }

  const filePath = match[1] || match[2]; // Group 1 is quoted, group 2 is unquoted.
  if (!filePath) return null;

  const strategyStr = match[3] || '';
  if (strategyStr) {
    const parsedStrategy = PatchStrategySchema.safeParse(strategyStr);
    if (!parsedStrategy.success) {
      return null; // Explicit but invalid strategy
    }
    return { filePath, patchStrategy: parsedStrategy.data };
  }

  return { filePath, patchStrategy: null }; // No strategy provided
};

const inferPatchStrategy = (content: string, providedStrategy: PatchStrategy | null): PatchStrategy => {
  if (providedStrategy) return providedStrategy;
  if (/^<<<<<<< SEARCH\s*$/m.test(content) && content.includes('>>>>>>> REPLACE')) return 'search-replace';
  if (content.startsWith('--- ') && content.includes('+++ ') && content.includes('@@')) return 'standard-diff';
  return 'replace';
};

const extractAndParseYaml = (rawText: string) => {
  // Strategy 1: Find all fenced YAML blocks and try to parse the last one.
  const yamlBlockMatches = [...rawText.matchAll(/```\s*(?:yaml|yml)[\r\n]([\s\S]+?)```/gi)];

  if (yamlBlockMatches.length > 0) {
    const lastMatch = yamlBlockMatches[yamlBlockMatches.length - 1]!;
    try {
      const yamlContent: unknown = yaml.load(lastMatch[1]!);
      const control = ControlYamlSchema.parse(yamlContent);
      // Success! This is our control block.
      const textWithoutYaml = rawText.substring(0, lastMatch.index) + rawText.substring(lastMatch.index! + lastMatch[0].length);
      return { control, textWithoutYaml: textWithoutYaml.trim() };
    } catch (e) {
      // The last block was not a valid control block.
      // We will now fall through to the non-fenced strategy, assuming the fenced block was just an example.
    }
  }

  // Strategy 2: Look for a non-fenced block at the end.
  const lines = rawText.trim().split('\n');
  let yamlStartIndex = -1;
  // Heuristic: project ID is required, so we look for that.
  const searchLimit = Math.max(0, lines.length - 20);
  for (let i = lines.length - 1; i >= searchLimit; i--) {
    if (lines[i]?.trim().match(/^projectId:/)) {
      yamlStartIndex = i;
      break;
    }
  }

  if (yamlStartIndex !== -1) {
    const yamlText = lines.slice(yamlStartIndex).join('\n');
    try {
      const yamlContent: unknown = yaml.load(yamlText);
      const control = ControlYamlSchema.parse(yamlContent);
      // Success!
      const textWithoutYaml = lines.slice(0, yamlStartIndex).join('\n');
      return { control, textWithoutYaml: textWithoutYaml.trim() };
    } catch (e) {
      // Non-fenced YAML block at the end was not a valid control block.
    }
  }

  // If both strategies fail, there's no valid control block.
  return { control: null, textWithoutYaml: rawText };
};

const parseCodeBlock = (match: RegExpExecArray): { operation: FileOperation, fullMatch: string } | null => {
  const [fullMatch, rawHeader, rawContent] = match;
  let headerLine = (rawHeader || '').trim();

  // CRITICAL FIX: Do not strip the trailing newline. Preserve the raw content from the regex.
  const content = rawContent || '';

  logger.debug(`[parser] Matched block header: '${rawHeader}'`);
  logger.debug(`[parser] Raw content (JSON encoded):`, JSON.stringify(content));

  const commentIndex = headerLine.indexOf('//');
  if (commentIndex !== -1) {
    // If we find `//`, we assume what follows is the file path and optional strategy.
    headerLine = headerLine.substring(commentIndex + 2).trim();
    // This handles formats like `typescript // "path/to/my component.ts" standard-diff`.
  }

  if (headerLine.startsWith('//')) {
    headerLine = headerLine.substring(2).trim();
  }

  if (!headerLine) return null;

  if (headerLine === RENAME_FILE_OPERATION) {
    try {
      const { from, to } = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(JSON.parse(content));
      return { operation: { type: 'rename', from, to }, fullMatch };
    } catch (e) {
      return null;
    }
  }

  const parsedHeader = parseCodeBlockHeader(headerLine);
  if (!parsedHeader) {
    // If header parsing fails but we have a space-separated path, treat the whole thing as a file path
    const parts = headerLine.split(/\s+/);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1]!;
      const parsedStrategy = PatchStrategySchema.safeParse(lastPart);
      if (!parsedStrategy.success) {
        // The last part is not a valid strategy, so treat the whole line as a file path
        const filePath = headerLine;
        const patchStrategy = inferPatchStrategy(content, null);
        
        if (content.trim() === DELETE_FILE_MARKER) {
          return { operation: { type: 'delete', path: filePath }, fullMatch };
        }
        
        let cleanContent = content;
        if (patchStrategy === 'replace') {
          cleanContent = content.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
        }
        
        return {
          operation: { type: 'write', path: filePath, content: cleanContent, patchStrategy },
          fullMatch
        };
      }
    }
    return null;
  }

  const { filePath } = parsedHeader;

  if (content.trim() === DELETE_FILE_MARKER) {
    return { operation: { type: 'delete', path: filePath }, fullMatch };
  }

  const patchStrategy = inferPatchStrategy(content, parsedHeader.patchStrategy);

  // CRITICAL FIX: Handle START/END markers and clean content for replace strategy
  let cleanContent = content;
  if (patchStrategy === 'replace') {
    // Remove START/END markers if present
    cleanContent = content.replace(/^\/\/ START\s*\r?\n/, '').replace(/\r?\n\/\/ END\s*$/, '');
    // Remove leading newline if present
    cleanContent = cleanContent.replace(/^\r?\n/, '');
    // Remove trailing newline if present (but preserve other whitespace)
    cleanContent = cleanContent.replace(/\r?\n$/, '');
  }

  if (patchStrategy === 'replace') {
    logger.debug(`[parser] Final 'replace' content (JSON encoded):`, JSON.stringify(cleanContent));
  }

  return {
    operation: { type: 'write', path: filePath, content: cleanContent, patchStrategy },
    fullMatch
  };
};

export const parseLLMResponse = (rawText: string): ParsedLLMResponse | null => {
  const { control, textWithoutYaml } = extractAndParseYaml(rawText);

  if (!control) {
    return null;
  }

  const operations: FileOperation[] = [];
  const matchedBlocks: string[] = [];
  let match;

  while ((match = CODE_BLOCK_REGEX.exec(textWithoutYaml)) !== null) {
    const result = parseCodeBlock(match);
    if (result) {
      operations.push(result.operation);
      matchedBlocks.push(result.fullMatch);
    }
  }

  if (operations.length === 0) {
    return null;
  }

  let reasoningText = textWithoutYaml;
  for (const block of matchedBlocks) {
    reasoningText = reasoningText.replace(block, '');
  }
  const reasoning = reasoningText.split('\n').map(line => line.trim()).filter(Boolean);

  try {
    const parsedResponse = ParsedLLMResponseSchema.parse({ control, operations, reasoning });
    return parsedResponse;
  } catch (e) {
    return null;
  }
};
`````

## File: src/patch.ts
`````typescript
import type { FileOperation } from './types';
import { applyStandardDiff, applySearchReplace, type ApplyDiffResult } from 'apply-multi-diff';

const patchStrategies = {
  'standard-diff': async (p: { originalContent: string; diffContent: string; }) => {
    const result = applyStandardDiff(p.originalContent, p.diffContent) as ApplyDiffResult;
    if (result.success) return { success: true, content: result.content };
    return { success: false, error: result.error.message };
  },
  'search-replace': async (p: { originalContent: string; diffContent: string; }) => {
    const result = applySearchReplace(p.originalContent, p.diffContent) as ApplyDiffResult;
    if (result.success) return { success: true, content: result.content };
    return { success: false, error: result.error.message };
  },
};

export type ApplyOperationsResult = 
    | { success: true; newFileStates: Map<string, string | null> }
    | { success: false; error: string };

const applyFileOperations = async (
    filePath: string,
    ops: (FileOperation & { type: 'write' | 'delete' })[],
    initialContent: string | null
): Promise<{ success: true, content: string | null } | { success: false, error: string }> => {
    let currentContent: string | null = initialContent;

    for (const op of ops) {
        if (op.type === 'delete') {
            if (currentContent === null) {
                return { success: false, error: `Cannot delete non-existent file: ${filePath}` };
            }
            currentContent = null;
            continue;
        }

        // It must be 'write'
        if (op.patchStrategy === 'replace') {
            currentContent = op.content;
        } else {
            const isNewFile = currentContent === null;
            if (isNewFile && op.patchStrategy === 'search-replace') {
                return { success: false, error: `Cannot use 'search-replace' on a new file: ${filePath}` };
            }

            try {
                const diffParams = {
                    originalContent: currentContent ?? '',
                    diffContent: op.content,
                };
                
                const patcher = patchStrategies[op.patchStrategy as keyof typeof patchStrategies];
                if (!patcher) {
                    return { success: false, error: `Unknown patch strategy: '${op.patchStrategy}'` };
                }
                
                const result = await patcher(diffParams);
                if (result.success) {
                    if (typeof result.content !== 'string') {
                        return { success: false, error: `Patch for ${filePath} succeeded but returned no content.` };
                    }
                    currentContent = result.content;
                } else {
                    return { success: false, error: `Patch failed for ${filePath}: ${result.error}` };
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return { success: false, error: `Error applying patch for ${filePath} with strategy '${op.patchStrategy}': ${message}` };
            }
        }
    }
    return { success: true, content: currentContent };
};

export const applyOperations = async (
    operations: FileOperation[],
    originalFiles: Map<string, string | null>
): Promise<ApplyOperationsResult> => {
    const fileStates = new Map<string, string | null>(originalFiles);

    // Step 1: Separate renames and handle them sequentially first.
    const renameOps = operations.filter((op): op is Extract<FileOperation, { type: 'rename' }> => op.type === 'rename');
    const otherOps = operations.filter((op): op is Extract<FileOperation, { type: 'write' | 'delete' }> => op.type !== 'rename');

    const pathMapping = new Map<string, string>(); // from -> to

    for (const op of renameOps) {
        const content = fileStates.get(op.from);
        if (content === undefined) {
            return { success: false, error: `Cannot rename non-existent or untracked file: ${op.from}` };
        }
        fileStates.set(op.from, null);
        fileStates.set(op.to, content);

        for (const [from, to] of pathMapping.entries()) {
            if (to === op.from) pathMapping.set(from, op.to);
        }
        pathMapping.set(op.from, op.to);
    }

    // Step 2: Remap paths in other operations based on the renames.
    const remappedOps = otherOps.map(op => {
        const newPath = pathMapping.get(op.path);
        return newPath ? { ...op, path: newPath } : op;
    });

    // Step 3: Group operations by file path.
    const opsByFile = new Map<string, (FileOperation & { type: 'write' | 'delete' })[]>();
    for (const op of remappedOps) {
        if (!opsByFile.has(op.path)) opsByFile.set(op.path, []);
        opsByFile.get(op.path)!.push(op);
    }

    // Step 4: Apply operations for each file in parallel.
    const promises: Promise<void>[] = [];
    let firstError: string | null = null;

    for (const [filePath, fileOps] of opsByFile.entries()) {
        promises.push((async () => {
            const initialContent = fileStates.get(filePath) ?? null;
            const result = await applyFileOperations(filePath, fileOps, initialContent);
            if (firstError) return;
            
            if (result.success) {
                fileStates.set(filePath, result.content);
            } else if (!firstError) {
                firstError = result.error;
            }
        })());
    }

    await Promise.all(promises);

    if (firstError) return { success: false, error: firstError };
    return { success: true, newFileStates: fileStates };
};

const calculateLcsLength = (a: string[], b: string[]): number => {
    let s1 = a;
    let s2 = b;
    if (s1.length < s2.length) {
        [s1, s2] = [s2, s1];
    }
    const m = s1.length;
    const n = s2.length;
    
    const dp = Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
        let prev = 0;
        for (let j = 1; j <= n; j++) {
            const temp = dp[j];
            if (s1[i - 1] === s2[j - 1]) {
                dp[j] = prev + 1;
            } else {
                dp[j] = Math.max(dp[j], dp[j - 1]);
            }
            prev = temp;
        }
    }
    return dp[n];
};

export const calculateLineChanges = (
    op: FileOperation,
    originalFiles: Map<string, string | null>,
    newFiles: Map<string, string | null>
): { added: number; removed: number; difference: number } => {
    if (op.type === 'rename') {
        return { added: 0, removed: 0, difference: 0 };
    }
    const oldContent = originalFiles.get(op.path) ?? null;

    if (op.type === 'delete') {
        const oldLines = oldContent ? oldContent.split('\n') : [];
        return { added: 0, removed: oldLines.length, difference: oldLines.length };
    }
    
    const newContent = newFiles.get(op.path) ?? null;

    if (oldContent === newContent) return { added: 0, removed: 0, difference: 0 };

    const oldLines = oldContent?.split('\n') ?? [];
    const newLines = newContent?.split('\n') ?? [];

    if (oldContent === null || oldContent === '') {
        return { added: newLines.length, removed: 0, difference: newLines.length };
    }
    if (newContent === null || newContent === '') {
        return { added: 0, removed: oldLines.length, difference: oldLines.length };
    }
    
    const lcsLength = calculateLcsLength(oldLines, newLines);
    const added = newLines.length - lcsLength;
    const removed = oldLines.length - lcsLength;
    return { added, removed, difference: added + removed };
};
`````

## File: tsconfig.json
`````json
{
  "include": [
    "src"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ],
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "esnext",
    "target": "esnext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    // for published env, start delete
    // "baseUrl": ".",
    // "paths": {
    //   "apply-multi-diff": ["../apply-multi-diff/dist/index.js"]
    // },
    // end delete
    "strict": true,
    "downlevelIteration": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    // Some stricter flags (disabled by default)
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitAny": true,
    "noPropertyAccessFromIndexSignature": false,
    "types": [
      "bun-types" // add Bun global
    ]
  }
}
`````

## File: src/types.ts
`````typescript
import { z } from 'zod';

export const LogLevelNameSchema = z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info');
export type LogLevelName = z.infer<typeof LogLevelNameSchema>;

// Schema for relaycode.config.json
const CoreConfigSchema = z.object({
  logLevel: LogLevelNameSchema,
  enableNotifications: z.boolean().default(true),
  watchConfig: z.boolean().default(true),
});

const WatcherConfigSchema = z.object({
  clipboardPollInterval: z.number().int().positive().default(2000),
  preferredStrategy: z.enum(['auto', 'replace', 'standard-diff', 'search-replace']).default('auto'),
  enableBulkProcessing: z.boolean().default(false),
  bulkSize: z.number().int().positive().default(5),
  bulkTimeout: z.number().int().positive().default(30000),
});

const PatchConfigSchema = z.object({
  approvalMode: z.enum(['auto', 'manual']).default('auto'),
  approvalOnErrorCount: z.number().int().min(0).default(0),
  linter: z.string().default('bun tsc --noEmit'),
  preCommand: z.string().default(''),
  postCommand: z.string().default(''),
  minFileChanges: z.number().int().min(0).default(0),
  maxFileChanges: z.number().int().min(1).optional(),
});

const GitConfigSchema = z.object({
  autoGitBranch: z.boolean().default(false),
  gitBranchPrefix: z.string().default('relay/'),
  gitBranchTemplate: z.enum(['uuid', 'gitCommitMsg']).default('gitCommitMsg'),
});

const BaseConfigSchema = z.object({
  projectId: z.string().min(1),
  core: CoreConfigSchema,
  watcher: WatcherConfigSchema,
  patch: PatchConfigSchema,
  git: GitConfigSchema,
});

export const ConfigSchema = BaseConfigSchema.deepPartial().extend({
  projectId: z.string().min(1),
}).transform(val => ({
  projectId: val.projectId,
  core: CoreConfigSchema.parse(val.core ?? {}),
  watcher: WatcherConfigSchema.parse(val.watcher ?? {}),
  patch: PatchConfigSchema.parse(val.patch ?? {}),
  git: GitConfigSchema.parse(val.git ?? {}),
}));
export type Config = z.infer<typeof ConfigSchema>;

export type RelayCodeConfigInput = z.input<typeof ConfigSchema>;
export const defineConfig = (config: RelayCodeConfigInput): RelayCodeConfigInput => config;

export const PatchStrategySchema = z.enum([
  'replace',
  'standard-diff',
  'search-replace',
]).default('replace');
export type PatchStrategy = z.infer<typeof PatchStrategySchema>;

export const FileSnapshotSchema = z.record(z.string(), z.string().nullable());
export type FileSnapshot = z.infer<typeof FileSnapshotSchema>;

// Schema for operations parsed from code blocks
export const FileOperationSchema = z.union([
  z.object({
    type: z.literal('write'),
    path: z.string(),
    content: z.string(),
    patchStrategy: PatchStrategySchema,
  }),
  z.object({
    type: z.literal('delete'),
    path: z.string(),
  }),
  z.object({
    type: z.literal('rename'),
    from: z.string(),
    to: z.string(),
  }),
]);
export type FileOperation = z.infer<typeof FileOperationSchema>;

// Schema for the state file (transaction record)
export const StateFileSchema = z.object({
  uuid: z.string().uuid(),
  projectId: z.string(),
  createdAt: z.string(), // ISO string
  approved: z.boolean(),
  linesAdded: z.number().optional(),
  linesRemoved: z.number().optional(),
  linesDifference: z.number().optional(),
  gitCommitMsg: z.union([z.string(), z.array(z.string())]).optional(),
  promptSummary: z.string().optional(),
  reasoning: z.array(z.string()),
  operations: z.array(FileOperationSchema),
  snapshot: FileSnapshotSchema,
});
export type StateFile = z.infer<typeof StateFileSchema>;

// Schema for the control YAML block at the end of the LLM response
export const ControlYamlSchema = z.object({
  projectId: z.string(),
  uuid: z.string().uuid(),
  changeSummary: z.array(z.record(z.string(), z.string())).optional(), // Not strictly used, but good to parse
  gitCommitMsg: z.union([z.string(), z.array(z.string())]).optional(),
  promptSummary: z.string().optional(),
});
export type ControlYaml = z.infer<typeof ControlYamlSchema>;

// Helper function to normalize gitCommitMsg to support both oneliner and multi-line formats
export const normalizeGitCommitMsg = (gitCommitMsg: string | string[] | undefined): string | undefined => {
  if (!gitCommitMsg) return undefined;
  if (Array.isArray(gitCommitMsg)) {
    // Join with newlines to preserve multiline structure
    return gitCommitMsg.join('\n');
  }
  return gitCommitMsg;
};

// Helper function to format gitCommitMsg for YAML output
export const formatGitCommitMsgForYaml = (gitCommitMsg: string | string[] | undefined): string | string[] | undefined => {
  if (!gitCommitMsg) return undefined;
  if (Array.isArray(gitCommitMsg)) {
    // If it's already an array, keep it as is for YAML formatting
    return gitCommitMsg;
  }
  // If it's a string with newlines, convert to array for proper YAML formatting
  if (gitCommitMsg.includes('\n')) {
    return gitCommitMsg.split('\n').filter(line => line.trim());
  }
  // Single line, return as string
  return gitCommitMsg;
};

// The fully parsed response from the clipboard
export const ParsedLLMResponseSchema = z.object({
  control: ControlYamlSchema,
  operations: z.array(FileOperationSchema),
  reasoning: z.array(z.string()),
});
export type ParsedLLMResponse = z.infer<typeof ParsedLLMResponseSchema>;
`````

## File: package.json
`````json
{
  "name": "relaycode-core",
  "version": "0.1.3",
  "description": "The shared engine behind RelayCode and Noca.pro – a zero-friction, AI-native patch engine that turns your clipboard into a surgical code-editing laser.",
  "author": "Noca.pro",
  "license": "MIT",
  "homepage": "https://github.com/nocapro/relaycode-core",
  "repository": {
    "type": "git",
    "url": "https://github.com/nocapro/relaycode-core.git"
  },
  "keywords": [
    "ai",
    "llm",
    "patch",
    "diff",
    "codemod",
    "automation",
    "typescript"
  ],
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "apply-multi-diff": "0.1.4",
    "js-yaml": "^4.1.0",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/js-yaml": "^4.0.9",
    "tsup": "^8.2.3",
    "typescript": "^5.8.3"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
`````
