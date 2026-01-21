import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { loadConfig } from '../../config/env.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ListSourceDirectoryParamsSchema = z.object({
    path: z.string().optional().describe('Relative path from source root (default: root directory)'),
    pattern: z.string().optional().describe('Optional glob pattern to filter files (e.g., "*.xml")'),
});

type ListSourceDirectoryParams = z.infer<typeof ListSourceDirectoryParamsSchema>;

interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory';
    size?: number;
}

interface ListSourceDirectoryResult {
    path: string;
    entries: DirectoryEntry[];
    error?: string;
}

/**
 * Tool for listing directory contents in the source codebase
 */
export class ListSourceDirectoryTool extends BaseTool<ListSourceDirectoryParams, ListSourceDirectoryResult> {
    readonly name = 'list_source_directory';
    readonly description =
        'List files and subdirectories in a source codebase directory. ' +
        'Use this to explore the directory structure and discover files. ' +
        'Optionally filter by pattern (e.g., "*.xml" for XML files only).';
    readonly parameters = ListSourceDirectoryParamsSchema;

    async execute(args: ListSourceDirectoryParams, _ctx: ToolContext): Promise<ListSourceDirectoryResult> {
        const config = loadConfig();
        const sourceRoot = config.sourceRootPath;

        if (!sourceRoot) {
            return {
                path: args.path || '.',
                entries: [],
                error: 'SOURCE_ROOT_PATH is not configured in .env',
            };
        }

        const targetPath = args.path || '.';

        // Security: Prevent path traversal attacks
        const normalizedPath = path.normalize(targetPath);
        if (normalizedPath.startsWith('..') || (path.isAbsolute(normalizedPath) && normalizedPath !== '.')) {
            return {
                path: targetPath,
                entries: [],
                error: 'Invalid path: must be a relative path without parent directory traversal',
            };
        }

        const fullPath = path.join(sourceRoot, normalizedPath);

        // Verify the resolved path is still within source root
        const resolvedPath = path.resolve(fullPath);
        const resolvedRoot = path.resolve(sourceRoot);
        if (!resolvedPath.startsWith(resolvedRoot)) {
            return {
                path: targetPath,
                entries: [],
                error: 'Path traversal not allowed',
            };
        }

        try {
            const stats = fs.statSync(fullPath);
            if (!stats.isDirectory()) {
                return {
                    path: targetPath,
                    entries: [],
                    error: 'Path is not a directory (use read_source_file for files)',
                };
            }

            const items = fs.readdirSync(fullPath, { withFileTypes: true });
            let entries: DirectoryEntry[] = items.map(item => {
                const entry: DirectoryEntry = {
                    name: item.name,
                    type: item.isDirectory() ? 'directory' : 'file',
                };

                if (item.isFile()) {
                    try {
                        const itemPath = path.join(fullPath, item.name);
                        const itemStats = fs.statSync(itemPath);
                        entry.size = itemStats.size;
                    } catch { }
                }

                return entry;
            });

            // Apply pattern filter if provided
            if (args.pattern) {
                const pattern = args.pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
                const regex = new RegExp(`^${pattern}$`, 'i');
                entries = entries.filter(e => e.type === 'directory' || regex.test(e.name));
            }

            // Sort: directories first, then alphabetically
            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            // Limit results
            const maxEntries = 100;
            if (entries.length > maxEntries) {
                entries = entries.slice(0, maxEntries);
            }

            return {
                path: targetPath,
                entries,
            };
        } catch (error: any) {
            return {
                path: targetPath,
                entries: [],
                error: error.code === 'ENOENT' ? 'Directory not found' : error.message,
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
