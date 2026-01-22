import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ZodSchema } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { loadConfig } from '../config/env.js';

/**
 * Message types for LLM conversations
 */
export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
}

/**
 * Tool call structure
 */
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * LLM response
 */
export interface LLMResponse {
    content?: string;
    tool_calls?: ToolCall[];
    finish_reason?: string;
}

/**
 * Generic LLM clientinterface
 */
export interface LLMClient {
    /**
     * Chat with tools
     */
    chat(
        messages: Message[],
        tools?: object[],
        options?: { parallel_tool_calls?: boolean }
    ): Promise<LLMResponse>;

    /**
     * Get structured output using Zod schema
     */
    structuredOutput<T>(messages: Message[], schema: ZodSchema<T>): Promise<T>;
}

/**
 * OpenAI LLM Client
 */
export class OpenAIClient implements LLMClient {
    private client: OpenAI;
    private model: string;

    constructor() {
        const config = loadConfig();

        if (!config.openaiApiKey) {
            throw new Error('OPENAI_API_KEY is required for OpenAI provider');
        }

        this.client = new OpenAI({
            apiKey: config.openaiApiKey,
        });
        this.model = config.model;
    }

    async chat(
        messages: Message[],
        tools?: object[],
        options?: { parallel_tool_calls?: boolean }
    ): Promise<LLMResponse> {
        try {
            const params: any = {
                model: this.model,
                messages: messages as any,
            };

            // Only add tools and parallel_tool_calls if tools are provided
            if (tools && tools.length > 0) {
                params.tools = tools;
                params.parallel_tool_calls = options?.parallel_tool_calls ?? false;
            }

            const completion = await this.client.chat.completions.create(params);

            const choice = completion.choices[0];
            if (!choice) {
                throw new Error('No response from OpenAI');
            }

            return {
                content: choice.message.content || undefined,
                tool_calls: choice.message.tool_calls as any,
                finish_reason: choice.finish_reason || undefined,
            };
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                throw new Error(`OpenAI API Error: ${error.message}`);
            }
            throw error;
        }
    }

    async structuredOutput<T>(messages: Message[], schema: ZodSchema<T>): Promise<T> {
        try {
            const completion = await this.client.beta.chat.completions.parse({
                model: this.model,
                messages: messages as any,
                response_format: zodResponseFormat(schema, 'response'),
            });

            const choice = completion.choices[0];
            if (!choice) {
                throw new Error('No response from OpenAI');
            }

            if (!choice.message.parsed) {
                throw new Error('Failed to parse structured output from OpenAI');
            }

            return choice.message.parsed as T;
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                throw new Error(`OpenAI API Error (structured output): ${error.message}`);
            }
            throw error;
        }
    }
}

/**
 * Anthropic LLM Client
 */
export class AnthropicClient implements LLMClient {
    private client: Anthropic;
    private model: string;

    constructor() {
        const config = loadConfig();
        if (!config.anthropicApiKey) {
            throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
        }
        this.client = new Anthropic({
            apiKey: config.anthropicApiKey,
        });
        this.model = config.model;
    }

    async chat(
        messages: Message[],
        tools?: object[],
        _options?: { parallel_tool_calls?: boolean }
    ): Promise<LLMResponse> {
        // Convert messages to Anthropic format
        const anthropicMessages: any[] = messages.filter(m => m.role !== 'system').map(m => {
            if (m.role === 'tool') {
                return {
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: m.tool_call_id,
                            content: m.content
                        }
                    ]
                };
            } else if (m.role === 'assistant' && m.tool_call_id) { // Not quite enabling full tool use loop reconstruction here for brevity, keeping simple
                // Anthropic handles tool calls slightly differently in response, but for input it expects tool_use blocks
                // For this simple implementation we assume we are just passing text or structured tool use
                // Correct mapping requires recursive content blocks if mixed text/tool-use
                // For now, simple text mapping:
                return {
                    role: m.role,
                    content: m.content
                };
            }
            return {
                role: m.role,
                content: m.content
            };
        });

        const systemMessage = messages.find(m => m.role === 'system')?.content;

        const params: any = {
            model: this.model,
            messages: anthropicMessages,
            max_tokens: 4096,
        };

        if (systemMessage) {
            params.system = systemMessage;
        }

        if (tools && tools.length > 0) {
            params.tools = tools;
        }

        const response = await this.client.messages.create(params);

        const contentBlock = response.content.find((c: any) => c.type === 'text');
        const toolUseBlocks = response.content.filter((c: any) => c.type === 'tool_use');

        const toolCalls = toolUseBlocks.map((b: any) => ({
            id: b.id,
            type: 'function',
            function: {
                name: b.name,
                arguments: JSON.stringify(b.input)
            }
        }));

        return {
            content: contentBlock?.type === 'text' ? contentBlock.text : undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls as any : undefined,
            finish_reason: response.stop_reason || undefined
        };
    }

    async structuredOutput<T>(_messages: Message[], _schema: ZodSchema<T>): Promise<T> {
        // Anthropic doesn't have native "structured output" enforcement like OpenAI's beta.
        // We simulate it by prompting or using tool use with a single tool.
        // For simplicity in this iteration, we'll error or fallback to basic JSON parsing?
        // Better: Use a "forced tool use" pattern.
        throw new Error('Structured output not yet strictly implemented for Anthropic in this adapter');
    }
}

/**
 * Google Gemini Client
 */
export class GoogleClient implements LLMClient {
    private client: GoogleGenerativeAI;
    private model: string;

    constructor() {
        const config = loadConfig();
        if (!config.googleApiKey) {
            throw new Error('GOOGLE_API_KEY is required for Google provider');
        }
        this.client = new GoogleGenerativeAI(config.googleApiKey);
        this.model = config.model;
    }

    async chat(
        messages: Message[],
        tools?: object[],
        _options?: { parallel_tool_calls?: boolean }
    ): Promise<LLMResponse> {
        const model = this.client.getGenerativeModel({
            model: this.model,
            tools: tools ? [{ functionDeclarations: this.mapToolsToGemini(tools) }] : undefined
        } as any);

        // Convert messages to Gemini history
        // Gemini expects strict User/Model alternating turns, or "chat" structure
        // System prompt is set on model initialization (systemInstruction)
        // For simplicity, we just pack context or use generateContent for single turn if history not maintained
        // To support full history, we need to map roles strictly. 'system' -> systemInstruction.

        const systemMessage = messages.find(m => m.role === 'system')?.content;

        // Re-init with system prompt if exists
        const chatModel = systemMessage ?
            this.client.getGenerativeModel({
                model: this.model,
                systemInstruction: systemMessage,
                tools: tools ? [{ functionDeclarations: this.mapToolsToGemini(tools) }] : undefined
            } as any) : model;

        const history: any[] = [];
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            if (m.role === 'system') continue;

            let role = 'user';
            const parts: any[] = [];

            if (m.role === 'assistant') {
                role = 'model';
                if (m.content) parts.push({ text: m.content });
                if ((m as any).tool_calls) {
                    (m as any).tool_calls.forEach((tc: any) => {
                        parts.push({
                            functionCall: {
                                name: tc.function.name,
                                args: JSON.parse(tc.function.arguments)
                            }
                        });
                    });
                }
            } else if (m.role === 'tool' || (m.role as any) === 'function') {
                role = 'function'; // Gemini SDK requires 'function' role for functionResponse parts
                // Find function name from ID
                const callId = (m as any).tool_call_id;
                const assistantMsg = messages.find(msg =>
                    msg.role === 'assistant' &&
                    (msg as any).tool_calls?.some((tc: any) => tc.id === callId)
                );
                const toolCall = (assistantMsg as any)?.tool_calls?.find((tc: any) => tc.id === callId);
                const name = toolCall?.function?.name || 'unknown_tool';

                parts.push({
                    functionResponse: {
                        name: name,
                        response: {
                            content: m.content
                        }
                    }
                });
            } else {
                if (m.content) parts.push({ text: m.content });
            }

            if (parts.length > 0) {
                // Consolidate consecutive entries with same role (Gemini requires strict alternation)
                const lastEntry = history[history.length - 1];
                if (lastEntry && lastEntry.role === role) {
                    // Merge parts into existing entry
                    lastEntry.parts.push(...parts);
                } else {
                    history.push({ role, parts });
                }
            }
        }

        const chat = chatModel.startChat({
            history: history.slice(0, -1) // All but last message
        });

        const lastMsg = history[history.length - 1];
        const result = await chat.sendMessage(lastMsg.parts);
        const response = result.response;
        const text = response.text();

        // Map function calls
        const functionCalls = (response as any).functionCalls ? (response as any).functionCalls() : [];
        const toolCalls = functionCalls?.map((fc: any) => ({
            id: 'gemini_call_' + Math.random().toString(36).substr(2, 9), // ID generation
            type: 'function',
            function: {
                name: fc.name,
                arguments: JSON.stringify(fc.args)
            }
        }));

        return {
            content: text,
            tool_calls: toolCalls ? toolCalls as any : undefined,
            finish_reason: response.candidates?.[0]?.finishReason
        };
    }

    async structuredOutput<T>(messages: Message[], _schema: ZodSchema<T>): Promise<T> {
        // Gemini supports JSON schema response format
        const systemMessage = messages.find(m => m.role === 'system')?.content;

        const model = this.client.getGenerativeModel({
            model: this.model,
            systemInstruction: systemMessage,
            generationConfig: {
                responseMimeType: "application/json",
            } as any
        } as any);

        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') +
            "\nOutput strictly valid JSON matching requirements.";

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        console.log('[GoogleClient] Raw response:', text);

        try {
            const parsed = JSON.parse(text);
            // Handling case where Gemini returns just the array of steps instead of { steps: [...] }
            if (Array.isArray(parsed) && !parsed.length) {
                return { steps: [] } as any;
            }
            if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].id || parsed[0].title)) {
                return { steps: parsed } as any;
            }
            // Handling case where Gemini wraps steps in a 'plan' key instead of 'steps'
            if (parsed.plan && Array.isArray(parsed.plan)) {
                return { steps: parsed.plan } as any;
            }
            return parsed as T;
        } catch (e) {
            throw new Error(`Failed to parse valid JSON from Gemini: ${text}`);
        }
    }


    private mapToolsToGemini(tools: any[]): any[] {
        return tools.map(t => {
            if (t.type === 'function' && t.function) {
                return {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: this.sanitizeSchema(t.function.parameters)
                };
            }
            return t;
        });
    }

    private sanitizeSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') return schema;

        const newSchema = { ...schema };

        // Remove unsupported fields for Gemini
        delete newSchema.additionalProperties;
        delete newSchema.$schema;
        delete newSchema.exclusiveMinimum; // Ensure compatibility

        if (newSchema.properties) {
            const newProps: any = {};
            for (const key in newSchema.properties) {
                newProps[key] = this.sanitizeSchema(newSchema.properties[key]);
            }
            newSchema.properties = newProps;
        }

        if (newSchema.items) {
            newSchema.items = this.sanitizeSchema(newSchema.items);
        }

        return newSchema;
    }
}

/**
 * Factory to create LLM client
 */
export function createLLMClient(): LLMClient {
    const config = loadConfig();
    switch (config.provider) {
        case 'openai':
            return new OpenAIClient();
        case 'anthropic':
            return new AnthropicClient();
        case 'google':
            return new GoogleClient();
        default:
            throw new Error(`Unsupported provider: ${config.provider}`);
    }
}
