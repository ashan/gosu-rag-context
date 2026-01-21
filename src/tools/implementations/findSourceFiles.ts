import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, type ToolContext } from '../Tool.js';
import { loadConfig } from '../../config/env.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const FindSourceFilesParamsSchema = z.object({
    pattern: z.string().min(1).describe('Glob pattern to search for (e.g., "**/*.xml", "**/messaging*.xml", "**/*.xsd")'),
    maxResults: z.number().int().positive().optional().describe('Maximum number of results (default: 50)'),
});

type FindSourceFilesParams = z.infer<typeof FindSourceFilesParamsSchema>;

interface FileMatch {
    path: string;
    size: number;
}

interface FindSourceFilesResult {
    pattern: string;
    matches: FileMatch[];
    totalFound: number;
    truncated: boolean;
    error?: string;
}

/**
 * Tool for finding files by pattern in the source codebase
 */
export class FindSourceFilesTool extends BaseTool<FindSourceFilesParams, FindSourceFilesResult> {
    readonly name = 'find_source_files';
    readonly description =
        'Find files matching a glob pattern in the Guidewire source codebase. ' +
        'Use patterns like "**/*.xml" for all XML files, "**/config/*.yaml" for YAML configs, ' +
        'or "**/messaging*.xml" for specific file names. ' +
        'Results include relative paths from source root.';
    readonly parameters = FindSourceFilesParamsSchema;

    async execute(args: FindSourceFilesParams, _ctx: ToolContext): Promise<FindSourceFilesResult> {
        const config = loadConfig();
        const sourceRoot = config.sourceRootPath;

        if (!sourceRoot) {
            return {
                pattern: args.pattern,
                matches: [],
                totalFound: 0,
                truncated: false,
                error: 'SOURCE_ROOT_PATH is not configured in .env',
            };
        }

        const maxResults = args.maxResults || 50;

        try {
            // Convert glob pattern to regex
            const pattern = args.pattern;
            const regex = this.globToRegex(pattern);

            // Walk directory tree and collect matches
            const matches: FileMatch[] = [];
            let totalFound = 0;

            this.walkDirectory(sourceRoot, sourceRoot, regex, matches, maxResults, () => {
                totalFound++;
            });

            return {
                pattern: args.pattern,
                matches,
                totalFound,
                truncated: totalFound > maxResults,
            };
        } catch (error: any) {
            return {
                pattern: args.pattern,
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
                    this.walkDirectory(itemPath, rootPath, pattern, matches, maxResults, onMatch);
                } else if (item.isFile()) {
                    if (pattern.test(relativePath)) {
                        onMatch();
                        if (matches.length < maxResults) {
                            try {
                                const stats = fs.statSync(itemPath);
                                matches.push({
                                    path: relativePath,
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
