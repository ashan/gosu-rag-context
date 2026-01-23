import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Provider types supported by the system
 */
export const ProviderSchema = z.enum(['openai', 'anthropic', 'azure_openai', 'google']);
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Tool format types for different LLM providers
 */
export const ToolFormatSchema = z.enum(['openai', 'anthropic']);
export type ToolFormat = z.infer<typeof ToolFormatSchema>;

/**
 * Embedding provider types
 */
export const EmbeddingProviderSchema = z.enum(['openai', 'google']);
export type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>;

/**
 * Log level types
 */
export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'trace']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Guidewire source configuration for multi-module support
 * Each entry represents a Guidewire module (policycenter, billingcenter, etc.)
 */
export const GuidewireSourceSchema = z.object({
    module: z.string().min(1).describe('Module identifier (e.g., policycenter, billingcenter)'),
    codePath: z.string().min(1).describe('Path to Gosu source code for this module'),
    docsPath: z.string().optional().describe('Optional path to PDF documentation for this module'),
});

export type GuidewireSource = z.infer<typeof GuidewireSourceSchema>;

/**
 * Complete configuration schema with validation
 */
const ConfigSchema = z.object({
    // LLM Provider
    provider: ProviderSchema.default('openai'),
    model: z.string().min(1, 'MODEL is required'),
    toolFormat: ToolFormatSchema.default('openai'),

    // API Keys
    openaiApiKey: z.string().optional(),
    anthropicApiKey: z.string().optional(),
    azureOpenAIApiKey: z.string().optional(),
    azureOpenAIEndpoint: z.string().url().optional(),
    azureOpenAIDeployment: z.string().optional(),
    googleApiKey: z.string().optional(),

    // Embedding Configuration
    embeddingProvider: EmbeddingProviderSchema.default('openai'),
    embeddingModel: z.string().optional(),
    embeddingApiKey: z.string().optional(),

    // Vector Store
    vectorStore: z.literal('chroma').default('chroma'),
    chromaHost: z.string().default('localhost'),
    chromaPort: z.coerce.number().int().positive().default(8000),
    chromaCollections: z.string().transform(val => val.split(',').map(s => s.trim())).default('guidewire-code'),
    chromaTenant: z.string().optional(),
    chromaDatabase: z.string().optional(),

    // Guidewire Source Configuration (Multi-Module)
    guidewireSources: z.preprocess(
        (val) => {
            if (!val || val === '') return [];
            try {
                return JSON.parse(val as string);
            } catch {
                return [];
            }
        },
        z.array(GuidewireSourceSchema).default([])
    ),

    // Legacy single-path configs (backwards compatible)
    codeSourcePath: z.string().optional(),
    docsSourcePath: z.string().optional(),
    sourceRootPath: z.string().optional(), // Deprecated: use guidewireSources

    // Runtime
    maxTurns: z.coerce.number().int().positive().default(10),
    topK: z.coerce.number().int().positive().default(6),
    logLevel: LogLevelSchema.default('info'),

    // Prompts
    agentSystemPromptPath: z.string(),
    promptPlannerSystemPath: z.string(),
    promptStepSystemPath: z.string(),
    promptStepDeveloperPath: z.string(),
    promptEvaluatorSystemPath: z.string(),
    promptFinalizerSystemPath: z.string(),

    // Memory
    memoryEnabled: z.preprocess(
        val => val === 'true' || val === true,
        z.boolean().default(true)
    ),
    historyContextSize: z.coerce.number().int().positive().default(6),
    historyRetentionSize: z.coerce.number().int().positive().default(50),

    // Memory - Advanced (Summarization & Caching)
    memorySummarizationEnabled: z.preprocess(
        val => val === 'true' || val === true,
        z.boolean().default(true)
    ),
    memoryMaxTokens: z.coerce.number().int().positive().default(2000),
    memoryCacheThreshold: z.coerce.number().min(0).max(1).default(0.85),
});

export type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
    if (cachedConfig) {
        return cachedConfig;
    }

    try {
        const rawConfig = {
            // Provider
            provider: process.env.PROVIDER,
            model: process.env.MODEL,
            toolFormat: process.env.TOOL_FORMAT,

            // API Keys
            openaiApiKey: process.env.OPENAI_API_KEY,
            anthropicApiKey: process.env.ANTHROPIC_API_KEY,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
            azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT,
            googleApiKey: process.env.GOOGLE_API_KEY,

            // Embedding Configuration
            embeddingProvider: process.env.EMBEDDING_PROVIDER,
            embeddingModel: process.env.EMBEDDING_MODEL,
            embeddingApiKey: process.env.EMBEDDING_API_KEY,

            // Vector Store
            vectorStore: process.env.VECTOR_STORE,
            chromaHost: process.env.CHROMA_HOST,
            chromaPort: process.env.CHROMA_PORT,
            chromaCollections: process.env.CHROMA_COLLECTIONS,
            chromaTenant: process.env.CHROMA_TENANT,
            chromaDatabase: process.env.CHROMA_DATABASE,

            // Guidewire Sources (Multi-Module)
            guidewireSources: process.env.GUIDEWIRE_SOURCES,

            // Legacy single-path configs (backwards compatible)
            codeSourcePath: process.env.CODE_SOURCE_PATH,
            docsSourcePath: process.env.DOCS_SOURCE_PATH,
            sourceRootPath: process.env.SOURCE_ROOT_PATH,

            // Runtime
            maxTurns: process.env.MAX_TURNS,
            topK: process.env.TOP_K,
            logLevel: process.env.LOG_LEVEL,

            // Prompts
            agentSystemPromptPath: process.env.AGENT_SYSTEM_PROMPT_PATH,
            promptPlannerSystemPath: process.env.PROMPT_PLANNER_SYSTEM_PATH,
            promptStepSystemPath: process.env.PROMPT_STEP_SYSTEM_PATH,
            promptStepDeveloperPath: process.env.PROMPT_STEP_DEVELOPER_PATH,
            promptEvaluatorSystemPath: process.env.PROMPT_EVALUATOR_SYSTEM_PATH,
            promptFinalizerSystemPath: process.env.PROMPT_FINALIZER_SYSTEM_PATH,

            // Memory
            memoryEnabled: process.env.MEMORY_ENABLED,
            historyContextSize: process.env.HISTORY_CONTEXT_SIZE,
            historyRetentionSize: process.env.HISTORY_RETENTION_SIZE,

            // Memory - Advanced
            memorySummarizationEnabled: process.env.MEMORY_SUMMARIZATION_ENABLED,
            memoryMaxTokens: process.env.MEMORY_MAX_TOKENS,
            memoryCacheThreshold: process.env.MEMORY_CACHE_THRESHOLD,
        };

        cachedConfig = ConfigSchema.parse(rawConfig);

        // Validate provider-specific requirements
        validateProviderConfig(cachedConfig);

        return cachedConfig;
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
            throw new Error(`Configuration validation failed:\n${messages}\n\nPlease check your .env file.`);
        }
        throw error;
    }
}

/**
 * Validate provider-specific configuration requirements
 */
function validateProviderConfig(config: Config): void {
    switch (config.provider) {
        case 'openai':
            if (!config.openaiApiKey) {
                throw new Error('OPENAI_API_KEY is required when PROVIDER=openai');
            }
            break;

        case 'anthropic':
            if (!config.anthropicApiKey) {
                throw new Error('ANTHROPIC_API_KEY is required when PROVIDER=anthropic');
            }
            break;

        case 'azure_openai':
            if (!config.azureOpenAIApiKey || !config.azureOpenAIEndpoint) {
                throw new Error('AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT are required when PROVIDER=azure_openai');
            }
            break;

        case 'google':
            if (!config.googleApiKey) {
                throw new Error('GOOGLE_API_KEY is required when PROVIDER=google');
            }
            break;
    }

    // Validate embedding provider API key
    validateEmbeddingConfig(config);
}

/**
 * Validate embedding provider configuration
 */
function validateEmbeddingConfig(config: Config): void {
    const embeddingApiKey = config.embeddingApiKey;
    switch (config.embeddingProvider) {
        case 'openai':
            if (!embeddingApiKey && !config.openaiApiKey) {
                throw new Error('EMBEDDING_API_KEY or OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
            }
            break;
        case 'google':
            if (!embeddingApiKey && !config.googleApiKey) {
                throw new Error('EMBEDDING_API_KEY or GOOGLE_API_KEY is required when EMBEDDING_PROVIDER=google');
            }
            break;
    }
}

/**
 * Get the Chroma server URL
 */
export function getChromaUrl(config: Config): string {
    return `http://${config.chromaHost}:${config.chromaPort}`;
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
    cachedConfig = null;
}

/**
 * Get unified list of Guidewire sources
 * Returns guidewireSources if configured, otherwise falls back to legacy single-path configs
 */
export function getGuidewireSources(): GuidewireSource[] {
    const config = loadConfig();

    // If guidewireSources is configured, use it
    if (config.guidewireSources && config.guidewireSources.length > 0) {
        return config.guidewireSources;
    }

    // Fallback to legacy single-path configs
    const sources: GuidewireSource[] = [];

    if (config.codeSourcePath) {
        // Derive module name from folder name
        const pathParts = config.codeSourcePath.split('/').filter(Boolean);
        const module = pathParts[pathParts.length - 1]?.toLowerCase() || 'default';
        sources.push({
            module,
            codePath: config.codeSourcePath,
            docsPath: config.docsSourcePath,
        });
    } else if (config.sourceRootPath) {
        // Fallback to deprecated sourceRootPath
        const pathParts = config.sourceRootPath.split('/').filter(Boolean);
        const module = pathParts[pathParts.length - 1]?.toLowerCase() || 'default';
        sources.push({
            module,
            codePath: config.sourceRootPath,
        });
    }

    return sources;
}

/**
 * Find a source path by module name
 */
export function getSourceByModule(moduleName: string): GuidewireSource | undefined {
    const sources = getGuidewireSources();
    return sources.find(s => s.module.toLowerCase() === moduleName.toLowerCase());
}

/**
 * Get all source code paths (for searching across all modules)
 */
export function getAllCodePaths(): { module: string; path: string }[] {
    return getGuidewireSources().map(s => ({
        module: s.module,
        path: s.codePath,
    }));
}
