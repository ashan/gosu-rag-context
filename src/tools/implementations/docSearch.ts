import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const DocSearchParamsSchema = z.object({
    query: z.string().min(1).describe('Natural language question about Guidewire functionality, configuration, or API'),
    topK: z.number().int().positive().optional().describe('Number of results (default: 5)'),
    category: z.string().optional().describe('Filter by category (e.g. "Cloud API", "Configuration", "Gosu Language")'),
});

type DocSearchParams = z.infer<typeof DocSearchParamsSchema>;

export class GuidewireDocsTool extends BaseTool<DocSearchParams, any> {
    readonly name = 'guidewire_docs_search';
    readonly description = 'Search official Guidewire PDF documentation. Use this for questions about configuration, standard features, APIs, and best practices.';
    readonly parameters = DocSearchParamsSchema;

    async execute(args: DocSearchParams, ctx: ToolContext): Promise<any> {
        // Enforce searching only the 'docs' collection
        const results = await ctx.vectorStore.semanticSearch(
            args.query,
            args.topK || 5,
            {
                collectionName: 'docs',
                ...(args.category && { category: args.category }) // Pass category filter if provided
            }
        );

        return {
            results: results.map(hit => ({
                source: hit.metadata.source, // Filename
                page: hit.metadata.page,
                category: hit.metadata.category,
                content: hit.text,
                score: hit.score
            })),
            total: results.length
        };
    }

    toToolSpec(format: 'openai' | 'anthropic'): object {
        if (format === 'openai') {
            return {
                type: 'function',
                function: {
                    name: this.name,
                    description: this.description,
                    // @ts-ignore
                    parameters: zodToJsonSchema(this.parameters),
                },
            };
        } else {
            return {
                name: this.name,
                description: this.description,
                // @ts-ignore
                input_schema: zodToJsonSchema(this.parameters),
            };
        }
    }
}
