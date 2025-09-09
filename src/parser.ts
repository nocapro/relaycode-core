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
