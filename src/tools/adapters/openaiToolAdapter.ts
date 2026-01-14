import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';

/**
 * Convert a Zod schema to OpenAI function tool format
 */
export function zodToOpenAITool(
    name: string,
    description: string,
    parameters: ZodSchema
): object {
    return {
        type: 'function',
        function: {
            name,
            description,
            parameters: zodToJsonSchema(parameters),
        },
    };
}

/**
 * Convert multiple Zod schemas to OpenAI function tools
 */
export function zodSchemasToOpenAITools(
    tools: Array<{ name: string; description: string; parameters: ZodSchema }>
): object[] {
    return tools.map(tool =>
        zodToOpenAITool(tool.name, tool.description, tool.parameters)
    );
}
