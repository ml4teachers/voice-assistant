"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import useConversationStore from '@/stores/useConversationStore';
import { createRealtimeConnection } from '@/lib/realtime/connection'; // Use the new connection logic
import { useHandleRealtimeEvents } from '@/hooks/useHandleRealtimeEvents'; // Use the new event handler hook
import { getTools } from '@/lib/tools/tools'; // Use the adapted tool getter
import { DEVELOPER_PROMPT, MODEL } from '@/config/constants'; // Import MODEL as well
import { RealtimeEvent } from './realtime-types';
import ErrorDisplay from './ErrorDisplay';
import ChatControls from './ChatControls';
// Import Message and ToolCall components for rendering the transcript
import Message from './message'; // Assuming this component exists
import ToolCall from './tool-call'; // Assuming this component exists
// Use the Item type defined/imported in the hook or centrally
// Import all necessary specific item types
import { Item, MessageItem, FunctionCallItem, FileSearchCallItem } from '@/hooks/useHandleRealtimeEvents'; // Adjust path if types moved
import useToolsStore from '@/stores/useToolsStore';


type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export default function RealtimeChat() {
    const { chatMessages, rawSet: rawSetConversation } = useConversationStore(); // Get messages and rawSet from Zustand
    const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const remoteAudioElement = useRef<HTMLAudioElement | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    // State for speaking indicator, managed by the event hook potentially
    const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for scrolling

    // Function to send events *to* the DataChannel
    const sendEvent = useCallback((event: any) => {
        if (dcRef.current && dcRef.current.readyState === 'open') {
            console.log(">>> Sending Client Event:", event.type, JSON.stringify(event));
            dcRef.current.send(JSON.stringify(event));
        } else {
            console.error("Cannot send event, DataChannel not open.", event.type);
        }
    }, []);

    // Hook to handle incoming server events
    const handleServerEventRef = useHandleRealtimeEvents(sendEvent);

    // Effect to update speaking state based on events (example)
    useEffect(() => {
        // Logic to derive isAssistantSpeaking from chatMessages or specific events
        // This might need refinement based on how the hook updates the store
        const lastMessage = chatMessages[chatMessages.length - 1];
        // Example crude logic: assume speaking if last message is assistant and recent
        // A better approach is to use output_audio_buffer.started/stopped events in the hook
        // to update a dedicated state or a property on the MessageItem.
        // setIsAssistantSpeaking(lastMessage?.role === 'assistant' && ...);

        // Also listen for the specific events in the hook to set state:
        // In useHandleRealtimeEvents:
        // case 'output_audio_buffer.started': setIsAssistantSpeaking(true); break;
        // case 'output_audio_buffer.stopped': setIsAssistantSpeaking(false); break;
        // Need to pass setIsAssistantSpeaking to the hook or manage state differently.

    }, [chatMessages]);

    // Effect to scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Cleanup function
    const cleanupConnection = useCallback((errorMsg: string | null = null) => {
        console.log("Cleaning up connection...", errorMsg ? `Reason: ${errorMsg}` : '');
        if (errorMsg) setLastError(errorMsg);
        else setLastError(null); // Clear error if cleaning up normally

        if (dcRef.current) {
            dcRef.current.onmessage = null; dcRef.current.onopen = null; dcRef.current.onclose = null; dcRef.current.onerror = null;
            if (dcRef.current.readyState !== 'closed') {
                try { dcRef.current.close(); } catch (e) { console.error("Error closing dc:", e); }
            }
            dcRef.current = null;
        }
        if (pcRef.current) {
            pcRef.current.onicecandidate = null; pcRef.current.onconnectionstatechange = null; pcRef.current.ontrack = null;
            // Stop microphone tracks by stopping the sender's track
            pcRef.current.getSenders().forEach(sender => sender.track?.stop());
            if (pcRef.current.connectionState !== 'closed') {
                try { pcRef.current.close(); } catch (e) { console.error("Error closing pc:", e); }
            }
            pcRef.current = null;
        }
        if (remoteAudioElement.current) {
             remoteAudioElement.current.srcObject = null;
             remoteAudioElement.current.pause(); // Explicitly pause
        }

        setSessionStatus(errorMsg ? 'ERROR' : 'DISCONNECTED');
        setIsAssistantSpeaking(false); // Reset speaking state

    }, []); // Dependencies: state setters if they cause issues, but likely fine

    // Function to start the session
    const startSession = useCallback(async () => {
        if (sessionStatus !== 'DISCONNECTED' && sessionStatus !== 'ERROR') {
            console.warn("Session already connecting or connected.");
            return;
        }
        console.log("Attempting to start Realtime session...");
        setIsAssistantSpeaking(false);
        setLastError(null);
        setSessionStatus('CONNECTING');
        // Clear previous chat history except initial message
        // rawSetConversation({ chatMessages: [useConversationStore.getState().chatMessages[0]] }); // Keep only initial message
        rawSetConversation({ chatMessages: [] }); // Start fresh

        // Ensure audio element exists (moved from original code)
        if (!remoteAudioElement.current) {
            console.log("Creating audio element for playback.");
            remoteAudioElement.current = new Audio();
            remoteAudioElement.current.autoplay = true;
            remoteAudioElement.current.muted = false;
            // Use setAttribute for playsInline to avoid TypeScript error
            remoteAudioElement.current.setAttribute('playsinline', 'true');
        }

        // Prepare tools list for backend session creation
        const toolsForBackend = getTools(); // Get the defined tools (incl. file_search wrapper)
        // Remove tool_resources preparation, no longer needed for backend call
        /*
        const { fileSearchEnabled, vectorStore } = useToolsStore.getState();
        const toolResourcesForBackend = (fileSearchEnabled && vectorStore?.id) 
            ? { file_search: { vector_store_ids: [vectorStore.id] } } 
            : null;
        */

        // Pass ONLY tools list to createRealtimeConnection
        const connection = await createRealtimeConnection(
            remoteAudioElement, 
            toolsForBackend
            // toolResourcesForBackend // <-- REMOVED
        );

        if (!connection) {
            cleanupConnection("Failed to create WebRTC connection");
            return;
        }

        pcRef.current = connection.pc;
        dcRef.current = connection.dc;

        // --- Setup event listeners for the connection --- 
        dcRef.current.onmessage = (event: MessageEvent) => {
            try {
                const serverEvent = JSON.parse(event.data) as RealtimeEvent;
                // Pass event to the handler hook
                handleServerEventRef.current(serverEvent);
            } catch (e) {
                 console.error("Failed to parse server event:", e, event.data);
                 // Maybe display a generic parse error in UI?
                 setLastError("Error processing message from server.");
            }
        };

        dcRef.current.onopen = () => {
            console.log("DataChannel opened, sending session.update");
            setSessionStatus('CONNECTED');
            setLastError(null); // Clear any previous error on successful connect

            // --- Send initial session configuration --- 
            // Get current tool status and vector store from Zustand
            const { fileSearchEnabled, vectorStore } = useToolsStore.getState();
            const tools = getTools(); // Get the updated tool list

            const initialSessionUpdate = {
                type: "session.update",
                session: {
                    // Modalities and formats
                    modalities: ["audio", "text"], // Enable both audio and text interaction
                    input_audio_format: "pcm16", // Common format, ensure mic provides this
                    output_audio_format: "pcm16", // Format for audio synthesis output
                    input_audio_transcription: { model: "whisper-1" }, // Transcription model
                    // Instructions and voice
                    instructions: DEVELOPER_PROMPT,
                    voice: "shimmer", // Example voice, choose from available options
                    // Turn detection settings (Crucial for voice conversations)
                    turn_detection: {
                        type: "server_vad", // Use server-side Voice Activity Detection
                        threshold: 0.5, // Adjust sensitivity as needed
                        silence_duration_ms: 800, // Duration of silence to detect end of turn
                        create_response: true, // Automatically trigger response after silence
                    },
                    tools: tools, // <-- This should be the ONLY tool configuration parameter
                },
            };
            console.log("Sending final session.update payload (only using tools array):", JSON.stringify(initialSessionUpdate, null, 2)); // Finales Logging
            sendEvent(initialSessionUpdate);

            // Optional: Send an initial event to potentially greet the user
            // sendEvent({ type: "response.create" }); // Let the assistant start
        };

        dcRef.current.onclose = () => {
             console.log("DataChannel closed.");
             // Only cleanup if the session wasn't intentionally stopped or already in error state
             if (sessionStatus !== 'DISCONNECTED' && sessionStatus !== 'ERROR') {
                 cleanupConnection('Data channel closed unexpectedly');
             }
         };

        dcRef.current.onerror = (event) => {
             // The event object for onerror is RTCErrorEvent, which might have more details
             const errorEvent = event as RTCErrorEvent;
             console.error("DataChannel error:", errorEvent?.error || event);
             cleanupConnection(`Data channel error: ${errorEvent?.error?.message || 'Unknown DC error'}`);
         };

        pcRef.current.onconnectionstatechange = () => {
            const state = pcRef.current?.connectionState;
            console.log("PeerConnection state changed:", state);
             if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                 // Avoid redundant cleanups if already handled by dc.onclose or stopSession
                 if (sessionStatus !== 'DISCONNECTED' && sessionStatus !== 'ERROR') {
                    cleanupConnection(`Connection transitioned to ${state}`);
                }
             }
             // Handle 'connected' state if needed (e.g., clear specific errors)
             if (state === 'connected') {
                 setLastError(null); // Clear errors when fully connected
             }
         };

         // Handle ICE candidates (optional but good practice for debugging)
         pcRef.current.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
             if (event.candidate) {
                 // console.log('Local ICE Candidate:', event.candidate.sdpMid, event.candidate.sdpMLineIndex);
             } else {
                 // console.log('End of ICE candidates.');
             }
         };

    }, [sessionStatus, cleanupConnection, sendEvent, handleServerEventRef, rawSetConversation]);

    // Function to stop the session
    const stopSession = useCallback(() => {
        console.log("Stopping session manually...");
        if (dcRef.current && dcRef.current.readyState === 'open') {
            sendEvent({ type: "session.end" }); // Gracefully end session on server first
        }
        // Cleanup immediately regardless of whether session.end was sent
        cleanupConnection();
    }, [cleanupConnection, sendEvent]);

    // Cleanup on component unmount
    useEffect(() => {
        // Store refs in variables to use in the cleanup function's closure
        const pc = pcRef.current;
        const dc = dcRef.current;
        return () => {
            console.log("RealtimeChat component unmounting. Cleaning up refs:", { pcExists: !!pc, dcExists: !!dc });
            // Only run full cleanup if connection refs were actually set during the component's lifecycle.
            // This prevents premature cleanup during React Strict Mode's mount-unmount-mount cycle.
            if (pc || dc) {
                cleanupConnection("Component unmounted");
            } else {
                console.log("Skipping cleanup on unmount as connection refs were null.");
            }
        };
        // Dependency array: cleanupConnection itself depends on state setters, but the function identity is stable due to useCallback.
        // We don't need sessionStatus here as the check relies on the refs.
    }, [cleanupConnection]);

    // --- Render UI --- 
    return (
         <div className="flex flex-col h-[calc(100vh-4rem)] p-4 border rounded-lg shadow-md max-w-4xl mx-auto bg-gray-50">
            <h2 className="text-xl font-semibold text-center mb-2">Realtime Voice Assistant</h2>
            <ErrorDisplay lastError={lastError} />

            {/* Chat Controls */}
            <div className="my-4 flex-shrink-0">
                <ChatControls
                    isConnected={sessionStatus === 'CONNECTED'}
                    isConnecting={sessionStatus === 'CONNECTING'}
                    isSpeaking={isAssistantSpeaking} // Pass speaking state derived from events/hook
                    currentUtterance={""} // Placeholder, user utterance is handled internally now
                    startSession={startSession}
                    stopSession={stopSession}
                />
            </div>

            {/* Transcript Display Area */}
            <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 border rounded-md bg-white shadow-inner mb-4 min-h-[300px]">
                <div className="space-y-4">
                    {chatMessages.map((item: Item) => (
                        <React.Fragment key={item.id}> 
                            {/* Render Message component if item type is message */}
                            {item.type === "message" && <Message message={item as MessageItem} />} 
                            {/* Render ToolCall component if item type is tool_call */}
                            {item.type === "tool_call" && <ToolCall toolCall={item} />} 
                            {/* Cast inside ToolCall component handles FunctionCallItem/FileSearchCallItem */}
                        </React.Fragment>
                    ))}
                    {/* Display a thinking indicator while connecting or waiting */} 
                    {sessionStatus === 'CONNECTING' && <div className="text-center text-gray-500 italic">Connecting...</div>}
                </div>
            </div>

            {/* Audio Element for Playback (Keep it rendered but hidden) */} 
             <audio ref={remoteAudioElement} hidden playsInline />
        </div>
    );
}
