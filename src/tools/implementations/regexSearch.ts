import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const RegexSearchParamsSchema = z.object({
    pattern: z.string().min(1).describe('Regular expression pattern to search for'),
    filePaths: z.array(z.string()).optional().describe('Optional file path filters'),
});

type RegexSearchParams = z.infer<typeof RegexSearchParamsSchema>;

interface RegexSearchResult {
    results: Array<{
        filePath: string;
        lineStart: number;
        lineEnd: number;
        chunkType: string;
        matchingCode: string;
        collection?: string;
    }>;
    totalResults: number;
    pattern: string;
}

/**
 * Tool for searching code using regex patterns
 */
export class RegexSearchTool extends BaseTool<RegexSearchParams, RegexSearchResult> {
    readonly name = 'regex_search';
    readonly description =
        'Find code matching a regular expression pattern. ' +
        'Use this to find patterns, API usage, or specific code constructs. ' +
        'Remember to escape special regex characters properly (e.g., \\. for literal dot). ' +
        'Returns code chunks matching the pattern with file paths and line numbers.';
    readonly parameters = RegexSearchParamsSchema;

    async execute(args: RegexSearchParams, ctx: ToolContext): Promise<RegexSearchResult> {
        // Validate regex pattern
        try {
            new RegExp(args.pattern);
        } catch (error) {
            throw new Error(`Invalid regex pattern: ${args.pattern}. Error: ${error}`);
        }

        const hits = await ctx.vectorStore.regexSearch(args.pattern, args.filePaths);

        return {
            results: hits.map(hit => {
                const result: any = {
                    filePath: hit.metadata.relativePath,
                    lineStart: hit.metadata.lineStart,
                    lineEnd: hit.metadata.lineEnd,
                    chunkType: hit.metadata.chunkType as string,
                    matchingCode: hit.text,
                };
                if (hit.collectionName) result.collection = hit.collectionName;
                return result;
            }),
            totalResults: hits.length,
            pattern: args.pattern,
        };
    }

    toToolSpec(format: 'openai' | 'anthropic'): object {
        if (format === 'openai') {
            return {
                type: 'function',
                function: {
                    name: this.name,
                    description: this.description,
                    // @ts-expect-error - zod-to-json-schema type limitation
                    parameters: zodToJsonSchema(this.parameters) as any,
                },
            };
        } else {
            // Anthropic format
            return {
                name: this.name,
                description: this.description,
                // @ts-expect-error - zod-to-json-schema type limitation
                input_schema: zodToJsonSchema(this.parameters) as any,
            };
        }
    }
}
