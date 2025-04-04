import { NextResponse } from 'next/server';
import OpenAI from 'openai';
// Import RESPONSES_MODEL, assuming it's defined for file search/context retrieval
import { MODEL as RESPONSES_MODEL } from '@/config/constants'; 
// Use the template function as fallback if generation fails
import { getSocraticPromptForTopic } from '@/config/socratic-prompt'; 

// Ensure OPENAI_API_KEY is available in environment variables
const openai = new OpenAI();

// Use a capable model for prompt generation. gpt-4o is a good choice.
const PROMPT_GENERATION_MODEL = "o3-mini"; 

/**
 * Retrieves context summary for a topic from a specific vector store using the Responses API.
 */
async function getContextFromVectorStore(vectorStoreId: string, topic: string): Promise<string> {
    console.log(`Retrieving context for topic "${topic}" from VS ${vectorStoreId}`);
    try {
        // Use Responses API to query the vector store for relevant context
        const response = await openai.responses.create({
            model: RESPONSES_MODEL, // Use a model suitable for retrieval/summarization
            input: [
                { role: "user", content: `Extract and concisely summarize the key concepts, definitions, examples, and potential learning difficulties related to the topic "${topic}" based on the provided documents.` }
            ],
            tools: [{
                type: "file_search",
                vector_store_ids: [vectorStoreId],
                max_num_results: 5 // Limit results to keep context concise
            }],
            stream: false,
            instructions: "Focus ONLY on extracting and summarizing information relevant to the topic query based on the files. Be concise."
        });

        // Extract the assistant's response text
        const assistantMessageItem = response.output?.find(item => item.type === 'message' && item.role === 'assistant');
        if (assistantMessageItem?.type === 'message' && assistantMessageItem.content?.[0]?.type === 'output_text') {
            const contextText = assistantMessageItem.content[0].text;
            console.log("Retrieved context summary length:", contextText?.length);
            return contextText || "No specific context found in documents.";
        }
        console.warn("No assistant text message found in Responses API output for context retrieval.");
        return "Failed to extract context summary from documents.";
    } catch (error) {
        console.error("Error retrieving context from Vector Store via Responses API:", error);
        return `Error retrieving context: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

/**
 * Generates a detailed Socratic system prompt using a meta-prompt and a powerful LLM.
 */
async function generateSocraticPrompt(mode: string, topic: string, context: string): Promise<string> {
    console.log(`Generating Socratic prompt for mode "${mode}", topic "${topic}"`);
    try {
        const metaPrompt = `
You are an expert in Socratic pedagogy and instructional design.
Your task is to generate a detailed system instruction prompt for a voice-based LLM assistant that will act as a Socratic tutor.

**Target LLM:** The prompt is for a Realtime API model (like GPT-4o-mini-realtime-preview) interacting via voice.
**Socratic Mode:** ${mode}
**Learning Topic:** ${topic}
**Retrieved Context from Documents:**
--- START CONTEXT ---
${context}
--- END CONTEXT ---

**Instructions for Generation:**
1.  **Role Definition:** Clearly define the tutor's persona (curious, guiding, patient, NOT an answer-giver).
2.  **Core Method:** Emphasize asking probing, open-ended questions based *specifically* on the retrieved context and the learner's responses. Instruct the LLM to avoid giving direct answers from the context.
3.  **Mode Specialization:**
    * If Mode is 'Assessment': Focus the initial questions on gauging understanding of key concepts from the context. Ask questions that require applying context knowledge.
    * If Mode is 'Tutoring': Focus on guiding questions that help the learner explore the context, connect ideas, identify potential gaps or contradictions in their reasoning compared to the context. Instruct on how to gently guide away from misconceptions using the context.
4.  **Context Usage:** Explicitly instruct the LLM to refer to the provided context when formulating questions and evaluating learner statements (e.g., "Based on the context mentioning X, what are your thoughts on Y?").
5.  **Dialogue Flow:** Include basic instructions for maintaining flow (summarizing, clarifying, staying on topic, handling off-topic responses).
6.  **Language:** Instruct the LLM to respond in the user's language (Swiss German, German, English).
7.  **Output:** Generate ONLY the final instruction prompt as a single block of text, suitable for the 'instructions' parameter of the Realtime API session. Do NOT include explanations about the prompt itself.

**Example Principles to Incorporate (Adapt based on Context):**
- "Instead of explaining concept Z from the context, ask: 'The context mentions Z. Can you explain in your own words what that means?'"
- "If the learner says something contradicting the context, ask: 'That's interesting. The context states \'[quote]\'. How does your idea relate to that?'"
- "After a few exchanges, ask: 'How would you summarize the main points we've discussed about {topic} so far, based on our conversation and the context?'"

Generate the system instruction prompt now.
`;

        const completion = await openai.chat.completions.create({
            model: PROMPT_GENERATION_MODEL,
            messages: [{ role: "system", content: metaPrompt }], // Use system role for meta-prompt
        });

        const generatedPrompt = completion.choices[0]?.message?.content;
        if (!generatedPrompt) {
            throw new Error("Prompt generation model returned empty content.");
        }
        console.log("Generated Socratic Prompt length:", generatedPrompt.length);
        return generatedPrompt;

    } catch(error) {
        console.error("Error generating Socratic prompt with LLM:", error);
        console.log("Falling back to simpler template prompt.");
        // Fallback to a simpler prompt if generation fails
        return getSocraticPromptForTopic(topic, context); // Use the simpler template function
    }
}

/**
 * API Route Handler (POST)
 */
export async function POST(request: Request) {
    try {
        const { mode, topic, vectorStoreId } = await request.json();

        if (!mode || !topic || !vectorStoreId) {
            return NextResponse.json({ error: "Missing mode, topic, or vectorStoreId" }, { status: 400 });
        }

        // Step 1: Retrieve context from Vector Store using Responses API
        const contextSummary = await getContextFromVectorStore(vectorStoreId, topic);

        // Check if context retrieval failed significantly
        if (contextSummary.startsWith("Error retrieving context:")) {
            // Decide if we should still try to generate a prompt or return an error
            // Option 1: Return error immediately
            // return NextResponse.json({ error: contextSummary }, { status: 500 });
            // Option 2: Proceed with prompt generation without context (fallback handled in generateSocraticPrompt)
            console.warn("Proceeding with prompt generation despite context retrieval error.");
        }

        // Step 2: Generate the detailed Socratic prompt using the context and mode
        const socraticPrompt = await generateSocraticPrompt(mode, topic, contextSummary);

        // Step 3: Return the generated prompt
        return NextResponse.json({ socraticPrompt: socraticPrompt });

    } catch (error) {
        console.error("Error in /api/socratic/prepare:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error preparing Socratic session";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
} 