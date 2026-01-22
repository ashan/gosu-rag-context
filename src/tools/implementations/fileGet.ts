import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { loadConfig } from '../../config/env.js';

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
        try {
            // Try vector store first (for ingested code)
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
        } catch (error: any) {
            // Fallback: Try reading from filesystem if vector store fails
            if (error.message && (error.message.includes('File not found') || error.message.includes('not found in vector store'))) {
                return this.tryReadFromSource(args.filePath);
            }
            throw error;
        }
    }

    private tryReadFromSource(relativePath: string): GetFileResult {
        const config = loadConfig();
        const sourceRoot = config.sourceRootPath;

        if (!sourceRoot) {
            throw new Error(`File not found in vector store, and SOURCE_ROOT_PATH not set to check filesystem: ${relativePath}`);
        }

        const fullPath = path.join(sourceRoot, relativePath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found in vector store or filesystem: ${relativePath}`);
        }

        // Basic security check
        const resolvedPath = path.resolve(fullPath);
        const resolvedRoot = path.resolve(sourceRoot);
        if (!resolvedPath.startsWith(resolvedRoot)) {
            throw new Error(`Path traversal detected: ${relativePath}`);
        }

        const stats = fs.statSync(fullPath);
        if (stats.size > 1024 * 1024) { // 1MB limit
            throw new Error(`File too large for fallback reading: ${relativePath}`);
        }

        const contents = fs.readFileSync(fullPath, 'utf-8');
        return {
            filePath: relativePath,
            contents,
            lineCount: contents.split('\n').length,
            language: path.extname(relativePath).slice(1) // simple extension fallback
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
