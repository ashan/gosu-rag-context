import { z } from 'zod';
import { BaseTool, type ToolContext } from '../Tool.js';
import type { QueryFilter } from '../../vectorstores/VectorStoreAdapter.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ValidateEntityParamsSchema = z.object({
    entityName: z.string().min(1).describe(
        'Name of the Guidewire entity to validate (e.g., "Account", "Policy", "Contact")'
    ),
    fieldOrMethod: z.string().optional().describe(
        'Specific field or method to check on the entity (e.g., "AccountNumber", "getDisplayName")'
    ),
    module: z.string().optional().describe(
        'Guidewire module to search in (e.g., "policycenter"). Searches all if not specified.'
    ),
});

type ValidateEntityParams = z.infer<typeof ValidateEntityParamsSchema>;

interface EntityValidationResult {
    /** Whether the entity was found */
    exists: boolean;
    /** File location where the entity was found */
    location?: {
        filePath: string;
        module: string;
        lineStart: number;
        lineEnd: number;
    };
    /** The entity type (class, interface, enum) */
    entityType?: string;
    /** If fieldOrMethod was specified, whether it was found */
    memberExists?: boolean;
    /** Member details if found */
    memberInfo?: {
        name: string;
        type: string;
        lineStart: number;
    };
    /** Similar entities if exact match not found */
    suggestions?: Array<{
        name: string;
        filePath: string;
        module: string;
        score: number;
    }>;
    /** Validation message */
    message: string;
}

/**
 * Tool for validating that Guidewire entities exist in the codebase.
 * Essential for preventing hallucinations when proposing code changes.
 */
export class ValidateEntityTool extends BaseTool<ValidateEntityParams, EntityValidationResult> {
    readonly name = 'validate_entity';
    readonly description =
        'Validate that a Guidewire entity (class, interface, type) exists in the codebase. ' +
        'Use this BEFORE referencing any entity in proposed changes to prevent hallucinations. ' +
        'Can also check if specific fields or methods exist on an entity.';
    readonly parameters = ValidateEntityParamsSchema;

    async execute(args: ValidateEntityParams, ctx: ToolContext): Promise<EntityValidationResult> {
        // First, try to find the entity using symbol search
        const filter: Partial<QueryFilter> = {
            chunkType: 'class' as any, // Search class-level chunks
        };
        if (args.module) {
            filter.module = args.module;
        }

        // Search for the entity by name
        const entitySearchQuery = args.entityName;
        const hits = await ctx.vectorStore.semanticSearch(
            `class ${entitySearchQuery} entity definition`,
            10,
            Object.keys(filter).length > 0 ? filter as QueryFilter : undefined
        );

        // Look for exact or close matches in class names
        const exactMatch = hits.find(hit =>
            hit.metadata.className?.toLowerCase() === args.entityName.toLowerCase()
        );

        const closeMatches = hits.filter(hit =>
            hit.metadata.className?.toLowerCase().includes(args.entityName.toLowerCase()) ||
            args.entityName.toLowerCase().includes(hit.metadata.className?.toLowerCase() || '')
        );

        if (exactMatch) {
            const result: EntityValidationResult = {
                exists: true,
                location: {
                    filePath: exactMatch.metadata.relativePath,
                    module: exactMatch.metadata.module || 'unknown',
                    lineStart: exactMatch.metadata.lineStart,
                    lineEnd: exactMatch.metadata.lineEnd,
                },
                entityType: exactMatch.metadata.chunkType as string,
                message: `Entity '${args.entityName}' found in ${exactMatch.metadata.relativePath}`,
            };

            // If a specific field/method was requested, search for it
            if (args.fieldOrMethod) {
                const memberResult = await this.searchForMember(
                    ctx,
                    args.entityName,
                    args.fieldOrMethod,
                    args.module
                );
                result.memberExists = memberResult.exists;
                result.memberInfo = memberResult.info;

                if (memberResult.exists) {
                    result.message += `. Member '${args.fieldOrMethod}' found.`;
                } else {
                    result.message += `. WARNING: Member '${args.fieldOrMethod}' NOT found on this entity.`;
                }
            }

            return result;
        }

        // Entity not found - provide suggestions
        const suggestions = closeMatches.slice(0, 5).map(hit => ({
            name: hit.metadata.className || 'unknown',
            filePath: hit.metadata.relativePath,
            module: hit.metadata.module || 'unknown',
            score: hit.score || 0,
        }));

        return {
            exists: false,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            message: suggestions.length > 0
                ? `Entity '${args.entityName}' not found. Did you mean one of these: ${suggestions.map(s => s.name).join(', ')}?`
                : `Entity '${args.entityName}' not found in the codebase. This may be a hallucination - verify the entity name.`,
        };
    }

    /**
     * Search for a specific member (field/method) on an entity
     */
    private async searchForMember(
        ctx: ToolContext,
        entityName: string,
        memberName: string,
        module?: string
    ): Promise<{ exists: boolean; info?: { name: string; type: string; lineStart: number } }> {
        const filter: Partial<QueryFilter> = {};
        if (module) {
            filter.module = module;
        }
        filter.className = entityName;

        // Search for methods/properties with this name
        const hits = await ctx.vectorStore.semanticSearch(
            `${entityName} ${memberName} method property field`,
            5,
            Object.keys(filter).length > 0 ? filter as QueryFilter : undefined
        );

        // Look for a match on method/property name
        const memberMatch = hits.find(hit =>
            hit.metadata.methodName?.toLowerCase() === memberName.toLowerCase() ||
            hit.text.toLowerCase().includes(memberName.toLowerCase())
        );

        if (memberMatch) {
            return {
                exists: true,
                info: {
                    name: memberMatch.metadata.methodName || memberName,
                    type: memberMatch.metadata.chunkType as string,
                    lineStart: memberMatch.metadata.lineStart,
                },
            };
        }

        return { exists: false };
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
