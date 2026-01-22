#!/usr/bin/env node
/**
 * CLI for viewing ChromaDB collection statistics
 */

import * as dotenv from 'dotenv';
import { ChromaClient } from 'chromadb';

dotenv.config();

async function main() {
    console.log('📊 ChromaDB Collection Statistics\n');

    const host = process.env.CHROMA_HOST || 'localhost';
    const port = parseInt(process.env.CHROMA_PORT || '8000');

    try {
        const client = new ChromaClient({ path: `http://${host}:${port}` });

        // Get all collections
        const collections = await client.listCollections();

        if (collections.length === 0) {
            console.log('No collections found.');
            return;
        }

        console.log(`Found ${collections.length} collection(s):\n`);

        for (const collInfo of collections) {
            // Handle both old API (returns objects) and new API (returns strings)
            const collName = typeof collInfo === 'string' ? collInfo : (collInfo as any).name;
            const collection = await client.getOrCreateCollection({ name: collName });
            const count = await collection.count();

            console.log(`📦 ${collName}`);
            console.log(`   Documents: ${count}`);

            // Try to peek at sample metadata
            if (count > 0) {
                const peek = await collection.peek({ limit: 1 });
                if (peek.metadatas && peek.metadatas[0]) {
                    const fields = Object.keys(peek.metadatas[0]);
                    console.log(`   Metadata fields: ${fields.join(', ')}`);
                }
            }
            console.log();
        }
    } catch (error: any) {
        if (error.message?.includes('ECONNREFUSED')) {
            console.error('❌ Cannot connect to ChromaDB. Is it running?');
            console.error(`   Expected at: http://${host}:${port}`);
            console.error('   Run: docker compose up -d');
        } else {
            console.error('❌ Error:', error.message);
        }
        process.exit(1);
    }
}

main();
