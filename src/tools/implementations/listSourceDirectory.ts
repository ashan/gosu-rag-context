import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { loadConfig, getGuidewireSources, getSourceByModule, type GuidewireSource } from '../../config/env.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ListSourceDirectoryParamsSchema = z.object({
    path: z.string().optional().describe('Relative path from source root (default: root directory)'),
    module: z.string().optional().describe('Optional: Filter to specific Guidewire module (e.g., "policycenter"). If not specified, shows all modules at root level.'),
    pattern: z.string().optional().describe('Optional glob pattern to filter files (e.g., "*.xml")'),
});

type ListSourceDirectoryParams = z.infer<typeof ListSourceDirectoryParamsSchema>;

interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory' | 'module';
    module?: string;
    size?: number;
}

interface ListSourceDirectoryResult {
    path: string;
    module?: string;
    entries: DirectoryEntry[];
    error?: string;
}

/**
 * Tool for listing directory contents in the source codebase (multi-module support)
 */
export class ListSourceDirectoryTool extends BaseTool<ListSourceDirectoryParams, ListSourceDirectoryResult> {
    readonly name = 'list_source_directory';
    readonly description =
        'List files and subdirectories in a source codebase directory. ' +
        'Without a module specified, shows available Guidewire modules at root. ' +
        'With a module, explores that module\'s directory structure. ' +
        'Optionally filter by pattern (e.g., "*.xml" for XML files only).';
    readonly parameters = ListSourceDirectoryParamsSchema;

    async execute(args: ListSourceDirectoryParams, _ctx: ToolContext): Promise<ListSourceDirectoryResult> {
        const config = loadConfig();
        const allSources = getGuidewireSources(config);

        if (allSources.length === 0) {
            return {
                path: args.path || '.',
                module: args.module,
                entries: [],
                error: 'No Guidewire sources configured. Set GUIDEWIRE_SOURCES or CODE_SOURCE_PATH in .env',
            };
        }

        // If no module specified and no path, list available modules
        if (!args.module && (!args.path || args.path === '.')) {
            const entries: DirectoryEntry[] = allSources.map(source => ({
                name: source.module,
                type: 'module' as const,
                module: source.module,
            }));
            return {
                path: '.',
                entries,
            };
        }

        // Get the specific module to list
        let source: GuidewireSource | undefined;
        if (args.module) {
            source = getSourceByModule(config, args.module);
            if (!source) {
                return {
                    path: args.path || '.',
                    module: args.module,
                    entries: [],
                    error: `Module "${args.module}" not found. Available modules: ${allSources.map(s => s.module).join(', ')}`,
                };
            }
        } else {
            // Use the first available source if no module specified
            source = allSources[0];
        }

        const sourceRoot = source.codePath;
        const targetPath = args.path || '.';

        // Security: Prevent path traversal attacks
        const normalizedPath = path.normalize(targetPath);
        if (normalizedPath.startsWith('..') || (path.isAbsolute(normalizedPath) && normalizedPath !== '.')) {
            return {
                path: targetPath,
                module: source.module,
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
                module: source.module,
                entries: [],
                error: 'Path traversal not allowed',
            };
        }

        try {
            const stats = fs.statSync(fullPath);
            if (!stats.isDirectory()) {
                return {
                    path: targetPath,
                    module: source.module,
                    entries: [],
                    error: 'Path is not a directory (use read_source_file for files)',
                };
            }

            const items = fs.readdirSync(fullPath, { withFileTypes: true });
            let entries: DirectoryEntry[] = items.map(item => {
                const entry: DirectoryEntry = {
                    name: item.name,
                    type: item.isDirectory() ? 'directory' : 'file',
                    module: source!.module,
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
                module: source.module,
                entries,
            };
        } catch (error: any) {
            return {
                path: targetPath,
                module: source.module,
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
