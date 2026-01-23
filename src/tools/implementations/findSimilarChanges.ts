import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import type { QueryFilter } from '../../vectorstores/VectorStoreAdapter.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const FindSimilarChangesParamsSchema = z.object({
    changeDescription: z.string().min(1).describe(
        'Natural language description of the change pattern to find (e.g., "add validation method", "configure new coverage type")'
    ),
    module: z.string().optional().describe(
        'Filter to specific Guidewire module (e.g., "policycenter", "billingcenter")'
    ),
    chunkType: z.enum(['function', 'method', 'class', 'property']).optional().describe(
        'Filter by code structure type'
    ),
    topK: z.number().int().positive().max(20).optional().describe(
        'Number of similar patterns to return (default: 5, max: 20)'
    ),
});

type FindSimilarChangesParams = z.infer<typeof FindSimilarChangesParamsSchema>;

interface SimilarPattern {
    /** File path relative to module root */
    filePath: string;
    /** Guidewire module the file belongs to */
    module: string;
    /** Starting line of the pattern */
    lineStart: number;
    /** Ending line of the pattern */
    lineEnd: number;
    /** Type of code chunk */
    chunkType: string;
    /** Class name if applicable */
    className?: string;
    /** Method/function name if applicable */
    methodName?: string;
    /** The actual code pattern */
    code: string;
    /** Similarity score (0-1, higher is more similar) */
    similarityScore: number;
    /** Brief explanation of why this is relevant */
    relevance?: string;
}

interface FindSimilarChangesResult {
    /** Similar patterns found */
    patterns: SimilarPattern[];
    /** Total patterns found */
    totalFound: number;
    /** The search query used */
    searchQuery: string;
    /** Tip for using these patterns */
    usageTip: string;
}

/**
 * Tool for finding similar code patterns in the codebase.
 * Useful for discovering how similar changes have been implemented before,
 * ensuring consistency with existing patterns.
 */
export class FindSimilarChangesTool extends BaseTool<FindSimilarChangesParams, FindSimilarChangesResult> {
    readonly name = 'find_similar_changes';
    readonly description =
        'Find similar code patterns in the Guidewire codebase. ' +
        'Use this BEFORE making changes to discover how similar modifications have been done. ' +
        'Helps ensure consistency with existing patterns and idioms. ' +
        'Returns top-K most similar code chunks with file locations.';
    readonly parameters = FindSimilarChangesParamsSchema;

    async execute(args: FindSimilarChangesParams, ctx: ToolContext): Promise<FindSimilarChangesResult> {
        const topK = args.topK || 5;

        // Build filter from optional parameters
        let filter: QueryFilter | undefined = undefined;
        const tempFilter: Partial<QueryFilter> = {};

        if (args.module) {
            tempFilter.module = args.module;
        }
        if (args.chunkType) {
            tempFilter.chunkType = args.chunkType as any;
        }

        if (Object.keys(tempFilter).length > 0) {
            filter = tempFilter as QueryFilter;
        }

        // Perform semantic search for similar patterns
        const hits = await ctx.vectorStore.semanticSearch(
            args.changeDescription,
            topK,
            filter
        );

        const patterns: SimilarPattern[] = hits.map(hit => {
            const pattern: SimilarPattern = {
                filePath: hit.metadata.relativePath,
                module: hit.metadata.module || 'unknown',
                lineStart: hit.metadata.lineStart,
                lineEnd: hit.metadata.lineEnd,
                chunkType: hit.metadata.chunkType as string,
                code: hit.text,
                similarityScore: hit.score || 0,
            };

            if (hit.metadata.className) {
                pattern.className = hit.metadata.className;
            }
            if (hit.metadata.methodName) {
                pattern.methodName = hit.metadata.methodName;
            }

            return pattern;
        });

        // Generate usage tip based on results
        let usageTip = 'No similar patterns found. ';
        if (patterns.length > 0) {
            const topPattern = patterns[0];
            usageTip = `Found ${patterns.length} similar pattern(s). ` +
                `Study the top match in ${topPattern.filePath} (lines ${topPattern.lineStart}-${topPattern.lineEnd}) ` +
                `to understand the existing approach before implementing your change.`;
        } else {
            usageTip += 'This may be a novel pattern - proceed carefully and consider consulting documentation.';
        }

        return {
            patterns,
            totalFound: patterns.length,
            searchQuery: args.changeDescription,
            usageTip,
        };
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
