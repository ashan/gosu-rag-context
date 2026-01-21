import { ToolRegistry } from './src/tools/registry.js';
import { loadConfig } from './src/config/env.js';
import { ChromaAdapter } from './src/vectorstores/chroma/ChromaAdapter.js';

async function verify() {
    console.log('🚀 Starting Verification: GuidewireDocsTool');

    // 1. Load Config
    console.log('1. Loading config...');
    const config = loadConfig();
    console.log(`   Collections: ${config.chromaCollections}`);

    if (!config.chromaCollections.includes('docs')) {
        console.error('❌ Error: "docs" collection not found in config.');
        return;
    }

    // 2. Initialize Chroma Adapter
    console.log('2. Connecting to Chroma...');
    const adapter = new ChromaAdapter();
    await adapter.connect();

    // 3. Get Tool
    console.log('3. getting tool from registry...');
    const registry = new ToolRegistry();
    const docTool = registry.getTool('guidewire_docs_search');

    if (!docTool) {
        console.error('❌ Error: guidewire_docs_search tool not found in registry.');
        return;
    }
    console.log('   ✅ Tool found.');

    // 4. Execute Search
    console.log('4. Executing docs search for "contact manager"...');
    // Mock context with vector store
    const ctx = {
        vectorStore: adapter,
        config: config
    };

    try {
        const result = await docTool.execute({
            query: "contact manager",
            topK: 3
        }, ctx);

        console.log('   Search executed successfully.');
        console.log(`   Found ${result.total} results.`);

        if (result.results.length > 0) {
            console.log('   Top Result:');
            console.log(`   Source: ${result.results[0].source}`);
            console.log(`   Category: ${result.results[0].category}`);
            console.log(`   Preview: ${result.results[0].content.substring(0, 100)}...`);
            console.log('✅ Verification Passed!');
        } else {
            console.warn('⚠️ No results found. Ensure "docs" collection has data.');
        }

    } catch (err) {
        console.error('❌ Error executing tool:', err);
    }
}

verify().catch(console.error);
