import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { loadConfig, getGuidewireSources, getSourceByModule, type GuidewireSource } from '../../config/env.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ReadSourceFileParamsSchema = z.object({
    path: z.string().min(1).describe('Relative path from source root (e.g., "config/messaging-config.xml")'),
    module: z.string().optional().describe('Optional: Guidewire module to read from (e.g., "policycenter"). If not specified, searches all modules.'),
});

type ReadSourceFileParams = z.infer<typeof ReadSourceFileParamsSchema>;

interface ReadSourceFileResult {
    path: string;
    module: string;
    content: string;
    size: number;
    error?: string;
}

/**
 * Tool for reading files from the source codebase (multi-module support)
 */
export class ReadSourceFileTool extends BaseTool<ReadSourceFileParams, ReadSourceFileResult> {
    readonly name = 'read_source_file';
    readonly description =
        'Read the contents of a file from the Guidewire source codebase by relative path. ' +
        'Use this to read configuration files (XML, XSD, YAML, properties, etc.) that are not in the vector store. ' +
        'Optionally specify a module to read from, otherwise searches all modules for the file.';
    readonly parameters = ReadSourceFileParamsSchema;

    async execute(args: ReadSourceFileParams, _ctx: ToolContext): Promise<ReadSourceFileResult> {
        const config = loadConfig();
        const allSources = getGuidewireSources(config);

        if (allSources.length === 0) {
            return {
                path: args.path,
                module: '',
                content: '',
                size: 0,
                error: 'No Guidewire sources configured. Set GUIDEWIRE_SOURCES or CODE_SOURCE_PATH in .env',
            };
        }

        // Security: Prevent path traversal attacks
        const normalizedPath = path.normalize(args.path);
        if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
            return {
                path: args.path,
                module: args.module || '',
                content: '',
                size: 0,
                error: 'Invalid path: must be a relative path without parent directory traversal',
            };
        }

        // Determine sources to search
        let sourcesToSearch: GuidewireSource[];
        if (args.module) {
            const source = getSourceByModule(config, args.module);
            if (!source) {
                return {
                    path: args.path,
                    module: args.module,
                    content: '',
                    size: 0,
                    error: `Module "${args.module}" not found. Available modules: ${allSources.map(s => s.module).join(', ')}`,
                };
            }
            sourcesToSearch = [source];
        } else {
            sourcesToSearch = allSources;
        }

        // Try to find the file in the specified sources
        for (const source of sourcesToSearch) {
            const fullPath = path.join(source.codePath, normalizedPath);

            // Verify the resolved path is still within source root
            const resolvedPath = path.resolve(fullPath);
            const resolvedRoot = path.resolve(source.codePath);
            if (!resolvedPath.startsWith(resolvedRoot)) {
                continue; // Skip this source due to path traversal
            }

            try {
                const stats = fs.statSync(fullPath);
                if (!stats.isFile()) {
                    continue; // Not a file, try next source
                }

                // Limit file size to prevent memory issues
                const maxSize = 1024 * 1024; // 1MB
                if (stats.size > maxSize) {
                    return {
                        path: args.path,
                        module: source.module,
                        content: '',
                        size: stats.size,
                        error: `File too large (${(stats.size / 1024).toFixed(1)}KB, max 1024KB)`,
                    };
                }

                const content = fs.readFileSync(fullPath, 'utf-8');
                return {
                    path: args.path,
                    module: source.module,
                    content,
                    size: stats.size,
                };
            } catch (error: any) {
                // File not found in this source, try next
                if (error.code !== 'ENOENT') {
                    // Some other error, report it
                    return {
                        path: args.path,
                        module: source.module,
                        content: '',
                        size: 0,
                        error: error.message,
                    };
                }
            }
        }

        // File not found in any source
        return {
            path: args.path,
            module: args.module || '',
            content: '',
            size: 0,
            error: args.module
                ? `File not found in module "${args.module}"`
                : `File not found in any module. Available modules: ${allSources.map(s => s.module).join(', ')}`,
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
