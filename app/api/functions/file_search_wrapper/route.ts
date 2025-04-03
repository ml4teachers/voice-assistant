import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MODEL } from '@/config/constants'; // Use a model compatible with Responses API

const openai = new OpenAI();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');
        // IMPORTANT: Vector Store ID is sent from the client in this implementation.
        const vectorStoreId = searchParams.get('vectorStoreId');
        
        if (!query) {
            return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
        }
        if (!vectorStoreId) {
            return NextResponse.json({ error: "Missing vectorStoreId parameter" }, { status: 400 });
        }

        console.log(`File Search Wrapper: Searching VS '${vectorStoreId}' for query: "${query}" using Responses API`);

        // Call the Responses API
        const response = await openai.responses.create({
            model: MODEL, // Use a compatible model (ensure MODEL constant is appropriate)
            input: [
                // Provide minimal context for the search query
                { role: "user", content: query }
            ],
            tools: [{ // Configure the file_search tool for the Responses API call
                type: "file_search",
                vector_store_ids: [vectorStoreId],
                // Optional: Add max_num_results or filters if needed
                // max_num_results: 5, 
            }],
            // Ensure streaming is disabled for a single response
            stream: false,
            // Optional: Specific instructions for this search task
            // instructions: "Answer the query based *only* on the provided file content."
        });

        console.log("Responses API raw output for file search:", JSON.stringify(response, null, 2));

        // Extract the relevant response parts
        const assistantMessageItem = response.output?.find(item => item.type === 'message' && item.role === 'assistant');
        const fileSearchCallItem = response.output?.find(item => item.type === 'file_search_call');

        let resultText = "No relevant information found in the provided files.";
        let annotations: any[] = [];

        // Extract text and annotations from the assistant's message
        if (assistantMessageItem?.type === 'message' && assistantMessageItem.content?.[0]?.type === 'output_text') {
            const messageContent = assistantMessageItem.content[0];
            resultText = messageContent.text ?? resultText;
            annotations = messageContent.annotations ?? [];
        }

        // Prepare the structured result to send back to the Realtime flow
        const result = {
            answer: resultText,
            annotations: annotations, // Pass annotations along
            file_search_status: fileSearchCallItem?.status ?? 'unknown', // Include search status
            // Optionally include queries or raw results if needed by the client
            // file_search_queries: fileSearchCallItem?.queries,
        };

        return NextResponse.json(result);

    } catch (error) {
        console.error("Error in file_search_wrapper API route:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error during file search wrapper execution";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
