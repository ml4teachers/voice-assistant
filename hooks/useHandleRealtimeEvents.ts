import { useRef, useCallback, useEffect } from "react";
import { RealtimeEvent, ToolCall } from "@/components/realtime-types";
import useConversationStore from "@/stores/useConversationStore";
// Temporarily import Annotation type, assuming it exists in annotations.tsx
// If not, define a placeholder type here.
import { Annotation } from "@/components/annotations";
import useToolsStore from "@/stores/useToolsStore";
import useSocraticStore from "@/stores/useSocraticStore"; // Import the new Socratic store
import { getSocraticPromptForTopic } from '@/config/socratic-prompt'; // Import the prompt generator

// --- Temporary Type Definitions (replace imports from @/lib/assistant) ---
// Define placeholder types here. Refine or move to a central types file later.
interface BaseItem {
    id: string;
    type: string;
}

// Add annotations to ContentItem
export interface ContentItem {
    type: "input_text" | "output_text"; // Add other content types if needed
    text?: string;
    annotations?: Annotation[]; // Make annotations optional
}

export interface MessageItem extends BaseItem {
    type: "message";
    role: "user" | "assistant" | "system";
    content: ContentItem[]; // Use updated ContentItem
}

export interface FunctionCallItem extends BaseItem {
    type: "tool_call";
    tool_type: "function_call";
    name: string;
    arguments: string; // JSON stringified arguments
    parsedArguments?: any; // The parsed arguments object
    status: "in_progress" | "completed" | "failed";
    output?: string; // JSON stringified output or error
    call_id?: string; // OpenAI call ID
}

export interface FileSearchCallItem extends BaseItem {
    type: "tool_call";
    tool_type: "file_search_call"; // Specific type for UI differentiation
    status: "in_progress" | "completed" | "failed"; // Status from the event
    queries?: string[]; // Optional query details from event
    search_results?: any; // Optional results if requested/provided
    call_id?: string; // ID of the file_search_call event itself
    // Note: No traditional 'output' field like function calls
}

export type Item = MessageItem | FunctionCallItem | FileSearchCallItem;
// --- End Temporary Type Definitions ---

// --- Helper Functions to interact with Zustand store --- 

/**
 * Adds a new item to the chat message list.
 * Prevents adding duplicates based on item ID.
 */
const addTranscriptItem = (item: Item) => {
    useConversationStore.setState((state) => {
        if (item.id && state.chatMessages.some(msg => msg.id === item.id)) {
            console.warn("Attempted to add duplicate item with ID:", item.id);
            return state; // Return current state if duplicate
        }
        return { chatMessages: [...state.chatMessages, item] };
    });
};

/**
 * Updates the text content of an existing message item.
 * Can either replace the text or append to it.
 */
const updateTranscriptItem = (itemId: string, newText: string, append: boolean) => {
    useConversationStore.setState((state) => ({
        chatMessages: state.chatMessages.map(msg => {
            if (msg.id === itemId && msg.type === 'message' && msg.content && msg.content.length > 0) {
                const currentText = msg.content[0]?.text ?? "";
                // Handle initial placeholder text like "..."
                const baseText = (currentText === '...' && append) ? '' : currentText;
                const updatedText = append ? baseText + newText : newText;
                // Create new content array with updated text
                const newContent = [{ ...msg.content[0], text: updatedText }];
                return { ...msg, content: newContent };
            }
            return msg;
        })
    }));
};

/**
 * Updates specific properties of a tool call item.
 */
const updateToolCallItem = (itemId: string, updates: Partial<FunctionCallItem>) => {
    useConversationStore.setState((state) => ({
        chatMessages: state.chatMessages.map(item => {
            if (item.id === itemId && item.type === 'tool_call') {
                // Merge existing item with updates
                return { ...item, ...updates } as FunctionCallItem;
            }
            return item;
        })
    }));
};

// --- End Helper Functions ---

export function useHandleRealtimeEvents(sendEvent: (event: any) => void) {

    // Get Socratic state (values will update automatically thanks to Zustand)
    const {
        isSocraticModeActive,
        currentSocraticTopic,
        retrievedSocraticContext,
        socraticDialogueState,
        setRetrievedSocraticContext,
        setSocraticDialogueState,
        setCurrentSocraticTopic // Add setter for topic if needed here
    } = useSocraticStore();

    const executeToolFunction = useCallback(async (toolCall: ToolCall) => {
        const toolCallUiId = toolCall.item_id || `tool-${toolCall.call_id || Date.now()}`;
        console.log(`Executing tool: ${toolCall.name}`, toolCall.arguments);

        // Add initial tool call item to UI (if not triggered internally for context)
        if (!toolCall.call_id?.startsWith('socratic-ctx-')) { // Avoid showing internal context fetch in UI
            addTranscriptItem({
                type: "tool_call",
                id: toolCallUiId,
                tool_type: "function_call",
                status: "in_progress",
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
                parsedArguments: toolCall.arguments,
                call_id: toolCall.call_id,
            } as FunctionCallItem);
        }

        let result: any;
        try {
            const params = toolCall.arguments;
            let response: Response | null = null;

            if (toolCall.name === 'get_weather') {
                const query = new URLSearchParams(params as any).toString();
                response = await fetch(`/api/functions/get_weather?${query}`);
            } else if (toolCall.name === 'get_joke') {
                response = await fetch(`/api/functions/get_joke`);
            }
            // --- Handle File Search Wrapper Call --- 
            else if (toolCall.name === 'file_search_wrapper') {
                console.log("File search wrapper function called:", toolCall.arguments);
                const query = toolCall.arguments?.query;
                const isSocraticContextFetch = toolCall.call_id?.startsWith('socratic-ctx-');

                if (!query) {
                    result = { error: "Missing query for file search wrapper" };
                    console.error(result.error);
                    if (!isSocraticContextFetch) updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                    // If Socratic context fetch failed, reset state?
                    if (isSocraticContextFetch) setSocraticDialogueState('idle');
                } else {
                    if (!isSocraticContextFetch) {
                        updateToolCallItem(toolCallUiId, {
                            status: "in_progress",
                            parsedArguments: toolCall.arguments,
                            output: JSON.stringify({ status: "calling backend wrapper...", query: query })
                        });
                    }

                    const currentVectorStoreId = useToolsStore.getState().vectorStore?.id;
                    if (!currentVectorStoreId) {
                        result = { error: "No vector store configured in client state" };
                        console.error(result.error);
                        if (!isSocraticContextFetch) updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                        if (isSocraticContextFetch) setSocraticDialogueState('idle');
                    } else {
                        try {
                            const apiUrl = `/api/functions/file_search_wrapper?query=${encodeURIComponent(query)}&vectorStoreId=${encodeURIComponent(currentVectorStoreId)}`;
                            const backendResponse = await fetch(apiUrl);
                            if (!backendResponse.ok) {
                                const errorText = await backendResponse.text().catch(() => 'Failed to read error text');
                                throw new Error(`Backend wrapper failed (${backendResponse.status}): ${errorText}`);
                            }
                            result = await backendResponse.json(); // Result = { answer: "...", annotations: [...] }
                            console.log("File search wrapper result from backend:", result);

                            // ---- Store context IF it was a Socratic context fetch ----
                            if (isSocraticContextFetch && useSocraticStore.getState().currentSocraticTopic === query) {
                                const contextText = result?.answer || "Could not retrieve relevant context.";
                                setRetrievedSocraticContext(contextText);
                                console.log("Socratic context stored.");

                                // Generate the specific prompt
                                const topic = useSocraticStore.getState().currentSocraticTopic!;
                                const fullSocraticPrompt = getSocraticPromptForTopic(topic, contextText);

                                // Send the new prompt to the session
                                sendEvent({
                                    type: "session.update",
                                    session: { instructions: fullSocraticPrompt }
                                });
                                console.log("Sent updated Socratic instructions to session.");

                                // Set state to trigger the first question
                                setSocraticDialogueState('ready_to_ask');
                                sendEvent({ type: "response.create" });
                                console.log("Requested initial Socratic question.");
                            } else if (!isSocraticContextFetch) {
                                // Update UI only for non-Socratic fetches
                                updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) });
                            }
                            // ---------------------------------------------------------

                        } catch (fetchError) {
                            console.error("Error calling file_search_wrapper backend:", fetchError);
                            const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown backend fetch error";
                            result = { error: errorMsg };
                            if (!isSocraticContextFetch) updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                            if (isSocraticContextFetch) setSocraticDialogueState('idle'); // Reset state on error
                        }
                    }
                }
                // Send the result back ONLY for NON-SOCRATIC calls
                if (toolCall.call_id && !isSocraticContextFetch) {
                    sendEvent({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            call_id: toolCall.call_id,
                            output: JSON.stringify(result),
                        },
                    });
                    sendEvent({ type: "response.create" });
                } else if (!toolCall.call_id && !isSocraticContextFetch) {
                    console.warn("No call_id for non-Socratic file_search_wrapper.", toolCall);
                }
                return; // Prevent subsequent generic result handling

            }
            // --- Handle Web Search Wrapper Call --- 
            else if (toolCall.name === 'web_search_wrapper') {
                console.log("Web search wrapper function called:", toolCall.arguments);
                const query = toolCall.arguments?.query;
                // const location = toolCall.arguments?.location; // Optional location param

                if (!query) {
                    result = { error: "Missing query for web search wrapper" };
                    console.error(result.error);
                    updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                } else {
                    updateToolCallItem(toolCallUiId, {
                        status: "in_progress",
                        parsedArguments: toolCall.arguments,
                        output: JSON.stringify({ status: "searching web...", query: query })
                    });

                    try {
                         // Get location config from Zustand store
                         const { webSearchConfig } = useToolsStore.getState();
                         const locationParams = webSearchConfig.user_location;

                         // Construct API URL with query and optional location params
                         let apiUrl = `/api/functions/web_search_wrapper?query=${encodeURIComponent(query)}`;
                         if (locationParams?.country) apiUrl += `&country=${encodeURIComponent(locationParams.country)}`;
                         if (locationParams?.region) apiUrl += `&region=${encodeURIComponent(locationParams.region)}`;
                         if (locationParams?.city) apiUrl += `&city=${encodeURIComponent(locationParams.city)}`;

                         console.log("Calling web search backend with URL:", apiUrl);
                         const backendResponse = await fetch(apiUrl);
                         if (!backendResponse.ok) {
                             const errorText = await backendResponse.text().catch(() => 'Failed to read error text');
                             throw new Error(`Backend web search wrapper failed (${backendResponse.status}): ${errorText}`);
                         }
                         result = await backendResponse.json();
                         console.log("Web search wrapper result:", result);
                         updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) });
                    } catch (fetchError) {
                         console.error("Error calling web_search_wrapper backend:", fetchError);
                         const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown backend fetch error";
                         result = { error: errorMsg };
                         updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                    }
                }
                
                // Send result back to Realtime API
                if (toolCall.call_id) {
                    sendEvent({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            call_id: toolCall.call_id,
                            output: JSON.stringify(result), // Send structured result
                        },
                    });
                    sendEvent({ type: "response.create" }); // Ask assistant to respond
                } else {
                     console.warn("No call_id for web_search_wrapper, cannot send result back.", toolCall);
                }
                return; // End specific logic for web_search_wrapper

            }
            // --- End Handle Web Search Wrapper Call --- 
            else if (toolCall.name === 'web_search') { // Placeholder
                console.warn("Web search function execution - using placeholder result.");
                result = { info: `Web search for '${params?.query}' would be performed here.`, results: [] };
                updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) });
                 // Return here if web_search is handled differently and doesn't need generic sending below
                 // return; 
            } else {
                // Handle truly unknown functions
                throw new Error(`Unknown tool function: ${toolCall.name}`);
            }

            // --- Generic Response Handling (for get_weather, get_joke) --- 
            if (!result && response) { // Process fetch response if not already handled
                if (!response.ok) {
                    const errorText = await response.text().catch(() => "Failed to read error response");
                    throw new Error(`Tool API call failed (${response.status}): ${errorText}`);
                }
                result = await response.json();
                 updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) });
            }

        } catch (error) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            const errorMsg = error instanceof Error ? error.message : "Unknown tool execution error";
            result = { error: errorMsg }; // Set result to an error object
            updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
        }

        // --- Send result back (Generic for functions like get_weather, get_joke) ---
        // This block is skipped for file_search_wrapper due to the 'return' statement
        if (toolCall.call_id && !result?.error) {
            sendEvent({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: toolCall.call_id,
                    output: JSON.stringify(result),
                },
            });
            sendEvent({ type: "response.create" });
        } else if (!toolCall.call_id) {
            console.warn("No call_id found for tool execution", toolCall);
            // UI already updated with failure status in try/catch
        }

    }, [sendEvent, setRetrievedSocraticContext, setSocraticDialogueState]);

    // --- Effect to Trigger Context Retrieval --- 
    useEffect(() => {
        if (isSocraticModeActive && currentSocraticTopic && !retrievedSocraticContext && socraticDialogueState === 'retrieving_context') {
            console.log(`Socratic Mode: Retrieving context for topic "${currentSocraticTopic}"`);
            // Trigger the file search wrapper internally
            executeToolFunction({
                type: "function_call", // Simulate an internal call
                name: "file_search_wrapper",
                arguments: { query: currentSocraticTopic },
                // Use a specific prefix for the call_id to identify it internally
                call_id: `socratic-ctx-${Date.now()}`,
                item_id: `socratic-ctx-item-${Date.now()}` // Optional item ID
            });
        }
    }, [
        isSocraticModeActive,
        currentSocraticTopic,
        retrievedSocraticContext,
        socraticDialogueState,
        executeToolFunction // executeToolFunction is stable due to useCallback
    ]);

    const handleServerEvent = useCallback((event: RealtimeEvent) => {
        // console.log("Handling Server Event:", event.type, event); // Verbose logging
        switch (event.type) {
             case "session.created":
                console.log("Realtime session created event received:", event); // Log full event
                console.log("Inspecting event.session object:", event.session); // Log session object structure
                // const sessionId = event.session?.session_id; // session object appears empty
                // console.log("Realtime session created ID:", sessionId); // Check if ID is found now
                addTranscriptItem({
                    type: "message", role: "system", id: `session-start-${Date.now()}`,
                    content: [{ type: 'output_text', text: `Session Started` }] // Remove ID display
                } as MessageItem);
                break;

             case "session.ended":
                console.log("Realtime session ended:", event.data?.reason);
                addTranscriptItem({
                    type: "message", role: "system", id: `session-end-${Date.now()}`,
                    content: [{ type: 'output_text', text: `Session Ended: ${event.data?.reason || 'Server closed connection'}` }]
                } as MessageItem);
                // Note: cleanupConnection in the component should handle setting status to disconnected
                break;

            case "conversation.item.created": {
                const item = event.item;
                if (item.type === 'message' && item.role === 'user' && item.id) {
                    const text = item.content?.[0]?.text ?? "[Transcribing...]";
                    addTranscriptItem({ 
                        type: "message", role: "user", id: item.id, 
                        content: [{ type: 'input_text', text }] 
                    } as MessageItem);

                    // --- Socratic Topic Setting Logic --- 
                    const socraticState = useSocraticStore.getState(); // Get current Socratic state
                    if (socraticState.isSocraticModeActive && !socraticState.currentSocraticTopic && socraticState.socraticDialogueState === 'idle') {
                         // Assumption: First user message after activating Socratic mode sets the topic
                         // More robust: Could wait for transcription complete event or specific phrase?
                        if (text !== "[Transcribing...]") { // Wait for some actual text
                            console.log("Socratic Mode: Setting topic from first user message:", text);
                             setCurrentSocraticTopic(text); // Use the user message as the topic
                             setSocraticDialogueState('retrieving_context'); // Trigger context retrieval
                        }
                    }
                    // -------------------------------------
                }
                // Handle assistant messages
                else if (item.type === 'message' && item.role === 'assistant' && item.id) {
                     const text = item.content?.[0]?.text ?? "[Generating...]";
                     addTranscriptItem({ 
                         type: "message", role: "assistant", id: item.id, 
                         content: [{ type: 'output_text', text }] 
                     } as MessageItem);
                }
                // Handle tool calls if needed (though often handled by response.done)
                break;
            }

            case "conversation.item.input_audio_transcription.delta": {
                const itemId = event.item_id;
                if (itemId) {
                    // Ensure the message item exists before updating (might be created by item.created first)
                    const exists = useConversationStore.getState().chatMessages.some(m => m.id === itemId);
                    if (!exists) {
                        addTranscriptItem({ type: "message", role: "user", id: itemId, content: [{ type: 'input_text', text: '...' }] } as MessageItem);
                    }
                    // Update using the helper function
                    updateTranscriptItem(itemId, event.delta, true);
                }
                break;
            }

            case "conversation.item.input_audio_transcription.completed": {
                const itemId = event.item_id;
                const finalTranscript = !event.transcript || event.transcript.trim() === "" ? "[inaudible]" : event.transcript;
                if (itemId) {
                    updateTranscriptItem(itemId, finalTranscript, false); // Replace with final transcript

                    // --- Socratic Topic Setting Logic (Alternative: On Completion) --- 
                    const socraticState = useSocraticStore.getState();
                    if (socraticState.isSocraticModeActive && !socraticState.currentSocraticTopic && socraticState.socraticDialogueState === 'idle') {
                         console.log("Socratic Mode: Setting topic from completed transcript:", finalTranscript);
                         setCurrentSocraticTopic(finalTranscript);
                         setSocraticDialogueState('retrieving_context');
                    }
                    // -------------------------------------------------------------
                }
                break;
            }

            case "response.audio_transcript.delta": {
                const itemId = event.item_id;
                if (itemId) {
                    const exists = useConversationStore.getState().chatMessages.some(m => m.id === itemId);
                    if (!exists) {
                        // Assistant message might be created first by item.created, or create here
                         addTranscriptItem({ type: "message", role: "assistant", id: itemId, content: [{ type: 'output_text', text: '' }] } as MessageItem);
                    }
                    updateTranscriptItem(itemId, event.delta, true); // Append delta
                }
                break;
            }

            case "response.audio_transcript.done": {
                const itemId = event.item_id;
                console.log("Assistant transcript done for item:", itemId, event.transcript);
                if (itemId && event.transcript) {
                    updateTranscriptItem(itemId, event.transcript, false); // Replace with final transcript
                    // Optionally add to a separate conversation history for API calls if needed
                    // useConversationStore.getState().addConversationItem({ role: 'assistant', content: event.transcript });
                }
                break;
            }

            case "response.output_item.done": {
                 // Can be used to mark an item (e.g., assistant message) as fully processed
                 const itemId = event.item?.id;
                 if (itemId) {
                     console.log(`Output item done: ${itemId}`);
                     // Optionally update UI state for the item if needed
                     // updateItemStatus(itemId, 'DONE'); 
                 }
                 break;
             }

            case "response.done": {
                console.log("Full response done event received:", event.response);
                if (event.response?.output) {
                    event.response.output.forEach((outputItem: any) => {
                        // --- Trigger standard function calls --- 
                        if (outputItem.type === "function_call" && outputItem.name && outputItem.arguments) {
                            // Check if this is NOT the internal socratic context fetch
                            if (!outputItem.call_id?.startsWith('socratic-ctx-')) {
                                try {
                                    const parsedArgs = JSON.parse(outputItem.arguments);
                                    // Construct ToolCall object for execution
                                    const toolCallData: ToolCall = {
                                        type: "function_call",
                                        name: outputItem.name,
                                        arguments: parsedArgs, // Pass parsed arguments
                                        call_id: outputItem.call_id, // Essential for sending result back
                                        // Attempt to associate with a response item ID if available
                                        item_id: outputItem.item_id || event.response?.id || `tool-${outputItem.call_id || Date.now()}`
                                    };
                                    console.log(`[response.done] Triggering executeToolFunction for: ${toolCallData.name}`);
                                    executeToolFunction(toolCallData);
                                } catch (parseError) {
                                    console.error("[response.done] Failed to parse function call arguments:", parseError, outputItem.arguments);
                                    // Add error message to UI?
                                    addTranscriptItem({
                                        type: "message", role: "system", id: `error-parse-${Date.now()}`,
                                        content: [{ type: 'output_text', text: `Error parsing tool arguments for ${outputItem.name}` }]
                                    } as MessageItem);
                                }
                            } else {
                                console.log("[response.done] Skipping internal Socratic context fetch trigger.");
                            }
                        }
                        // --- Handle API File Search Call Output (If API does search directly) ---
                        else if (outputItem.type === "file_search_call") {
                            console.log("API File search call output received in response.done:", outputItem);
                            // Add UI update for API-driven file search if needed.
                             addTranscriptItem({ // Example UI update
                                 type: "tool_call",
                                 tool_type: "file_search_call", 
                                 id: outputItem.id || `fsc-api-${Date.now()}`,
                                 status: outputItem.status || "completed",
                                 queries: outputItem.queries,
                                 search_results: outputItem.search_results,
                                 call_id: outputItem.id,
                             } as FileSearchCallItem);
                        }
                        // --- Handle other output types if necessary --- 
                        // else if (outputItem.type === "message" && ...) { ... }
                    });
                }
                break;
            }

            case "error":
                console.error("Realtime API Error Event Received:", event); // Log the full error event
                // Adjust path to message based on actual error structure from logs
                const errorMessage = event.error?.message || event.data?.message || "Unknown API error"; 
                console.error("Parsed API Error Message:", errorMessage);
                addTranscriptItem({
                    type: "message", role: "system", id: `error-${Date.now()}`,
                    content: [{ type: 'output_text', text: `API Error: ${errorMessage}` }]
                } as MessageItem);
                // Consider calling cleanupConnection here if the error is fatal
                break;

            // --- Add other potentially useful event handlers --- 
            case 'input_audio_buffer.speech_started':
                console.log("User speech started.");
                // Update UI to show user is talking?
                break;
            case 'input_audio_buffer.speech_stopped':
                console.log("User speech stopped.");
                // Update UI?
                break;
            case 'output_audio_buffer.started':
                console.log("Assistant speaking started.");
                 // Update UI state (e.g., set isAssistantSpeaking(true) in component)
                break;
            case 'output_audio_buffer.stopped':
                console.log("Assistant speaking stopped.");
                 // Update UI state (e.g., set isAssistantSpeaking(false) in component)
                break;
            // --- Handle Argument Streaming Events --- 
            case 'response.function_call_arguments.delta':
                 console.log("Function call arguments delta:", event);
                 // TODO: Implement accumulation logic if needed
                 break;
            case 'response.function_call_arguments.done':
                 console.log("Function call arguments done:", event);
                 // Final arguments might be here, or rely on response.done
                 break;
            // Ignored events (less critical for basic functionality)
            case 'input_audio_buffer.committed':
            case 'session.updated':
            case 'rate_limits.updated':
            case 'response.created':
            case 'response.output_item.added':
            case 'response.content_part.added':
            case 'response.audio.done':
            case 'response.content_part.done':
                // console.log("Received less critical event:", event.type); 
                break;

            case 'response.audio_transcript.delta':
            case 'response.audio_transcript.done': {
                const itemId = event.item_id;
                const deltaOrText = event.type === 'response.audio_transcript.delta' 
                    ? event.delta ?? "" 
                    : event.type === 'response.audio_transcript.done' 
                        ? event.transcript ?? "" 
                        : "";
                const isDone = event.type === 'response.audio_transcript.done';

                if (itemId) {
                    // Find or create message item
                    const currentState = useConversationStore.getState();
                    let messageItem = currentState.chatMessages.find(m => m.id === itemId && m.type === 'message') as MessageItem | undefined;
                    if (!messageItem) {
                        messageItem = { type: "message", role: "assistant", id: itemId, content: [{ type: 'output_text', text: '' }] } as MessageItem;
                        addTranscriptItem(messageItem);
                    }
                    // Update text content
                    updateTranscriptItem(itemId, deltaOrText, !isDone);

                    // --- Handle Annotations --- 
                    let annotations: any[] | undefined;
                    if ('annotations' in event && Array.isArray(event.annotations)) {
                        annotations = event.annotations;
                    } else if ('content_part' in event && event.content_part && typeof event.content_part === 'object' && 'annotations' in event.content_part && Array.isArray(event.content_part.annotations)) {
                        annotations = event.content_part.annotations;
                    } // Add more checks if needed
                    
                    if (annotations && annotations.length > 0) {
                        console.log(`Received ${annotations.length} annotations for item ${itemId}:`, annotations);
                        useConversationStore.setState((state) => ({
                            chatMessages: state.chatMessages.map(msg => {
                                if (msg.id === itemId && msg.type === 'message' && msg.content?.[0]?.type === 'output_text') {
                                    const existingAnnotations = msg.content[0].annotations || [];
                                    const uniqueNewAnnotations = annotations!.filter((newAnn: any) => 
                                        !existingAnnotations.some((exAnn: any) => 
                                            exAnn.type === newAnn.type && exAnn.index === newAnn.index &&
                                            exAnn.start_offset === newAnn.start_offset && exAnn.end_offset === newAnn.end_offset
                                        )
                                    );
                                    if (uniqueNewAnnotations.length > 0) {
                                        const updatedContent = { ...msg.content[0], annotations: [...existingAnnotations, ...uniqueNewAnnotations] };
                                        return { ...msg, content: [updatedContent] };
                                    }
                                }
                                return msg;
                            })
                        }));
                    }
                    // --- End Handle Annotations ---
                }
                break;
            }

            default:
                 // Use exhaustive check if possible, or log unknowns
                 const unhandledEvent = event as any;
                 console.warn('Unhandled server event type:', unhandledEvent?.type, unhandledEvent);
                break;
        }
    }, [executeToolFunction, sendEvent, setCurrentSocraticTopic, setSocraticDialogueState]); // Include Socratic setters

    // Use a ref to ensure the callback passed to the effect always has the latest scope
    const handleServerEventRef = useRef(handleServerEvent);
    useEffect(() => {
        handleServerEventRef.current = handleServerEvent;
    }, [handleServerEvent]);

    return handleServerEventRef;
}
