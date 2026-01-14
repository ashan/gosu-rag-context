import OpenAI from 'openai';
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
