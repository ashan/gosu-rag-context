/**
 * Simple Query Example
 * 
 * Demonstrates a basic symbol search query
 */

import { config } from 'dotenv';
import { OpenAIClient } from '../src/providers/buildLLM.js';
import { ChromaAdapter } from '../src/vectorstores/chroma/chromaAdapter.js';
import { runAgent } from '../src/runtime/agent.js';

// Load environment
config();

async function main() {
    console.log('='.repeat(70));
    console.log('Example 1: Simple Symbol Search');
    console.log('='.repeat(70));
    console.log();

    const question = "What is the AccountEnhancement_ACC class?";
    console.log(`Question: ${question}\n`);

    // Initialize
    const llm = new OpenAIClient();
    const vectorStore = new ChromaAdapter();
    await vectorStore.connect();

    // Run query
    const answer = await runAgent(llm, vectorStore, question);

    console.log('\n' + '='.repeat(70));
    console.log('📝 Final Answer:');
    console.log('='.repeat(70));
    console.log(answer);
    console.log();
}

main().catch(console.error);
