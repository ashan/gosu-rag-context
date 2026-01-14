import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const SymbolSearchParamsSchema = z.object({
    query: z.string().min(1).describe('Symbol, class, or function name to search for'),
    filePaths: z.array(z.string()).optional().describe('Optional file path filters'),
});

type SymbolSearchParams = z.infer<typeof SymbolSearchParamsSchema>;

interface SymbolSearchResult {
    results: Array<{
        filePath: string;
        lineStart: number;
        lineEnd: number;
        chunkType: string;
        className?: string;
        methodName?: string;
        code: string;
        collection?: string;
    }>;
    totalResults: number;
}

/**
 * Tool for searching code by symbol name, class name, or function name
 */
export class SymbolSearchTool extends BaseTool<SymbolSearchParams, SymbolSearchResult> {
    readonly name = 'symbol_search';
    readonly description =
        'Find code by symbol name, class name, function name, or identifier. ' +
        'Use this when you know or can guess the name of a class, method, property, or symbol. ' +
        'Returns code chunks matching the symbol with file paths and line numbers.';
    readonly parameters = SymbolSearchParamsSchema;

    async execute(args: SymbolSearchParams, ctx: ToolContext): Promise<SymbolSearchResult> {
        const hits = await ctx.vectorStore.searchBySymbolName(args.query, args.filePaths);

        return {
            results: hits.map(hit => {
                const result: any = {
                    filePath: hit.metadata.relativePath,
                    lineStart: hit.metadata.lineStart,
                    lineEnd: hit.metadata.lineEnd,
                    chunkType: hit.metadata.chunkType as string,
                    code: hit.text,
                };
                if (hit.metadata.className) result.className = hit.metadata.className;
                if (hit.metadata.methodName) result.methodName = hit.metadata.methodName;
                if (hit.collectionName) result.collection = hit.collectionName;
                return result;
            }),
            totalResults: hits.length,
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
                    parameters: zodToJsonSchema(this.parameters),
                },
            };
        } else {
            // Anthropic format
            return {
                name: this.name,
                description: this.description,
                // @ts-expect-error - zod-to-json-schema type limitation
                input_schema: zodToJsonSchema(this.parameters),
            };
        }
    }
}
