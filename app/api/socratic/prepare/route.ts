import { NextResponse } from 'next/server';
import OpenAI from 'openai';
// Import RESPONSES_MODEL, assuming it's defined for file search/context retrieval
import { MODEL as RESPONSES_MODEL } from '@/config/constants'; 
// No longer importing getSocraticPromptForTopic as fallback needs rethinking

// Ensure OPENAI_API_KEY is available in environment variables
const openai = new OpenAI();

// Use a capable model for prompt generation. gpt-4o is a good choice.
const PROMPT_GENERATION_MODEL = "gpt-4o-mini"; 

// Interface for the expected JSON output from the instruction generation model
interface GeneratedSocraticOutput {
    instructions: string;
    opener_question: string;
}

/**
 * Retrieves context summary for a topic from a specific vector store using the Responses API.
 */
async function getContextFromVectorStore(vectorStoreId: string, topic: string): Promise<string> {
    console.log(`Retrieving context for topic "${topic}" from VS ${vectorStoreId} (max 15 results)`);
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
 * Generates Socratic instructions (with embedded E/M & JSON output rule) AND an opener question.
 */
async function generateSocraticInstructionsAndOpener(mode: string, topic: string, context: string): Promise<GeneratedSocraticOutput> {
    console.log(`Generating Socratic instructions & opener question (with EMT) for mode "${mode}", topic "${topic}" based on context.`);
    try {
        // UPDATED MetaPrompt for EMT Light
        const metaPrompt = `
You are an expert in Socratic pedagogy and instructional design.
Your task is to generate a JSON object containing two keys: "instructions" and "opener_question".

**Input:**
- Socratic Mode: ${mode}
- Learning Topic: ${topic}
- Retrieved Context:
    --- START CONTEXT ---
    ${context}
    --- END CONTEXT ---

**Instructions for Generation:**

**Part 1: Extract Expectations and Misconceptions:**
1. Analyze the retrieved context about "${topic}".
2. Identify 3-5 core **Expectations** (key concepts, correct ideas, important facts a learner should grasp). List them as simple strings.
3. Identify 2-4 potential **Misconceptions** (common errors, plausible but incorrect ideas related to the context). List them as simple strings.

**Part 2: Generate "instructions" String:**
4. Create a detailed system instruction prompt for a voice-based LLM assistant (Realtime API model) acting as a Socratic tutor in **${mode}** mode for the topic "${topic}".
5. **Embed Extracted Lists:** Clearly embed the lists generated in Part 1 within the instructions using XML-like tags, like this example:
    <EXPECTATIONS>
    - Expectation 1 string...
    - Expectation 2 string...
    </EXPECTATIONS>
    <MISCONCEPTIONS>
    - Misconception 1 string...
    - Misconception 2 string...
    </MISCONCEPTIONS>
6. **Instruct on Socratic Method:** Tell the LLM to guide the user via questions based on the context and the embedded EXPECTATIONS/MISCONCEPTIONS. It should *not* give direct answers.
7. **Instruct on JSON Output:** CRITICAL - Instruct the LLM to **ALWAYS** format its response as a **single, valid JSON object** with the following keys:
    - "evaluation": (string) A brief, encouraging evaluation of the user's last utterance in relation to the EXPECTATIONS and MISCONCEPTIONS.
    - "matched_expectations": (array of strings) A list of the specific EXPECTATIONS (verbatim from the embedded list) that the user's response correctly addressed or aligned with.
    - "triggered_misconceptions": (array of strings) A list of the specific MISCONCEPTIONS (verbatim from the embedded list) that the user's response seemed to indicate.
    - "follow_up_question": (string) The next Socratic question to ask the user, based on the evaluation, context, and remaining EXPECTATIONS/MISCONCEPTIONS.
8. **Context Usage:** Instruct the LLM to base its evaluation and follow-up question on the user's response, the embedded lists, and the full context provided *below* the main instructions in the final prompt.
9. **Initial Turn Handling:** Add the instruction: "The user has been shown the opener question: '[Your generated opener_question here]'. Their first utterance will be the answer to this question. Evaluate their response and generate your first JSON output accordingly."
10. **Language:** Instruct the LLM to use the user's language (Swiss German, German, English) for the "evaluation" and "follow_up_question" strings within the JSON.

**Part 3: Generate "opener_question" String:**
11. Create a single, engaging, open-ended question based on the mode, topic, and context to start the dialogue.

**Final Output Format:** Respond ONLY with a valid JSON object: { "instructions": "...", "opener_question": "..." }. Ensure the 'instructions' string contains the embedded <EXPECTATIONS> and <MISCONCEPTIONS> tags and the instruction to output JSON.
        `;

        const completion = await openai.chat.completions.create({
            model: PROMPT_GENERATION_MODEL,
            messages: [{ role: "system", content: metaPrompt }], // Use system role for complex instructions
            response_format: { type: "json_object" },
            temperature: 0.6, // Allow some creativity in phrasing
        });

        const jsonOutput = completion.choices[0]?.message?.content;
        if (!jsonOutput) throw new Error("Generator LLM returned empty content.");

        try {
            const parsedOutput: GeneratedSocraticOutput = JSON.parse(jsonOutput);
            if (!parsedOutput.instructions || !parsedOutput.opener_question) {
                throw new Error("Generated JSON missing keys.");
            }
            // Inject opener into instructions placeholder
            parsedOutput.instructions = parsedOutput.instructions.replace("['Your generated opener_question here']", `"${parsedOutput.opener_question}"`).replace("['Generated Opener Here']", `"${parsedOutput.opener_question}"`);

            console.log("Generated Socratic Instructions contain E/M tags:", parsedOutput.instructions.includes("<EXPECTATIONS>"));
            console.log("Generated Socratic Instructions contain JSON rule:", parsedOutput.instructions.includes('format its response as a **single, valid JSON object**'));
            console.log("Generated Opener Question:", parsedOutput.opener_question);
            return parsedOutput;
        } catch (parseError) {
            console.error("Failed to parse JSON output from generator LLM:", jsonOutput, parseError);
            throw new Error(`Failed to parse generated JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }

    } catch (error) {
        console.error("Error generating Socratic instructions/opener:", error);
        // Fallback needs to return the same structure but indicate error
        const fallbackInstructions = `SYSTEM_ERROR: Failed to generate detailed Socratic prompt with EMT tracking due to an internal error. The context might be missing or the generation model failed. Please try again or select a different topic. Standard Socratic questioning without EMT will be attempted. The user has been shown the opener question: "What aspect of ${topic} interests you most right now?". Evaluate their response and ask a relevant follow-up question.`;
        const fallbackOpener = `Sorry, there was an error preparing the advanced session details. What aspect of ${topic} interests you most right now?`;
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
        if (contextSummary.startsWith("Error retrieving context:") || contextSummary === "No specific context found in documents." || contextSummary === "Failed to extract context summary from documents.") {
            console.warn("Context retrieval failed or yielded no results, proceeding with fallback prompt generation.");
            // Generate fallback prompt directly if context fails
            const fallbackResult = await generateSocraticInstructionsAndOpener(mode, topic, "No context available."); // Pass minimal context to fallback
             const fallbackFinalPrompt = `
<SOCRATIC_INSTRUCTIONS>
${fallbackResult.instructions}
</SOCRATIC_INSTRUCTIONS>

<CONTEXT_FOR_TOPIC topic="${topic}">
${contextSummary}
</CONTEXT_FOR_TOPIC>
            `.trim();
             return NextResponse.json({
                 socraticPrompt: fallbackFinalPrompt,
                 openerQuestion: fallbackResult.opener_question
             });
        }

        // Step 2: Generate Instructions and Opener Question (using the updated function)
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

        console.log("Final combined Socratic Prompt (with EMT rules) length:", finalSocraticPrompt.length);

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