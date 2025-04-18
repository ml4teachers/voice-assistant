// app/api/socratic/prepare/route.ts

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MODEL as RESPONSES_MODEL } from '@/config/constants';

const openai = new OpenAI();
const PROMPT_GENERATION_MODEL = "o4-mini";

// --- Interface angepasst: nur noch 'instructions' ---
interface GeneratedSocraticOutput {
    instructions: string;
    // opener_question: string; // Entfernt
}

// --- getContextFromVectorStore function bleibt unverändert ---
async function getContextFromVectorStore(vectorStoreId: string, topic: string): Promise<string> {
    // ... (Code wie gehabt) ...
    console.log(`Retrieving context for topic "${topic}" from VS ${vectorStoreId} (max 15 results)`);
    try {
        const response = await openai.responses.create({
            model: RESPONSES_MODEL,
            input: [
                { role: "user", content: `Extract and summarize the key concepts, definitions, **important details, relevant examples,** and potential learning difficulties related to the topic "${topic}" based on the provided documents. The summary should be detailed enough to support a Socratic learning dialogue, including nuances and examples where appropriate.` }
            ],
            tools: [{
                type: "file_search",
                vector_store_ids: [vectorStoreId],
                max_num_results: 20
            }],
            stream: false,
            instructions: "Focus on extracting and summarizing information relevant to the topic query for a learning context. Include key details and examples. Conciseness is secondary to capturing useful information for tutoring."
        });
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
 * Generates Socratic instructions that include the instruction for the tutor
 * to ask the opening question itself.
 */
async function generateSocraticInstructions(mode: string, topic: string, context: string): Promise<GeneratedSocraticOutput> {
    console.log(`Generating Socratic instructions (Mode: ${mode}, Topic: ${topic}) including assistant opener instruction.`);
    try {
        // *** START: MetaPrompt ***
        const metaPrompt = `
You are an expert in Socratic pedagogy and instructional design. Your task is to generate the system prompt ("instructions") for a Socratic tutor LLM designed for a **voice assistant**. The absolute primary goal is to **maximize the user's speaking time** by ensuring the tutor's responses are **extremely concise** and act primarily as empathetic listening prompts.
Output ONLY a valid JSON object containing exactly ONE key: "instructions".

**Input Data:**
- Socratic Mode: ${mode} // 'Assessment' or 'Tutoring'
- Learning Topic: ${topic}
- Retrieved Context:
    --- START CONTEXT ---
    ${context}
    --- END CONTEXT ---

**Mode Definitions (Impact on Questioning, not Length):**
* **Assessment Mode:** Evaluate understanding based *specifically* on context. Use concise probes for accuracy relative to context.
* **Tutoring Mode:** Collaboratively guide understanding using context. Use concise, open-ended prompts for exploration/reflection.

**Generation Task:**

**Generate the "instructions" String for the *NEXT* LLM (the Realtime Socratic Tutor):**
   - This string is the **system prompt** for the tutor LLM.
   - **Role & Goal:** Start clearly: "You are a Socratic Tutor operating in **${mode} mode** for the topic '${topic}'. Your **absolute primary goal** is to encourage the user to think aloud and explore the topic by **maximizing their speaking time**. Be an **empathetic listener first**, and a guide second."
   - **Overall Persona:** "Act as a **friendly, patient, and encouraging listener**. Your tone should be **calm and supportive**. Show empathy through brief affirmations, not long explanations."
   - **Conversational Style (Minimalist & Encouraging):**
       - "**CRITICAL: Extreme Brevity is Key.** Aim for the **shortest possible response** in most turns. Your main tools are minimal verbal cues to encourage the user to continue."
       - "**Use Minimal Prompts Frequently:** Employ responses like 'Mhm', 'Go on', 'Okay...', 'Interesting, tell me more...', 'And how does that connect?', 'What else?' as **complete turns** whenever possible, especially in Tutoring mode. These show you are listening without taking over the speaking turn."
       - "**Exceptions for Longer Turns (Use Sparingly!):** Only provide a slightly longer response (still concise!) if:
           (a) The user **explicitly asks** for an explanation/clarification.
           (b) The conversation has **completely stalled** for several turns, and a targeted question based on context is needed to restart it.
           (c) Briefly clarifying a specific point from the context is absolutely essential for understanding (Assessment mode primarily).
         **Otherwise, ALWAYS default to minimal responses.** Avoid unnecessary summaries or rephrasing of user statements."
       - "**Be Human-like (in Tone, not Length):** Keep your tone natural and conversational, even in minimal responses."
       - "**Build Rapport Through Listening:** Show engagement via brief acknowledgements ('I see', 'Got it') rather than elaborate praise."
       - "**Avoid Interrogation Feel:** Even concise questions should feel collaborative ('What makes you say that?' vs. 'Why?')."
   - **CRITICAL: Language Handling:** "**The user may speak Swiss German, German, or English. You MUST detect the language... respond fluently and naturally **in Standard German or English**, using a **concise** style. If they speak Swiss German, respond concisely in Standard German. Do **NOT** attempt to imitate Swiss German dialects or slang.**"
   - **Socratic Method Core (Concise Execution):**
       - (Question types should be concise probes/prompts aligned with the mode.)
       - "Build upon user contributions implicitly. **Minimal prompts often suffice.**"
       - "**Handling Direct Answers:** Gently deflect with a concise prompt encouraging self-discovery ('What does the context suggest?', 'What are your thoughts on that?'), unless an exception (see above) applies."
   - **Include this instruction for the first turn:** "**You MUST begin the conversation. Ask one concise, engaging, open-ended, and friendly-sounding question based on the topic '${topic}' and the provided context, appropriate for the ${mode} mode.** (Keep this opener brief!). **Do not wait for the user to speak first.**"
   - **Context Integration:** "Refer to the context **concisely** when needed to frame a minimal prompt or a targeted question ('Regarding X in the context, go on...', 'The context mentions Y, what's your take?')."
   - **Turn Structure:** "**Focus each turn on eliciting more input from the user.** Conclude with ONE concise guiding question **only if** a minimal prompt ('Mhm', 'Go on', etc.) is insufficient for the current conversational flow. Prioritize minimal prompts over questions."


**Final Output Format:**
   - Produce **ONLY** the valid JSON object: { "instructions": "(The string generated above)" }. Ensure correct JSON syntax and escaping.
        `;
        // *** END: MetaPrompt ***

        console.log(`Sending MetaPrompt (Mode: ${mode}) to Generator LLM...`);

        const completion = await openai.chat.completions.create({
            model: PROMPT_GENERATION_MODEL,
            messages: [{ role: "system", content: metaPrompt }],
            response_format: { type: "json_object" },
            // temperature: 0.7, // Optional
        });

        const jsonOutput = completion.choices[0]?.message?.content;
        if (!jsonOutput) throw new Error("Generator LLM returned empty content.");

        console.log("Raw JSON Output (Instructions only) from Generator LLM:", jsonOutput);

        try {
            // --- Angepasst: Erwartet nur 'instructions' ---
            const parsedOutput: { instructions: string } = JSON.parse(jsonOutput); // Simpler interface inline
            if (!parsedOutput.instructions) {
                throw new Error("Generated JSON missing required key 'instructions'.");
            }
            // No opener question to inject or log
            console.log("Successfully generated Socratic Instructions.");
            // Return as GeneratedSocraticOutput type (which now only has instructions implicitly)
            return { instructions: parsedOutput.instructions };
        } catch (parseError) {
            console.error("Failed to parse JSON output from generator LLM:", jsonOutput, parseError);
            throw new Error(`Failed to parse generated JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }

    } catch (error) {
        console.error("Error generating Socratic instructions:", error);
        // Fallback logic angepasst
        const fallbackInstructions = `SYSTEM_ERROR: Failed to generate detailed Socratic prompt for ${mode} mode. Standard Socratic questioning will be used. **Please start the conversation by asking 'What aspect of ${topic} interests you most right now?'.** Keep responses concise, ask only one follow-up question, and respond in Standard German or English (avoid Swiss German dialects).`;
        // Fallback doesn't need opener_question anymore
        return { instructions: fallbackInstructions };
    }
}


/**
 * API Route Handler (POST) - angepasst
 */
export async function POST(request: Request) {
    try {
        const { mode, topic, vectorStoreId } = await request.json();

        if (!mode || !topic || !vectorStoreId) {
            return NextResponse.json({ error: "Missing mode, topic, or vectorStoreId" }, { status: 400 });
        }

        const contextSummary = await getContextFromVectorStore(vectorStoreId, topic);
        // Handle context retrieval failure (inkl. Fallback) - Logik bleibt, ruft aber die angepasste Generatorfunktion auf
        if (contextSummary.startsWith("Error retrieving context:") || contextSummary === "No specific context found in documents." || contextSummary === "Failed to extract context summary from documents.") {
            console.warn("Context retrieval failed, proceeding with fallback instruction generation.");
            const fallbackResult = await generateSocraticInstructions(mode, topic, "No context available."); // Generate fallback instructions
             const fallbackFinalPrompt = `
 <SOCRATIC_INSTRUCTIONS>
 ${fallbackResult.instructions}
 </SOCRATIC_INSTRUCTIONS>

 <CONTEXT_FOR_TOPIC topic="${topic}">
 ${contextSummary}
 </CONTEXT_FOR_TOPIC>
             `.trim();
              return NextResponse.json({
                  socraticPrompt: fallbackFinalPrompt, // Nur Prompt zurückgeben
                  // openerQuestion: fallbackResult.opener_question // Entfernt
              });
        }

        // Step 2: Generate Instructions ONLY (using the updated function)
        // --- Angepasst: Erwartet nur 'instructions' ---
        const { instructions: generatedInstructions } = await generateSocraticInstructions(mode, topic, contextSummary);

        // Step 3: Manually combine instructions and context
        const finalSocraticPrompt = `
 <SOCRATIC_INSTRUCTIONS>
 ${generatedInstructions}
 </SOCRATIC_INSTRUCTIONS>

 <CONTEXT_FOR_TOPIC topic="${topic}">
 ${contextSummary}
 </CONTEXT_FOR_TOPIC>
        `.trim();

        console.log("Final combined Socratic Prompt (Instructions Only) length:", finalSocraticPrompt.length);

        // Step 4: Return ONLY the final prompt
        // --- Angepasst: Gibt nur 'socraticPrompt' zurück ---
        return NextResponse.json({
            socraticPrompt: finalSocraticPrompt,
            // openerQuestion: openerQuestion // Entfernt
        });

    } catch (error) {
        console.error("Error in /api/socratic/prepare:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error preparing Socratic session";
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}