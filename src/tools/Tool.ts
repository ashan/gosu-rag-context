import { z, ZodSchema } from 'zod';
import type { VectorStoreAdapter } from '../vectorstores/VectorStoreAdapter.js';

/**
 * Context passed to tool execute functions
 */
export interface ToolContext {
    /** Vector store adapter for querying code */
    vectorStore: VectorStoreAdapter;

    /** Additional context can be added here as needed */
    [key: string]: any;
}

/**
 * Generic tool interface
 * @template TParams Parameter type (inferred from Zod schema)
 * @template TResult Result type
 */
export interface Tool<TParams = any, TResult = any> {
    /** Unique tool name */
    name: string;

    /** Human-readable tool description */
    description: string;

    /** Zod schema for parameter validation */
    parameters: ZodSchema<TParams>;

    /**
     * Parse and validate raw parameters
     * @param raw Raw parameter object from LLM
     * @returns Validated parameters
     * @throws Error if validation fails
     */
    parse(raw: unknown): TParams;

    /**
     * Execute the tool with validated parameters
     * @param args Validated parameters
     * @param ctx Execution context (vector store, etc.)
     * @returns Tool execution result
     */
    execute(args: TParams, ctx: ToolContext): Promise<TResult>;

    /**
     * Convert tool definition to LLM-specific format
     * @param format Target format ('openai' or 'anthropic')
     * @returns Tool specification object
     */
    toToolSpec(format: 'openai' | 'anthropic'): object;
}

/**
 * Abstract base class for tool implementations
 */
export abstract class BaseTool<TParams = any, TResult = any> implements Tool<TParams, TResult> {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly parameters: ZodSchema<TParams>;

    parse(raw: unknown): TParams {
        try {
            return this.parameters.parse(raw);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
                throw new Error(`Tool parameter validation failed for ${this.name}: ${messages}`);
            }
            throw error;
        }
    }

    abstract execute(args: TParams, ctx: ToolContext): Promise<TResult>;

    abstract toToolSpec(format: 'openai' | 'anthropic'): object;
}
