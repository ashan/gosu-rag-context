import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';
import type * as z from 'zod';

/**
 * Convert a Zod schema to Anthropic tool format
 */
export function toAnthropicToolSpec(
    name: string,
    description: string,
    parameters: z.ZodType<any>
): object {
    return {
        name,
        description,
        // @ts-ignore - zod-to-json-schema type inference limitation
        input_schema: zodToJsonSchema(parameters),
    };
}

/**
 * Convert multiple Zod schemas to Anthropic tools
 */
export function zodSchemasToAnthropicTools(
    tools: Array<{ name: string; description: string; parameters: ZodSchema }>
): object[] {
    return tools.map(tool =>
        toAnthropicToolSpec(tool.name, tool.description, tool.parameters)
    );
}
