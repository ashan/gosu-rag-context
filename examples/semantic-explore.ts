/**
 * Semantic Search Example
 * 
 * Demonstrates using semantic search for exploratory queries
 */

import { config } from 'dotenv';
import { OpenAIClient } from '../src/providers/buildLLM.js';
import { ChromaAdapter } from '../src/vectorstores/chroma/chromaAdapter.js';
import { runAgent } from '../src/runtime/agent.js';

config();

async function main() {
    console.log('='.repeat(70));
    console.log('Example 3: Semantic Search Exploration');
    console.log('='.repeat(70));
    console.log();

    const questions = [
        "Find all database query utilities in the codebase",
        "What billing-related functionality exists?",
        "Show me examples of custom validation logic",
    ];

    // Initialize once
    const llm = new OpenAIClient();
    const vectorStore = new ChromaAdapter();
    await vectorStore.connect();

    // Run each query
    for (const question of questions) {
        console.log('\n' + '-'.repeat(70));
        console.log(`Question: ${question}`);
        console.log('-'.repeat(70));

        try {
            const answer = await runAgent(llm, vectorStore, question);
            console.log('\n📝 Answer:');
            console.log(answer);
        } catch (error) {
            console.error('Error:', error);
        }

        console.log('\n');
    }
}

main().catch(console.error);
