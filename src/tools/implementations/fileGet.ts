import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const GetFileParamsSchema = z.object({
    filePath: z.string().min(1).describe('Relative file path from source root'),
});

type GetFileParams = z.infer<typeof GetFileParamsSchema>;

interface GetFileResult {
    filePath: string;
    contents: string;
    lineCount: number;
    language?: string;
    package?: string;
}

/**
 * Tool for retrieving complete file contents
 */
export class GetFileTool extends BaseTool<GetFileParams, GetFileResult> {
    readonly name = 'get_file';
    readonly description =
        'Retrieve the complete contents of a specific file. ' +
        'Use this when you have a file path from another tool and need full context. ' +
        'Returns the entire file contents aggregated from chunks.';
    readonly parameters = GetFileParamsSchema;

    async execute(args: GetFileParams, ctx: ToolContext): Promise<GetFileResult> {
        const fileResult = await ctx.vectorStore.getFileByPath(args.filePath);

        const lineCount = fileResult.contents.split('\n').length;

        const result: any = {
            filePath: fileResult.filePath,
            contents: fileResult.contents,
            lineCount,
        };
        if (fileResult.metadata?.language) result.language = fileResult.metadata.language;
        if (fileResult.metadata?.package) result.package = fileResult.metadata.package;
        return result;
    }

    toToolSpec(format: 'openai' | 'anthropic'): object {
        if (format === 'openai') {
            return {
                type: 'function',
                function: {
                    name: this.name,
                    description: this.description,
                    // @ts-ignore - zod-to-json-schema type limitation
                    parameters: zodToJsonSchema(this.parameters) as any,
                },
            };
        } else {
            // Anthropic format
            return {
                name: this.name,
                description: this.description,
                // @ts-ignore - zod-to-json-schema type limitation
                input_schema: zodToJsonSchema(this.parameters) as any,
            };
        }
    }
}
