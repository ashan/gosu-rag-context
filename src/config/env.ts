import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Provider types supported by the system
 */
export const ProviderSchema = z.enum(['openai', 'anthropic', 'azure_openai']);
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Tool format types for different LLM providers
 */
export const ToolFormatSchema = z.enum(['openai', 'anthropic']);
export type ToolFormat = z.infer<typeof ToolFormatSchema>;

/**
 * Log level types
 */
export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'trace']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

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

    // Vector Store
    vectorStore: z.literal('chroma').default('chroma'),
    chromaHost: z.string().default('localhost'),
    chromaPort: z.coerce.number().int().positive().default(8000),
    chromaCollections: z.string().transform(val => val.split(',').map(s => s.trim())).default('guidewire-code'),
    chromaTenant: z.string().optional(),
    chromaDatabase: z.string().optional(),

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

            // Vector Store
            vectorStore: process.env.VECTOR_STORE,
            chromaHost: process.env.CHROMA_HOST,
            chromaPort: process.env.CHROMA_PORT,
            chromaCollections: process.env.CHROMA_COLLECTIONS,
            chromaTenant: process.env.CHROMA_TENANT,
            chromaDatabase: process.env.CHROMA_DATABASE,

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
