import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import type { QueryFilter } from '../../vectorstores/VectorStoreAdapter.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const SemanticSearchParamsSchema = z.object({
    query: z.string().min(1).describe('Natural language description of what to find'),
    topK: z.number().int().positive().optional().describe('Number of results to return (default from config)'),
    filter: z.object({
        chunkType: z.string().optional().describe('Filter by chunk type (e.g., "function", "class")'),
        language: z.enum(['gosu', 'gosu_template']).optional().describe('Filter by language'),
        package: z.string().optional().describe('Filter by package name'),
        className: z.string().optional().describe('Filter by class name'),
        relativePath: z.string().optional().describe('Filter by file path (partial match)'),
    }).optional().describe('Optional metadata filters'),
});

type SemanticSearchParams = z.infer<typeof SemanticSearchParamsSchema>;

interface SemanticSearchResult {
    results: Array<{
        filePath: string;
        lineStart: number;
        lineEnd: number;
        chunkType: string;
        className?: string;
        methodName?: string;
        code: string;
        score: number;
        collection?: string;
    }>;
    totalResults: number;
    query: string;
}

/**
 * Tool for semantic search using AI embeddings
 */
export class SemanticSearchTool extends BaseTool<SemanticSearchParams, SemanticSearchResult> {
    readonly name = 'semantic_search';
    readonly description =
        'Find semantically similar code using AI embeddings. ' +
        'Use this when you don\'t know exact names but have a conceptual description. ' +
        'Returns top-K most semantically similar code chunks ranked by relevance. ' +
        'Supports optional metadata filters to narrow down results.';
    readonly parameters = SemanticSearchParamsSchema;

    async execute(args: SemanticSearchParams, ctx: ToolContext): Promise<SemanticSearchResult> {
        let filter: QueryFilter | undefined = undefined;
        if (args.filter) {
            const tempFilter: Partial<QueryFilter> = {};
            if (args.filter.chunkType) tempFilter.chunkType = args.filter.chunkType as any;
            if (args.filter.language) tempFilter.language = args.filter.language;
            if (args.filter.package) tempFilter.package = args.filter.package;
            if (args.filter.className) tempFilter.className = args.filter.className;
            if (args.filter.relativePath) tempFilter.relativePath = args.filter.relativePath;

            // Only set filter if at least one property was actually added
            if (Object.keys(tempFilter).length > 0) {
                filter = tempFilter as QueryFilter;
            }
        }

        const hits = await ctx.vectorStore.semanticSearch(
            args.query,
            args.topK,
            filter
        );

        return {
            results: hits.map(hit => {
                const result: any = {
                    filePath: hit.metadata.relativePath,
                    lineStart: hit.metadata.lineStart,
                    lineEnd: hit.metadata.lineEnd,
                    chunkType: hit.metadata.chunkType as string,
                    code: hit.text,
                    score: hit.score || 0,
                };
                if (hit.metadata.className) result.className = hit.metadata.className;
                if (hit.metadata.methodName) result.methodName = hit.metadata.methodName;
                if (hit.collectionName) result.collection = hit.collectionName;
                return result;
            }),
            totalResults: hits.length,
            query: args.query,
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
