#!/usr/bin/env node

import { config } from 'dotenv';
import { loadConfig } from './config/env.js';
import { createLLMClient } from './providers/buildLLM.js';
import { ChromaAdapter } from './vectorstores/chroma/chromaAdapter.js';
import { runAgent } from './runtime/agent.js';
import { formatError } from './utils/errors.js';
import { ConversationManager } from './memory/ConversationManager.js';

// Load environment variables
config();

/**
 * Main CLI entry point
 */
async function main() {
    try {
        // Get question from command line arguments
        const args = process.argv.slice(2);
        const question = args.join(' ').trim();

        if (!question) {
            console.error('Error: No question provided');
            console.error('Usage: npm run start "Your question here"');
            console.error('Example: npm run start "How does account validation work?"');
            process.exit(1);
        }

        // Load configuration
        loadConfig();

        // Build LLM client
        const llm = createLLMClient();

        // Build vector store
        const vectorStore = new ChromaAdapter();
        await vectorStore.connect();

        // Initialize memory
        const memory = new ConversationManager();
        const historyContext = memory.getHistoryContext();

        if (historyContext) {
            console.log('📚 Loaded conversation history context');
        }

        // Run the agent
        const answer = await runAgent(llm, vectorStore, question, historyContext);

        // Save interaction
        memory.saveTurn(question, answer);

        // Print the final answer
        console.log('\n📝 Final Answer:\n');
        console.log(answer);
        console.log('\n');

    } catch (error) {
        console.error('\n❌ Error:', formatError(error));
        console.error('\nStack trace:', error);
        process.exit(1);
    }
}

// Run main function
main();
