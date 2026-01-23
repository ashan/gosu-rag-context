import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { loadConfig, getGuidewireSources, getSourceByModule, type GuidewireSource } from '../../config/env.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const FindSourceFilesParamsSchema = z.object({
    pattern: z.string().min(1).describe('Glob pattern to search for (e.g., "**/*.xml", "**/messaging*.xml", "**/*.xsd")'),
    module: z.string().optional().describe('Optional: Filter to specific Guidewire module (e.g., "policycenter", "billingcenter")'),
    maxResults: z.number().int().positive().optional().describe('Maximum number of results (default: 50)'),
});

type FindSourceFilesParams = z.infer<typeof FindSourceFilesParamsSchema>;

interface FileMatch {
    path: string;
    module: string;
    size: number;
}

interface FindSourceFilesResult {
    pattern: string;
    module?: string;
    matches: FileMatch[];
    totalFound: number;
    truncated: boolean;
    error?: string;
}

/**
 * Tool for finding files by pattern in the source codebase (multi-module support)
 */
export class FindSourceFilesTool extends BaseTool<FindSourceFilesParams, FindSourceFilesResult> {
    readonly name = 'find_source_files';
    readonly description =
        'Find files matching a glob pattern in the Guidewire source codebase. ' +
        'Searches across all configured modules (policycenter, billingcenter, etc.) or filter by specific module. ' +
        'Use patterns like "**/*.xml" for all XML files, "**/config/*.yaml" for YAML configs. ' +
        'Results include module name and relative paths.';
    readonly parameters = FindSourceFilesParamsSchema;

    async execute(args: FindSourceFilesParams, _ctx: ToolContext): Promise<FindSourceFilesResult> {
        const config = loadConfig();
        const allSources = getGuidewireSources(config);

        if (allSources.length === 0) {
            return {
                pattern: args.pattern,
                module: args.module,
                matches: [],
                totalFound: 0,
                truncated: false,
                error: 'No Guidewire sources configured. Set GUIDEWIRE_SOURCES or CODE_SOURCE_PATH in .env',
            };
        }

        // Filter to specific module if requested
        let sourcesToSearch: GuidewireSource[];
        if (args.module) {
            const source = getSourceByModule(config, args.module);
            if (!source) {
                return {
                    pattern: args.pattern,
                    module: args.module,
                    matches: [],
                    totalFound: 0,
                    truncated: false,
                    error: `Module "${args.module}" not found. Available modules: ${allSources.map(s => s.module).join(', ')}`,
                };
            }
            sourcesToSearch = [source];
        } else {
            sourcesToSearch = allSources;
        }

        const maxResults = args.maxResults || 50;

        try {
            // Convert glob pattern to regex
            const regex = this.globToRegex(args.pattern);

            // Walk all source directories and collect matches
            const matches: FileMatch[] = [];
            let totalFound = 0;

            for (const source of sourcesToSearch) {
                if (matches.length >= maxResults) break;

                // Check if path exists
                if (!fs.existsSync(source.codePath)) {
                    continue;
                }

                this.walkDirectory(
                    source.codePath,
                    source.codePath,
                    source.module,
                    regex,
                    matches,
                    maxResults,
                    () => { totalFound++; }
                );
            }

            return {
                pattern: args.pattern,
                module: args.module,
                matches,
                totalFound,
                truncated: totalFound > maxResults,
            };
        } catch (error: any) {
            return {
                pattern: args.pattern,
                module: args.module,
                matches: [],
                totalFound: 0,
                truncated: false,
                error: error.message,
            };
        }
    }

    /**
     * Convert glob pattern to regex
     */
    private globToRegex(pattern: string): RegExp {
        let regex = pattern
            .replace(/\./g, '\\.')          // Escape dots
            .replace(/\*\*/g, '{{GLOBSTAR}}')  // Placeholder for **
            .replace(/\*/g, '[^/]*')        // * matches non-slash chars
            .replace(/\?/g, '[^/]')         // ? matches single non-slash char
            .replace(/{{GLOBSTAR}}/g, '.*'); // ** matches anything including slashes

        // Handle pattern starting with **/ (match from anywhere)
        if (!pattern.startsWith('**/') && !pattern.startsWith('/')) {
            regex = '^' + regex;
        }

        regex = regex + '$';
        return new RegExp(regex, 'i');
    }

    /**
     * Recursively walk directory and collect matching files
     */
    private walkDirectory(
        currentPath: string,
        rootPath: string,
        moduleName: string,
        pattern: RegExp,
        matches: FileMatch[],
        maxResults: number,
        onMatch: () => void
    ): void {
        if (matches.length >= maxResults) return;

        try {
            const items = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const item of items) {
                if (matches.length >= maxResults) break;

                const itemPath = path.join(currentPath, item.name);
                const relativePath = path.relative(rootPath, itemPath);

                // Skip hidden files and common non-source directories
                if (item.name.startsWith('.')) continue;
                if (['node_modules', 'dist', 'build', '.git'].includes(item.name)) continue;

                if (item.isDirectory()) {
                    this.walkDirectory(itemPath, rootPath, moduleName, pattern, matches, maxResults, onMatch);
                } else if (item.isFile()) {
                    if (pattern.test(relativePath)) {
                        onMatch();
                        if (matches.length < maxResults) {
                            try {
                                const stats = fs.statSync(itemPath);
                                matches.push({
                                    path: relativePath,
                                    module: moduleName,
                                    size: stats.size,
                                });
                            } catch { }
                        }
                    }
                }
            }
        } catch (error) {
            // Skip directories we can't read
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
