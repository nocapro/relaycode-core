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