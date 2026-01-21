import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { loadConfig } from '../../config/env.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ReadSourceFileParamsSchema = z.object({
    path: z.string().min(1).describe('Relative path from source root (e.g., "config/messaging-config.xml")'),
});

type ReadSourceFileParams = z.infer<typeof ReadSourceFileParamsSchema>;

interface ReadSourceFileResult {
    path: string;
    content: string;
    size: number;
    error?: string;
}

/**
 * Tool for reading files from the source codebase
 */
export class ReadSourceFileTool extends BaseTool<ReadSourceFileParams, ReadSourceFileResult> {
    readonly name = 'read_source_file';
    readonly description =
        'Read the contents of a file from the Guidewire source codebase by relative path. ' +
        'Use this to read configuration files (XML, XSD, YAML, properties, etc.) that are not in the vector store. ' +
        'The path must be relative to the SOURCE_ROOT_PATH.';
    readonly parameters = ReadSourceFileParamsSchema;

    async execute(args: ReadSourceFileParams, _ctx: ToolContext): Promise<ReadSourceFileResult> {
        const config = loadConfig();
        const sourceRoot = config.sourceRootPath;

        if (!sourceRoot) {
            return {
                path: args.path,
                content: '',
                size: 0,
                error: 'SOURCE_ROOT_PATH is not configured in .env',
            };
        }

        // Security: Prevent path traversal attacks
        const normalizedPath = path.normalize(args.path);
        if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
            return {
                path: args.path,
                content: '',
                size: 0,
                error: 'Invalid path: must be a relative path without parent directory traversal',
            };
        }

        const fullPath = path.join(sourceRoot, normalizedPath);

        // Verify the resolved path is still within source root
        const resolvedPath = path.resolve(fullPath);
        const resolvedRoot = path.resolve(sourceRoot);
        if (!resolvedPath.startsWith(resolvedRoot)) {
            return {
                path: args.path,
                content: '',
                size: 0,
                error: 'Path traversal not allowed',
            };
        }

        try {
            const stats = fs.statSync(fullPath);
            if (!stats.isFile()) {
                return {
                    path: args.path,
                    content: '',
                    size: 0,
                    error: 'Path is not a file (use list_source_directory for directories)',
                };
            }

            // Limit file size to prevent memory issues
            const maxSize = 1024 * 1024; // 1MB
            if (stats.size > maxSize) {
                return {
                    path: args.path,
                    content: '',
                    size: stats.size,
                    error: `File too large (${(stats.size / 1024).toFixed(1)}KB, max 1024KB)`,
                };
            }

            const content = fs.readFileSync(fullPath, 'utf-8');
            return {
                path: args.path,
                content,
                size: stats.size,
            };
        } catch (error: any) {
            return {
                path: args.path,
                content: '',
                size: 0,
                error: error.code === 'ENOENT' ? 'File not found' : error.message,
            };
        }
    }

    toToolSpec(format: 'openai' | 'anthropic'): object {
        if (format === 'openai') {
            return {
                type: 'function',
                function: {
                    name: this.name,
                    description: this.description,
                    // @ts-ignore - zod-to-json-schema type limitation
                    parameters: zodToJsonSchema(this.parameters),
                },
            };
        } else {
            return {
                name: this.name,
                description: this.description,
                // @ts-ignore - zod-to-json-schema type limitation
                input_schema: zodToJsonSchema(this.parameters),
            };
        }
    }
}
