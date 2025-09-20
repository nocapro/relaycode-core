import type { FileOperation } from './types';
import { applyStandardDiff, applySearchReplace, type ApplyDiffResult } from 'apply-multi-diff';
import path from 'path';
import { logger } from './logger';

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

const findBestFileMatch = (targetPath: string, availablePaths: string[]): string | null => {
    const targetFileName = path.basename(targetPath);
    if (!targetFileName) return null;

    const candidates = availablePaths.filter(p => path.basename(p) === targetFileName);

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0] ?? null;

    const normalize = (p: string) => p.replace(/\\/g, '/');
    const targetSegments = normalize(targetPath).split('/').reverse();

    let bestCandidate: string | null = null;
    let highestScore = -1;

    for (const candidate of candidates) {
        const candidateSegments = normalize(candidate).split('/').reverse();
        let score = 0;
        const len = Math.min(targetSegments.length, candidateSegments.length);
        for (let i = 0; i < len; i++) {
            if (targetSegments[i] === candidateSegments[i]) {
                score++;
            } else {
                break;
            }
        }

        if (score > highestScore) {
            highestScore = score;
            bestCandidate = candidate;
        } else if (score === highestScore) {
            bestCandidate = null; // Ambiguous match
        }
    }
    return bestCandidate;
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
    let remappedOps = otherOps.map(op => {
        const newPath = pathMapping.get(op.path);
        return newPath ? { ...op, path: newPath } : op;
    });

    // Step 2.5: Fuzzy find missing paths for patch/delete operations.
    const availablePaths = Array.from(fileStates.keys()).filter((p): p is string => p !== null);
    remappedOps = remappedOps.map(op => {
        const fileExists = fileStates.has(op.path);
        
        // A 'replace' operation on a new file is a file creation, not a mistake to be corrected.
        const isPatchOrDelete = (op.type === 'write' && op.patchStrategy !== 'replace') || op.type === 'delete';
        
        if (!fileExists && isPatchOrDelete) {
            const bestMatch = findBestFileMatch(op.path, availablePaths);
            if (bestMatch) {
                logger.debug(`[patch] Fuzzy-matched '${op.path}' to '${bestMatch}'`);
                return { ...op, path: bestMatch };
            } else {
                 logger.debug(`[patch] Could not find a match for non-existent file: '${op.path}'`);
            }
        }
        return op;
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