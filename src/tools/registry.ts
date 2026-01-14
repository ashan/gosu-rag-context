import type { Tool } from './Tool.js';
import { SymbolSearchTool } from './implementations/symbolSearch.js';
import { GetFileTool } from './implementations/fileGet.js';
import { RegexSearchTool } from './implementations/regexSearch.js';
import { SemanticSearchTool } from './implementations/semanticSearch.js';
import { loadConfig } from '../config/env.js';

/**
 * Tool registry - manages all available tools
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();
    private toolFormat: 'openai' | 'anthropic';

    constructor() {
        const config = loadConfig();
        this.toolFormat = config.toolFormat;

        // Register all tools
        this.registerTool(new SymbolSearchTool());
        this.registerTool(new GetFileTool());
        this.registerTool(new RegexSearchTool());
        this.registerTool(new SemanticSearchTool());
    }

    /**
     * Register a tool
     */
    private registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * Get a tool by name
     */
    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all tools
     */
    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get all tool names
     */
    getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Get tool specifications in the configured format
     */
    getToolSpecs(): object[] {
        return this.getAllTools().map(tool => tool.toToolSpec(this.toolFormat));
    }

    /**
     * Check if a tool exists
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }
}

/**
 * Create a singleton tool registry instance
 */
let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
    if (!registryInstance) {
        registryInstance = new ToolRegistry();
    }
    return registryInstance;
}

/**
 * Clear registry (useful for testing)
 */
export function clearToolRegistry(): void {
    registryInstance = null;
}
