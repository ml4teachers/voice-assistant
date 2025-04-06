import { NextResponse } from 'next/server';
import OpenAI from 'openai';
// Import RESPONSES_MODEL, assuming it's defined for file search/context retrieval
import { MODEL as RESPONSES_MODEL } from '@/config/constants'; 
// No longer importing getSocraticPromptForTopic as fallback needs rethinking

// Ensure OPENAI_API_KEY is available in environment variables
const openai = new OpenAI();

// Use a capable model for prompt generation. o3-mini is a good choice.
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
 * Generates Socratic instructions AND an opener question.
 */
async function generateSocraticInstructionsAndOpener(mode: string, topic: string, context: string): Promise<GeneratedSocraticOutput> {
  console.log(`Generating Socratic instructions (Mode: ${mode}) & opener for topic "${topic}" with natural interaction focus.`);
  try {
      // *** START: ENHANCED MetaPrompt (in English) ***
      const metaPrompt = `
You are an expert in Socratic pedagogy and instructional design, focused on creating natural, engaging, mode-appropriate, AND **concise** learning interactions for a voice assistant.
Your task is to generate a valid JSON object containing exactly two keys: "instructions" and "opener_question". Output ONLY this JSON object.

**Input Data:**
- Socratic Mode: ${mode} // This will be 'Assessment' or 'Tutoring'
- Learning Topic: ${topic}
- Retrieved Context:
    --- START CONTEXT ---
    ${context}
    --- END CONTEXT ---

**Mode Definitions (For Your Understanding):**
* **Assessment Mode:** The primary goal is to evaluate the user's current understanding of the '${topic}' based *specifically* on the provided context. Questions should probe their knowledge and reveal potential misconceptions relative to the context. Feedback is focused on accuracy of comprehension. Use fewer illustrative examples or tangents.
* **Tutoring Mode:** The primary goal is to collaboratively guide the user toward a deeper understanding of '${topic}', using the context as a foundation. Focus on exploration, reflection, and building knowledge. Ask more open-ended, guiding questions. Feel freer to use relevant examples/analogies briefly to aid understanding and allow for closely related, brief detours if helpful for learning. Emphasize encouraging the process over strict evaluation.

**Generation Steps:**

**1. Generate the "instructions" String for the *NEXT* LLM (the Realtime Socratic Tutor):**
   - This string is the **system prompt** for the tutor LLM. It MUST clearly define its role, goal (based on the mode), conversational style, and how to handle the interaction.
   - **Role & Goal (Mode Specific):** Start the instructions clearly stating the mode: "You are a Socratic Tutor operating in **${mode} mode** for the topic '${topic}'. Your primary goal is specific to this mode:"
       - If mode is 'Assessment': " Your goal is to **assess the user's understanding** of the topic based *strictly* on the provided context. Ask targeted questions to gauge their comprehension and pinpoint potential misconceptions relative to the context's information, while remaining encouraging."
       - If mode is 'Tutoring': " Your goal is to **guide the user towards deeper understanding** through exploration and discussion, using the provided context as a starting point. Foster their learning process in a collaborative, supportive way."
   - **Overall Persona:** Include: "Regardless of the mode, act as a **friendly, patient, and encouraging guide**. Your tone should be **calm, empathetic, and trustworthy**, like a helpful university tutor."
   - **Conversational Style & Naturalness (WITH EMPHASIS ON BREVITY):** Include these points:
       - "**CRITICAL: Keep Turns Concise & Focused:** Aim for **shorter** conversational turns. Avoid long explanations or monologues. The goal is a back-and-forth dialogue, not a lecture. **Get to the guiding question relatively quickly** after a brief acknowledgement."
       - "**Be Natural & Human-like:** Speak conversationally, not like a rigid script. Occasional natural fillers ('hmm', 'okay', 'right', 'ähm', 'genau', 'interessant') and slight pauses are encouraged for authenticity."
       - "**Build Rapport & Encourage (Briefly):** Start your response with a *very brief* positive acknowledgement of the user's input ('Good point.', 'Okay, I see.', 'Interesting thought.', 'Right...') before asking your question. **Do not extensively summarize their previous point unless absolutely necessary for clarity.**"
       - "**Use Examples/Analogies *Extremely* Sparingly & Briefly:**"
           - If mode is 'Assessment': " Avoid examples/analogies unless strictly required to clarify your assessment question itself. Keep them minimal."
           - If mode is 'Tutoring': " Only use an example/analogy if it *significantly* aids understanding of a complex point, and keep it *very concise* (one short sentence ideally). Then, immediately ask your guiding question."
       - "**Handling Detours (Briefly):**"
           - If mode is 'Assessment': " Immediately redirect back to the topic and context if the user strays."
           - If mode is 'Tutoring': " Acknowledge relevant tangents *very briefly* ('Ah yes, that relates to...') then *immediately* guide back to the main path ('...but focusing back on X from the context...')."
       - "**Avoid Interrogation Feel:** Frame questions collaboratively... user must feel safe."
   - **CRITICAL: Language Handling:** Include this explicit instruction: "**The user may speak Swiss German, German, or English. You MUST detect the language the user is speaking and respond fluently and naturally **in Standard German or English**. If they speak Swiss German, respond in Standard German. Do **NOT** attempt to imitate Swiss German or any other dialect, even if you detect it. Adapt your vocabulary and phrasing appropriately to the chosen output language (Standard German or English).**"
   - **Socratic Method Core (Concise Execution):** Include:
       - (Mode-specific question types: Assessment: probing/direct checks; Tutoring: open-ended/guiding).
       - "Build upon the user's contributions implicitly through your follow-up questions. **Avoid explicitly explaining the connection every time.**"
       - "**Handling Direct Answers:**" (Primarily avoid; minimal hints if stuck, more likely in Tutoring).
   - **Initial Turn Handling:** Include: "The user was shown the following opener question: '[Your generated opener_question here]'. Their first reply is the answer to this. Respond naturally, *concisely*, acknowledge their input according to the **${mode} mode's style**, and then proceed with your first appropriate follow-up question based on their response and the context."
   - **Context Integration:** Include: "Base your interaction **primarily on the context provided below** regarding '${topic}'. Refer to it implicitly or explicitly as needed."
   - **Turn Structure:** "**CRITICAL: Conclude your spoken turn with ONLY ONE clear, focused, primary follow-up question.** Do not add secondary questions or 'or...' options. Keep the question itself relatively concise."

**2. Generate the "opener_question" String:**
   - Create **one single**, engaging, open-ended, and **friendly-sounding** question based on the topic/context, suitable for the specified **${mode}**.
       - If mode is 'Assessment': Phrase it to gently prompt an initial check on a core aspect. (e.g., "To get us started on '${topic}', what's your initial take on the main challenge described in the context materials?")
       - If mode is 'Tutoring': Phrase it to be more invitational and exploratory. (e.g., "Alright, let's explore '${topic}' together. Looking at the context provided, what aspect immediately catches your eye or seems most interesting to discuss first?")

**Final Output Format:**
   - Produce **ONLY** the valid JSON object: { "instructions": "(The string generated in Step 1)", "opener_question": "(The string generated in Step 2)" }. Ensure the JSON is correctly formatted and contains no other text.
        `;
        // *** END: FINAL MetaPrompt ***

      console.log(`Sending MetaPrompt (Mode: ${mode}) to Generator LLM...`);

      const completion = await openai.chat.completions.create({
          model: PROMPT_GENERATION_MODEL,
          messages: [{ role: "system", content: metaPrompt }],
          response_format: { type: "json_object" },
          // Optional: Adjust temperature slightly if needed for creativity/consistency trade-off
          // temperature: 0.7,
      });

      const jsonOutput = completion.choices[0]?.message?.content;
      if (!jsonOutput) throw new Error("Generator LLM returned empty content.");

      console.log("Raw JSON Output from Generator LLM:", jsonOutput);

      try {
          const parsedOutput: GeneratedSocraticOutput = JSON.parse(jsonOutput);
          if (!parsedOutput.instructions || !parsedOutput.opener_question) {
              throw new Error("Generated JSON missing required keys ('instructions', 'opener_question').");
          }
          // Inject opener into instructions placeholder
          parsedOutput.instructions = parsedOutput.instructions.replace("['Your generated opener_question here']", `"${parsedOutput.opener_question}"`);

          console.log("Generated Opener Question:", parsedOutput.opener_question);
          // Optionally log parts of the generated instructions for verification:
          // console.log("Generated Instructions contain mode:", parsedOutput.instructions.includes(`operating in **${mode} mode**`));
          // console.log("Generated Instructions contain language rule:", parsedOutput.instructions.includes("MUST detect the language"));
          return parsedOutput;
      } catch (parseError) {
          console.error("Failed to parse JSON output from generator LLM:", jsonOutput, parseError);
          throw new Error(`Failed to parse generated JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
      }

  } catch (error) {
      console.error("Error generating Socratic instructions/opener:", error);
      // Fallback logic remains the same
      const fallbackInstructions = `SYSTEM_ERROR: Failed to generate detailed Socratic prompt for ${mode} mode. Standard Socratic questioning will be used. The user has been shown the opener question: "What aspect of ${topic} interests you most right now?". Evaluate their response and ask a relevant follow-up question in their language (Swiss German, German, or English).`;
      const fallbackOpener = `Sorry, there was an error preparing the session details for ${topic}. What aspect of it interests you most right now?`;
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
            const fallbackResult = await generateSocraticInstructionsAndOpener(mode, topic, "No context available.");
            // Combine fallback instructions and minimal context
             const fallbackFinalPrompt = `
 <SOCRATIC_INSTRUCTIONS>
 ${fallbackResult.instructions}
 </SOCRATIC_INSTRUCTIONS>
 
 <CONTEXT_FOR_TOPIC topic="${topic}">
 ${contextSummary} // Might be an error message or "No context available."
 </CONTEXT_FOR_TOPIC>
             `.trim();
              return NextResponse.json({
                  socraticPrompt: fallbackFinalPrompt,
                  openerQuestion: fallbackResult.opener_question
              });
        }

        // Step 2: Generate Instructions and Opener Question (Simplified)
        const { instructions: generatedInstructions, opener_question: openerQuestion } = await generateSocraticInstructionsAndOpener(mode, topic, contextSummary);

        // Step 3: Manually combine instructions and context
        const finalSocraticPrompt = `
 <SOCRATIC_INSTRUCTIONS>
 ${generatedInstructions}
 </SOCRATIC_INSTRUCTIONS>
 
 <CONTEXT_FOR_TOPIC topic="${topic}">
 ${contextSummary}
 </CONTEXT_FOR_TOPIC>
        `.trim();

        console.log("Final combined SIMPLIFIED Socratic Prompt length:", finalSocraticPrompt.length);

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