import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createTwoFilesPatch } from 'diff';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSourceByModule, getGuidewireSources } from '../../config/env.js';

const GenerateDiffParamsSchema = z.object({
    module: z.string().min(1).describe(
        'Target Guidewire module (e.g., "policycenter", "billingcenter")'
    ),
    filePath: z.string().min(1).describe(
        'Relative path to the file within the module (e.g., "src/entity/Account.gs")'
    ),
    modifiedContent: z.string().min(1).describe(
        'The complete modified file content with proposed changes'
    ),
    description: z.string().min(1).describe(
        'Brief description of what the change accomplishes'
    ),
    context: z.number().int().positive().max(10).optional().describe(
        'Number of context lines around changes (default: 3)'
    ),
});

type GenerateDiffParams = z.infer<typeof GenerateDiffParamsSchema>;

interface DiffStats {
    additions: number;
    deletions: number;
    filesChanged: number;
}

interface GenerateDiffResult {
    /** Unified diff output */
    diff: string;
    /** Statistics about the changes */
    stats: DiffStats;
    /** Target file info */
    file: {
        module: string;
        path: string;
        absolutePath: string;
        exists: boolean;
    };
    /** Change description */
    description: string;
    /** Review instructions */
    reviewInstructions: string;
}

/**
 * Tool for generating unified diffs for proposed code changes.
 * Phase 1: Diffs are generated for human review, not applied directly.
 */
export class GenerateDiffTool extends BaseTool<GenerateDiffParams, GenerateDiffResult> {
    readonly name = 'generate_diff';
    readonly description =
        'Generate a unified diff for proposed code changes. ' +
        'The diff is for REVIEW ONLY - changes are not applied automatically. ' +
        'Use after validating entities and finding similar patterns. ' +
        'Returns a diff that can be reviewed and applied manually.';
    readonly parameters = GenerateDiffParamsSchema;

    async execute(args: GenerateDiffParams, ctx: ToolContext): Promise<GenerateDiffResult> {
        const contextLines = args.context || 3;

        // Resolve the file path within the module
        const source = getSourceByModule(args.module);
        if (!source) {
            const available = getGuidewireSources().map(s => s.module).join(', ');
            throw new Error(
                `Module '${args.module}' not found. Available modules: ${available || 'none configured'}`
            );
        }

        const absolutePath = path.join(source.codePath, args.filePath);

        // Read original content (or empty if new file)
        let originalContent = '';
        let fileExists = false;
        try {
            originalContent = await fs.readFile(absolutePath, 'utf-8');
            fileExists = true;
        } catch (error) {
            // File doesn't exist - this will be a new file
            fileExists = false;
        }

        // Generate unified diff
        const diff = createTwoFilesPatch(
            `a/${args.module}/${args.filePath}`,
            `b/${args.module}/${args.filePath}`,
            originalContent,
            args.modifiedContent,
            fileExists ? 'original' : '(new file)',
            'modified',
            { context: contextLines }
        );

        // Calculate diff statistics
        const stats = this.calculateStats(diff);

        // Generate review instructions
        const reviewInstructions = this.generateReviewInstructions(
            args.module,
            args.filePath,
            fileExists,
            stats
        );

        return {
            diff,
            stats,
            file: {
                module: args.module,
                path: args.filePath,
                absolutePath,
                exists: fileExists,
            },
            description: args.description,
            reviewInstructions,
        };
    }

    /**
     * Calculate additions and deletions from diff
     */
    private calculateStats(diff: string): DiffStats {
        const lines = diff.split('\n');
        let additions = 0;
        let deletions = 0;

        for (const line of lines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                additions++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                deletions++;
            }
        }

        return {
            additions,
            deletions,
            filesChanged: 1,
        };
    }

    /**
     * Generate human-readable review instructions
     */
    private generateReviewInstructions(
        module: string,
        filePath: string,
        exists: boolean,
        stats: DiffStats
    ): string {
        const action = exists ? 'modify' : 'create';
        const statsText = `+${stats.additions}/-${stats.deletions}`;

        return [
            `📋 REVIEW REQUIRED`,
            ``,
            `This diff proposes to ${action} the file:`,
            `  Module: ${module}`,
            `  Path: ${filePath}`,
            `  Changes: ${statsText}`,
            ``,
            `To apply:`,
            `  1. Review the diff above for correctness`,
            `  2. Verify Guidewire entity/field references are valid`,
            `  3. Check alignment with existing patterns`,
            `  4. Apply manually or using: git apply <diff-file>`,
            ``,
            `⚠️ Changes are NOT applied automatically.`,
        ].join('\n');
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
