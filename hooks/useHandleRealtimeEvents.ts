import { useRef, useCallback, useEffect } from "react";
import { RealtimeEvent, ToolCall } from "@/components/realtime-types";
import useConversationStore from "@/stores/useConversationStore";

// --- Temporary Type Definitions (replace imports from @/lib/assistant) ---
// Define placeholder types here. Refine or move to a central types file later.
interface BaseItem {
    id: string;
    type: string;
}

export interface MessageItem extends BaseItem {
    type: "message";
    role: "user" | "assistant" | "system";
    content: Array<{ type: string; text?: string }>;
}

export interface ToolCallItem extends BaseItem {
    type: "tool_call";
    tool_type: "function_call"; // Or other tool types if applicable
    name: string;
    arguments: string; // JSON stringified arguments
    parsedArguments?: any; // The parsed arguments object
    status: "in_progress" | "completed" | "failed";
    output?: string; // JSON stringified output or error
    call_id?: string; // OpenAI call ID
}

export type Item = MessageItem | ToolCallItem;
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
const updateToolCallItem = (itemId: string, updates: Partial<ToolCallItem>) => {
    useConversationStore.setState((state) => ({
        chatMessages: state.chatMessages.map(item => {
            if (item.id === itemId && item.type === 'tool_call') {
                // Merge existing item with updates
                return { ...item, ...updates } as ToolCallItem;
            }
            return item;
        })
    }));
};

// --- End Helper Functions ---

export function useHandleRealtimeEvents(sendEvent: (event: any) => void) {

    const executeToolFunction = useCallback(async (toolCall: ToolCall) => {
        // Ensure item_id exists for UI updates, generate one if needed based on call_id
        const toolCallUiId = toolCall.item_id || `tool-${toolCall.call_id || Date.now()}`;
        console.log(`Executing tool: ${toolCall.name}`, toolCall.arguments);

        // Add initial tool call item to UI
        addTranscriptItem({
            type: "tool_call",
            id: toolCallUiId,
            tool_type: "function_call",
            status: "in_progress",
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments), // Store original args string if needed
            parsedArguments: toolCall.arguments, // Store parsed args
            call_id: toolCall.call_id,
            // output: undefined, // Initially no output
        } as ToolCallItem);

        let result: any;
        try {
            const params = toolCall.arguments; // Arguments should already be parsed object from handleServerEvent
            let response: Response | null = null; // Initialize response as null

            // --- Route to appropriate API endpoint based on tool name --- 
            if (toolCall.name === 'get_weather') {
                const query = new URLSearchParams(params as any).toString();
                response = await fetch(`/api/functions/get_weather?${query}`);
            } else if (toolCall.name === 'get_joke') {
                response = await fetch(`/api/functions/get_joke`);
            } else if (toolCall.name === 'file_search') {
                console.warn("File search function execution - using placeholder result.");
                // TODO: Implement actual API call to a backend endpoint for file search
                // Example: 
                // const query = new URLSearchParams({ query: params.query }).toString();
                // response = await fetch(`/api/functions/file_search?${query}`); 
                result = { info: `File search for '${params?.query}' would be performed here.`, files_found: [] }; // Placeholder
            } else if (toolCall.name === 'web_search') {
                console.warn("Web search function execution - using placeholder result.");
                // TODO: Implement actual API call to a backend endpoint for web search
                // Example:
                // const query = new URLSearchParams({ query: params.query }).toString();
                // response = await fetch(`/api/functions/web_search?${query}`);
                result = { info: `Web search for '${params?.query}' would be performed here.`, results: [] }; // Placeholder
            } else {
                throw new Error(`Unknown tool function: ${toolCall.name}`);
            }

            // --- Process fetch response if result wasn't set directly (placeholder case) ---
            if (!result && response) {
                if (!response.ok) {
                    const errorText = await response.text().catch(() => "Failed to read error response");
                    throw new Error(`Tool API call failed (${response.status}): ${errorText}`);
                }
                result = await response.json();
            }

            console.log(`Tool ${toolCall.name} result:`, result);
            // Update UI with completed status and result
            updateToolCallItem(toolCallUiId, { status: "completed", output: JSON.stringify(result, null, 2) }); // Pretty print output

        } catch (error) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            const errorMsg = error instanceof Error ? error.message : "Unknown tool execution error";
            result = { error: errorMsg }; // Set result to an error object
            // Update UI with failed status and error message
            updateToolCallItem(toolCallUiId, { status: "failed", output: JSON.stringify(result) });
        }

        // --- Send result back to Realtime API --- 
        if (toolCall.call_id) { // Only send back if there's a call_id from OpenAI
            sendEvent({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output", // Correct type based on API error message
                    call_id: toolCall.call_id,
                    output: JSON.stringify(result), // Output MUST be a string
                },
            });
            // Optionally trigger immediate response generation after sending tool result
            sendEvent({ type: "response.create" }); // Re-enable this line
        } else {
            console.warn("No call_id found for tool execution, cannot send result back to OpenAI.", toolCall);
        }

    }, [sendEvent]); // Include dependencies for useCallback

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
                // Only add if it's a message and doesn't exist yet
                if (item.type === 'message' && item.role && item.id) {
                    const text = item.content?.[0]?.text ?? (item.role === 'user' ? "[Transcribing...]" : "[Generating...]");
                    addTranscriptItem({ // Use helper to avoid duplicates
                        type: "message", role: item.role, id: item.id,
                        content: [{ type: item.content?.[0]?.type === 'input_text' ? 'input_text' : 'output_text', text }]
                    } as MessageItem);
                }
                 // Handle other item types like tool_call creation if needed, though often handled by response.done
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
                    // Optionally add to a separate conversation history for API calls if needed
                    // useConversationStore.getState().addConversationItem({ role: 'user', content: finalTranscript });
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
                        // --- Handle Function Calls --- 
                        if (outputItem.type === "function_call" && outputItem.name && outputItem.arguments) {
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
                                executeToolFunction(toolCallData);
                            } catch (parseError) {
                                console.error("Failed to parse function call arguments:", parseError, outputItem.arguments);
                                // TODO: Handle parse error - maybe send error result back to API?
                                // Find a way to display this error in the UI
                                addTranscriptItem({
                                    type: "message", role: "system", id: `error-parse-${Date.now()}`,
                                    content: [{ type: 'output_text', text: `Error parsing tool arguments for ${outputItem.name}` }]
                                } as MessageItem);
                            }
                        }
                        // --- Handle other output item types if necessary --- 
                        // e.g., if the response includes final text alongside function calls
                        else if (outputItem.type === "message" && outputItem.role === 'assistant') {
                             // This might duplicate response.audio_transcript.done, handle carefully
                             console.log("Assistant message in response.done output:", outputItem);
                             // Ensure it's not already added/updated by transcript events
                             // addTranscriptItem(...) or updateTranscriptItem(...) if needed
                        }
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

            default:
                 // Use exhaustive check if possible, or log unknowns
                 const unhandledEvent = event as any;
                 console.warn('Unhandled server event type:', unhandledEvent?.type, unhandledEvent);
                break;
        }
    }, [executeToolFunction]); // executeToolFunction is the main dependency

    // Use a ref to ensure the callback passed to the effect always has the latest scope
    const handleServerEventRef = useRef(handleServerEvent);
    useEffect(() => {
        handleServerEventRef.current = handleServerEvent;
    }, [handleServerEvent]);

    return handleServerEventRef;
}
