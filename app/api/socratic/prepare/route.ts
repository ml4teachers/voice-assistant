import { NextResponse } from 'next/server';
import OpenAI from 'openai';
// Import RESPONSES_MODEL, assuming it's defined for file search/context retrieval
import { MODEL as RESPONSES_MODEL } from '@/config/constants'; 
// No longer importing getSocraticPromptForTopic as fallback needs rethinking

// Ensure OPENAI_API_KEY is available in environment variables
const openai = new OpenAI();

// Use a capable model for prompt generation. gpt-4o is a good choice.
const PROMPT_GENERATION_MODEL = "o3-mini"; 

// Interface for the expected JSON output from the instruction generation model
interface GeneratedSocraticOutput {
    instructions: string;
    opener_question: string;
}

/**
 * Retrieves context summary for a topic from a specific vector store using the Responses API.
 */
async function getContextFromVectorStore(vectorStoreId: string, topic: string): Promise<string> {
    console.log(`Retrieving context for topic "${topic}" from VS ${vectorStoreId} (max 10 results)`);
    try {
        // Use Responses API to query the vector store
        const response = await openai.responses.create({
            model: RESPONSES_MODEL, // Use a model suitable for retrieval/summarization
            input: [
                // Updated prompt to emphasize detail and examples for learning
                { role: "user", content: `Extract and summarize the key concepts, definitions, **important details, relevant examples,** and potential learning difficulties related to the topic "${topic}" based on the provided documents. The summary should be detailed enough to support a Socratic learning dialogue, including nuances and examples where appropriate.` }
            ],
            tools: [{
                type: "file_search",
                vector_store_ids: [vectorStoreId],
                max_num_results: 15 // Increased number of results
            }],
            stream: false,
            // Updated instructions to allow for more detail
            instructions: "Focus on extracting and summarizing information relevant to the topic query for a learning context. Include key details and examples. Conciseness is secondary to capturing useful information for tutoring."
        });

        // Extract the assistant's response text
        const assistantMessageItem = response.output?.find(item => item.type === 'message' && item.role === 'assistant');
        if (assistantMessageItem?.type === 'message' && assistantMessageItem.content?.[0]?.type === 'output_text') {
            const contextText = assistantMessageItem.content[0].text;
            console.log("Retrieved context summary length:", contextText?.length);
            // console.log("Retrieved context summary:", contextText); // Optional: Log context
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
 * Generates Socratic instructions AND an opener question based on context,
 * outputting as a JSON object.
 */
async function generateSocraticInstructionsAndOpener(mode: string, topic: string, context: string): Promise<GeneratedSocraticOutput> {
    console.log(`Generating Socratic instructions & opener question for mode "${mode}", topic "${topic}" based on context.`);
    try {
        // MetaPrompt requesting JSON output with instructions and opener
        const metaPrompt = `
You are an expert in Socratic pedagogy and instructional design.
Your task is to generate a JSON object containing two keys: "instructions" and "opener_question".

**1. instructions:** Generate specific instructions for a voice-based LLM assistant (Realtime API model) acting as a Socratic tutor.
   - **Target LLM:** Realtime API model (e.g., GPT-4o-mini-realtime-preview).
   - **Socratic Mode:** ${mode}
   - **Learning Topic:** ${topic}
   - **Retrieved Context (FOR YOUR REFERENCE ONLY):**
     --- START CONTEXT ---
     ${context}
     --- END CONTEXT ---
   - **Core Method:** Instruct the LLM to ask probing, open-ended questions based *specifically* on the context (provided below instructions in the final prompt) and the learner's responses. Avoid giving direct answers.
   - **Mode Specialization:** Tailor instructions to the mode ('Assessment' or 'Tutoring').
   - **Context Usage:** Instruct the LLM to explicitly use the context provided below these instructions in the final prompt.
   - **Dialogue Flow:** Include basic instructions (summarizing, clarifying, staying on topic).
   - **Language:** Instruct LLM to respond in the user's language (Swiss German, German, English).
   - **CRITICAL STARTING POINT:** Add an instruction stating: "The user has been shown the opener question: '[Your generated opener_question here]'. Their first utterance will be the answer to this question. Begin the dialogue based on their response."

**2. opener_question:** Generate a single, engaging, open-ended question suitable to kickstart the Socratic dialogue based on the mode, topic, and context. This question will be shown to the user *before* they start speaking.

**Output Format:** Respond ONLY with a valid JSON object containing the keys "instructions" (string) and "opener_question" (string). Do not include markdown formatting (like \`\`\`json) or any other text outside the JSON object.

Example JSON Output:
{
  "instructions": "You are a Socratic Tutor in ${mode} mode for the topic '${topic}'. Your goal is to guide the user... Ask questions based on the context provided below... The user has been shown the opener question: '[Generated Opener Here]'. Their first utterance will be the answer to this question. Begin the dialogue based on their response. Respond in the user's language.",
  "opener_question": "Based on the provided context about ${topic}, what is one aspect you find most interesting or confusing?"
}

Generate the JSON object now.
`;

        const completion = await openai.chat.completions.create({
            model: PROMPT_GENERATION_MODEL,
            messages: [{ role: "system", content: metaPrompt }],
            response_format: { type: "json_object" }, // Request JSON output
        });

        const jsonOutput = completion.choices[0]?.message?.content;
        if (!jsonOutput) {
            throw new Error("Instruction/Opener generation model returned empty content.");
        }

        try {
            const parsedOutput: GeneratedSocraticOutput = JSON.parse(jsonOutput);
            if (!parsedOutput.instructions || !parsedOutput.opener_question) {
                throw new Error("Generated JSON is missing required keys ('instructions', 'opener_question').");
            }
            // Insert the generated opener question into the instructions placeholder
            parsedOutput.instructions = parsedOutput.instructions.replace("['Your generated opener_question here']", `"${parsedOutput.opener_question}"`).replace("['Generated Opener Here']", `"${parsedOutput.opener_question}"`);
            
            console.log("Generated Socratic Instructions length:", parsedOutput.instructions.length);
            console.log("Generated Opener Question:", parsedOutput.opener_question);
            return parsedOutput;
        } catch (parseError) {
            console.error("Failed to parse JSON output from LLM:", jsonOutput, parseError);
            throw new Error(`Failed to parse generated JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }

    } catch(error) {
        console.error("Error generating Socratic instructions/opener with LLM:", error);
        // Fallback: Generate generic instructions and a very simple opener
        const fallbackInstructions = `You are a Socratic Tutor for the topic "${topic}" in ${mode} mode. Ask guiding questions based on the context provided below and the user's responses. Avoid giving direct answers. The user has been shown the opener question: "What are your initial thoughts on ${topic}?". Their first utterance will be the answer. Begin based on their response. Respond in the user's language.`;
        const fallbackOpener = `What are your initial thoughts on ${topic}?`;
        console.log("Falling back to generic instructions and opener.");
        return { instructions: fallbackInstructions, opener_question: fallbackOpener };
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

        // Step 1: Retrieve context from Vector Store
        const contextSummary = await getContextFromVectorStore(vectorStoreId, topic);
        if (contextSummary.startsWith("Error retrieving context:")) {
            // Handle context retrieval error (e.g., return error or proceed with caution)
            console.warn("Context retrieval failed, proceeding without specific context.");
            // Potentially return an error to the client?
            // return NextResponse.json({ error: contextSummary }, { status: 500 }); 
        }

        // Step 2: Generate Instructions and Opener Question (returns JSON object)
        const { instructions: generatedInstructions, opener_question: openerQuestion } = await generateSocraticInstructionsAndOpener(mode, topic, contextSummary);

        // Step 3: Manually combine instructions and context into the final prompt string for Realtime API
        const finalSocraticPrompt = `
<SOCRATIC_INSTRUCTIONS>
${generatedInstructions}
</SOCRATIC_INSTRUCTIONS>

<CONTEXT_FOR_TOPIC topic="${topic}">
${contextSummary}
</CONTEXT_FOR_TOPIC>
        `.trim(); // Trim whitespace

        console.log("Final combined Socratic Prompt (for API) length:", finalSocraticPrompt.length);

        // Step 4: Return BOTH the final prompt and the opener question
        return NextResponse.json({ 
            socraticPrompt: finalSocraticPrompt, 
            openerQuestion: openerQuestion 
        });

    } catch (error) {
        console.error("Error in /api/socratic/prepare:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error preparing Socratic session";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
} 