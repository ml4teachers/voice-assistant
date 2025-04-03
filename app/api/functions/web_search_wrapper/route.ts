import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MODEL } from '@/config/constants'; // Use a model compatible with Responses API

const openai = new OpenAI(); // Assumes OPENAI_API_KEY is set in environment

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');
        const country = searchParams.get('country');
        const region = searchParams.get('region');
        const city = searchParams.get('city');
        const locationString = [city, region, country].filter(Boolean).join(', ');

        if (!query) {
            return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
        }

        console.log(`Web Search Wrapper: Searching web for query: "${query}"${locationString ? ` (Location: ${locationString})` : ''} using Responses API`);

        // Prepare location object if data is present
        const userLocation = (country || city || region) ? {
            type: "approximate" as const, // Added 'as const' for type safety
            ...(country && { country }),
            ...(city && { city }),
            ...(region && { region }),
        } : undefined;

        // --- Call OpenAI Responses API with web_search_preview tool --- 
        const response = await openai.responses.create({
            model: MODEL, // Ensure this model is compatible or use "gpt-4o" etc.
            input: [
                { role: "user", content: query }
            ],
            tools: [{ // Configure the web_search_preview tool
                type: "web_search_preview",
                // Add user_location if available
                ...(userLocation && { user_location: userLocation }),
                // Optional: Customize search context size (default is medium)
                // search_context_size: "low",
            }],
            stream: false, // We need the complete response here
        });

        console.log("Responses API raw output for web search:", JSON.stringify(response, null, 2));

        // Extract relevant parts (similar to file search)
        const assistantMessageItem = response.output?.find(item => item.type === 'message' && item.role === 'assistant');
        const webSearchCallItem = response.output?.find(item => item.type === 'web_search_call'); // Note the type

        let resultText = "Could not find relevant information on the web.";
        let annotations: any[] = [];

        // Extract text and annotations
        if (assistantMessageItem?.type === 'message' && assistantMessageItem.content?.[0]?.type === 'output_text') {
            const messageContent = assistantMessageItem.content[0];
            resultText = messageContent.text ?? resultText;
             // Ensure annotations are treated as an array
            annotations = Array.isArray(messageContent.annotations) ? messageContent.annotations : [];
        }

        // Prepare structured result
        const result = {
            answer: resultText,
            annotations: annotations, // url_citation annotations
            web_search_status: webSearchCallItem?.status ?? 'unknown',
        };
        // --- End OpenAI API Call --- 

        return NextResponse.json(result);

    } catch (error) {
        console.error("Error in web_search_wrapper API route:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error during web search wrapper execution";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
