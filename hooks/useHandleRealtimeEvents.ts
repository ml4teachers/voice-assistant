import { useRef, useCallback, useEffect } from "react";
import { RealtimeEvent, ToolCall } from "@/components/realtime-types";
import useConversationStore from "@/stores/useConversationStore";
// Temporarily import Annotation type, assuming it exists in annotations.tsx
// If not, define a placeholder type here.
import { Annotation } from "@/components/annotations";
import useToolsStore from "@/stores/useToolsStore";
import useSocraticStore /*, { SocraticEvaluation } */ from "@/stores/useSocraticStore"; 
// Remove getSocraticPromptForTopic as prompt generation is now fully backend driven
// import { getSocraticPromptForTopic } from '@/config/socratic-prompt';

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
const updateToolCallItem = (itemId: string, updates: Partial<FunctionCallItem | FileSearchCallItem>) => {
    useConversationStore.setState((state) => ({
        chatMessages: state.chatMessages.map(item => {
            if (item.id === itemId && item.type === 'tool_call') {
                return { ...item, ...updates } as Item; // Use Item type assertion
            }
            return item;
        })
    }));
};

// --- End Helper Functions ---

export function useHandleRealtimeEvents(sendEvent: (event: any) => void) {

    // REMOVED: Socratic state selectors no longer needed here for event handling logic
    /*
    const {
        isSocraticModeActive,
        currentSocraticTopic,
        retrievedSocraticContext,
        socraticDialogueState,
        setRetrievedSocraticContext,
        setSocraticDialogueState,
        setCurrentSocraticTopic,
        setCurrentTurnEvaluation,
        addCoveredExpectation,
        addEncounteredMisconception
    } = useSocraticStore.getState();
    */

    const executeToolFunction = useCallback(async (toolCall: ToolCall) => {
        const toolCallUiId = toolCall.item_id || `tool-${toolCall.call_id || Date.now()}`;
        console.log(`Executing tool: ${toolCall.name}`, toolCall.arguments);

        // Add initial tool call item to UI
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
            // --- File Search Wrapper Call ---
            else if (toolCall.name === 'file_search_wrapper') {
                console.log("File search wrapper function called:", toolCall.arguments);
                const query = toolCall.arguments?.query;

                if (!query) {
                    result = { error: "Missing query for file search wrapper" };
                    console.error(result.error);
                    updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                } else {
                    updateToolCallItem(toolCallUiId, {
                        status: "in_progress",
                        parsedArguments: toolCall.arguments,
                        output: JSON.stringify({ status: "calling backend wrapper...", query: query })
                    });
                    const currentVectorStoreId = useToolsStore.getState().vectorStore?.id;
                    if (!currentVectorStoreId) {
                        result = { error: "No vector store configured in client state" };
                        console.error(result.error);
                        updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                    } else {
                        try {
                            const apiUrl = `/api/functions/file_search_wrapper?query=${encodeURIComponent(query)}&vectorStoreId=${encodeURIComponent(currentVectorStoreId)}`;
                            const backendResponse = await fetch(apiUrl);
                            if (!backendResponse.ok) {
                                const errorText = await backendResponse.text().catch(() => 'Failed to read error text');
                                throw new Error(`Backend wrapper failed (${backendResponse.status}): ${errorText}`);
                            }
                            result = await backendResponse.json();
                            console.log("File search wrapper result from backend:", result);
                            updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) });
                        } catch (fetchError) {
                            console.error("Error calling file_search_wrapper backend:", fetchError);
                            const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown backend fetch error";
                            result = { error: errorMsg };
                            updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
                        }
                    }
                }
                // Send the result back
                if (toolCall.call_id) {
                    sendEvent({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            call_id: toolCall.call_id,
                            output: JSON.stringify(result),
                        },
                    });
                    sendEvent({ type: "response.create" });
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
            else if (toolCall.name === 'web_search') {
                // Placeholder - no change needed
                console.warn("Web search function execution - using placeholder result.");
                result = { info: `Web search for '${params?.query}' would be performed here.`, results: [] };
                updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) });
            } else {
                // Handle truly unknown functions
                throw new Error(`Unknown tool function: ${toolCall.name}`);
            }

            // --- Generic Response Handling (for get_weather, get_joke, web_search placeholder) ---
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

        // --- Send result back (Generic for functions like get_weather, get_joke, web_search) ---
        if (toolCall.call_id) { // Always try to send if call_id exists
            sendEvent({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: toolCall.call_id,
                    output: JSON.stringify(result), // Send result or error
                },
            });
             // Only request response if the tool call was successful
             if (!result?.error) {
                 sendEvent({ type: "response.create" });
             }
        } else {
            console.warn("No call_id found for tool execution", toolCall);
        }

    }, [sendEvent]);

    // REMOVED: useEffect to trigger context retrieval (handle this differently if needed)
    /*
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
    */

    const handleServerEvent = useCallback((event: RealtimeEvent) => {
        // console.log("Handling Server Event:", event.type, event); // Verbose logging
        switch (event.type) {
             case "session.created":
                console.log("Realtime session created event received:", event);
                console.log("Inspecting event.session object:", event.session);
                // "Session Started" message already removed
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
                         // setCurrentSocraticTopic(finalTranscript);
                         // setSocraticDialogueState('retrieving_context');
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
                const finalTranscript = event.transcript ?? "";
                console.log(`Assistant transcript done (ID: ${itemId}): ${finalTranscript.substring(0,100)}...`);
        
                if (!itemId) break;
        
                // Update or Add the final message item using the raw transcript for now.
                // The function call handler below will potentially replace this with just the question.
                const currentState = useConversationStore.getState();
                const exists = currentState.chatMessages.some(m => m.id === itemId);
                if (!exists) {
                     addTranscriptItem({
                         type: "message", role: "assistant", id: itemId,
                         content: [{ type: 'output_text', text: finalTranscript }]
                     } as MessageItem);
                } else {
                    updateTranscriptItem(itemId, finalTranscript, false);
                }
        
                 // Handle annotations (No change needed here)
                 const annotations = (event as any).annotations || (event as any).content_part?.annotations;
                 if (annotations && Array.isArray(annotations) && annotations.length > 0) {
                      console.log(`Handling ${annotations.length} annotations for item ${itemId}`);
                      useConversationStore.setState((state) => ({ 
                        chatMessages: state.chatMessages.map(msg => {
                            if (msg.id === itemId && msg.type === 'message' && msg.content?.[0]?.type === 'output_text') {
                                const existingAnnotations = msg.content[0].annotations || [];
                                // Basic duplicate check based on index and type (adjust if needed)
                                const uniqueNewAnnotations = annotations.filter((newAnn: any) => 
                                    !existingAnnotations.some((exAnn: any) => 
                                        exAnn.index === newAnn.index && exAnn.type === newAnn.type
                                        // Add more properties for stricter uniqueness check if required
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
                        // --- Handle Standard Function Calls --- 
                        if (outputItem.type === "function_call") { // Simplified: Handle ANY function call this way now
                            // REMOVED: Specific check for submit_socratic_evaluation
                            // if (outputItem.name !== "submit_socratic_evaluation") {
                                try {
                                    const parsedArgs = JSON.parse(outputItem.arguments);
                                    const toolCallData: ToolCall = {
                                        type: "function_call",
                                        name: outputItem.name,
                                        arguments: parsedArgs,
                                        call_id: outputItem.call_id,
                                        item_id: outputItem.item_id || event.response?.id || `tool-${outputItem.call_id || Date.now()}`
                                    };
                                    console.log(`[response.done] Triggering standard executeToolFunction for: ${toolCallData.name}`);
                                    executeToolFunction(toolCallData);
                                } catch (parseError) {
                                    console.error(`[response.done] Failed to parse args for ${outputItem.name}:`, parseError, outputItem.arguments);
                                }
                            // }
                        }
                        // REMOVED: Handler for submit_socratic_evaluation
                        /*
                        else if (outputItem.type === "function_call" && outputItem.name === "submit_socratic_evaluation") {
                            // ... removed logic to update EMT state and transcript ...
                        }
                        */
                        // --- Handle API File Search Call Output (Existing) --- 
                        else if (outputItem.type === "file_search_call") {
                             console.log("API File search call output received in response.done:", outputItem);
                              addTranscriptItem({
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

            // --- Handle Pure Text Streaming --- 
            case "response.text.delta": {
                const itemId = event.item_id;
                const delta = event.delta ?? "";
                console.log(`Handling text.delta for item ${itemId}: "${delta}"`);
                if (itemId) {
                    // Ensure item exists (likely assistant message)
                    const exists = useConversationStore.getState().chatMessages.some(m => m.id === itemId);
                    if (!exists) {
                        addTranscriptItem({ 
                            type: "message", role: "assistant", id: itemId, 
                            content: [{ type: 'output_text', text: '' }] 
                        } as MessageItem);
                    }
                    // Append delta
                    updateTranscriptItem(itemId, delta, true);
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
    }, [executeToolFunction, sendEvent]); // REMOVED: Socratic setters from dependencies

    // Use a ref to ensure the callback passed to the effect always has the latest scope
    const handleServerEventRef = useRef(handleServerEvent);
    useEffect(() => {
        handleServerEventRef.current = handleServerEvent;
    }, [handleServerEvent]);

    return handleServerEventRef;
}
