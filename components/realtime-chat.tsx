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
// import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea - Temporarily commented out
import { cn } from "@/lib/utils"; // Import cn utility
import { MicIcon } from "lucide-react"; // Import MicIcon for permission button


type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
type PermissionStatus = "prompt" | "granted" | "denied";

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
    const [micPermission, setMicPermission] = useState<PermissionStatus>("prompt");
    const localStreamRef = useRef<MediaStream | null>(null); // Ref to store the stream
    // Get Socratic Mode Status from the store directly in the component body
    const isSocraticModeEnabled = useToolsStore((state) => state.isSocraticModeEnabled);

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

    // Check initial permission status on mount
    useEffect(() => {
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
             setMicPermission(permissionStatus.state);
             permissionStatus.onchange = () => {
                 setMicPermission(permissionStatus.state);
             };
        }).catch(err => {
             console.warn("Could not query microphone permission status:", err);
             // Assume prompt if query fails
             setMicPermission("prompt"); 
        });
    }, []);

    // --- Function to request microphone permission --- 
    const requestMicrophoneAccess = useCallback(async () => {
         console.log("Requesting microphone access...");
         try {
            // Stop any existing tracks before requesting new stream
            localStreamRef.current?.getTracks().forEach(track => track.stop());

             const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
             localStreamRef.current = stream; // Store the stream
             setMicPermission("granted");
             setLastError(null); // Clear potential previous denial error
             console.log("Microphone access granted.");
             return stream;
         } catch (err) {
             console.error("Error getting user media:", err);
             setMicPermission("denied");
             setLastError("Microphone access denied. Please grant permission in your browser settings.");
             return null;
         }
     }, []);
     // ---------------------------------------------------

    // Cleanup function - also stop local tracks
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

        // Stop local microphone tracks
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        // Optionally reset permission state if needed, or keep it
        // setMicPermission("prompt"); 

        setSessionStatus(errorMsg ? 'ERROR' : 'DISCONNECTED');
        setIsAssistantSpeaking(false);

    }, []); // Dependencies: state setters if they cause issues, but likely fine

    // Function to start the session - Modified to handle stream acquisition properly
    const startSession = useCallback(async () => {
        // 1. Check Mic Permission First
        if (micPermission !== "granted") {
            console.warn("Microphone permission not granted. Cannot start session.");
            setLastError("Please grant microphone permission first.");
            // Optionally trigger request here if not already prompted by UI
            // if (micPermission === 'prompt') await requestMicrophoneAccess();
            return;
        }

        // 2. Ensure we have a MediaStream
        let currentStream = localStreamRef.current;
        if (!currentStream) {
            console.warn("Permission granted, but media stream reference is missing. Attempting to acquire...");
            currentStream = await requestMicrophoneAccess(); // Await the acquisition
            if (!currentStream) {
                // Request failed or was denied again
                console.error("Failed to acquire media stream even after permission was granted.");
                cleanupConnection("Failed to acquire necessary media stream.");
                // setLastError is handled by requestMicrophoneAccess or cleanupConnection
                return;
            }
            // Store the newly acquired stream
            localStreamRef.current = currentStream;
            console.log("Media stream acquired and stored in ref.");
        }

        // 3. Check Session Status
        if (sessionStatus !== 'DISCONNECTED' && sessionStatus !== 'ERROR') {
            console.warn("Session already connecting or connected.");
            return;
        }

        // 4. Proceed with Connection Setup
        console.log("Attempting to start Realtime session (mic granted, stream available)...", { streamId: currentStream.id });
        setIsAssistantSpeaking(false);
        setLastError(null);
        setSessionStatus('CONNECTING');
        rawSetConversation({ chatMessages: [] });

        if (!remoteAudioElement.current) {
            console.log("Creating audio element for playback.");
            remoteAudioElement.current = new Audio();
            remoteAudioElement.current.autoplay = true; 
            remoteAudioElement.current.muted = false; 
            remoteAudioElement.current.setAttribute('playsinline', 'true');
        }

        const toolsForBackend = getTools();

        // Pass the now guaranteed valid mediaStream
        const connection = await createRealtimeConnection(
            remoteAudioElement,
            toolsForBackend,
            currentStream // Use the stream variable we ensured is valid
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
            setLastError(null);

            // --- Dynamically select the prompt ---
            const tools = getTools();
            // Initial prompt: Use DEVELOPER_PROMPT. Socratic prompt will be set via session.update later if mode is active.
            const currentInstructions = DEVELOPER_PROMPT;

            // console.log(`Using instructions: ${isSocraticModeEnabled ? 'SOCRATIC' : 'DEVELOPER'}`); // Log statement might be misleading initially
            console.log(`Initial instructions: DEVELOPER`);
            // ---------------------------------------

            const initialSessionUpdate = {
                type: "session.update",
                session: {
                    modalities: ["audio", "text"],
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16",
                    input_audio_transcription: { model: "whisper-1" },
                    instructions: currentInstructions, // <-- Use the selected prompt
                    voice: "shimmer", // Or another voice like "sage"
                    turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        silence_duration_ms: 800,
                        create_response: true,
                    },
                    tools: tools,
                    // vector_store_ids are handled via wrapper now
                },
            };
            console.log("Sending session.update with payload:", JSON.stringify(initialSessionUpdate, null, 2));
            sendEvent(initialSessionUpdate);
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

    }, [
        sessionStatus,
        micPermission,
        cleanupConnection,
        sendEvent,
        handleServerEventRef,
        rawSetConversation,
        requestMicrophoneAccess,
        isSocraticModeEnabled
    ]);

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

    // --- Add function to clear conversation ---
    const clearConversation = useCallback(() => {
        console.log("Clearing conversation history.");
        // Reset chat messages, potentially keep initial system message if desired
        // rawSetConversation({ chatMessages: [INITIAL_SYSTEM_MESSAGE] }); 
        rawSetConversation({ chatMessages: [] }); // Clears completely
    }, [rawSetConversation]);
    // ------------------------------------------

    // --- Render UI --- 
    return (
         // Main container: Use flex column, set height (e.g., full screen height minus header/padding if needed)
         // Using h-full assumes parent provides height context. Adjust if needed.
         <div className={cn("flex flex-col h-full p-4 gap-4 bg-background")}>
             {/* Limit max width and center content */}
             <div className="max-w-4xl w-full mx-auto flex flex-col h-full gap-4">
                <h2 className="text-xl font-semibold text-center text-foreground flex-shrink-0">Realtime Voice Assistant</h2>
                <ErrorDisplay lastError={lastError} />

                {/* Chat Controls - Conditionally disable Start button, add Permission button */}
                <div className="flex-shrink-0">
                    <ChatControls
                        isConnected={sessionStatus === 'CONNECTED'}
                        isConnecting={sessionStatus === 'CONNECTING'}
                        isSpeaking={isAssistantSpeaking}
                        currentUtterance={""}
                        startSession={startSession}
                        stopSession={stopSession}
                        clearConversation={clearConversation}
                        // Pass permission status and request function
                        micPermission={micPermission} 
                        requestMicPermission={requestMicrophoneAccess}
                    />
                </div>

                {/* Transcript Display Area */} 
                <div 
                    ref={chatContainerRef} 
                    className={cn(
                        "flex-grow rounded-md bg-card", 
                        "h-0 min-h-[200px]", 
                        "overflow-y-auto p-4 space-y-4" 
                    )}
                >
                    {chatMessages.map((item: Item) => (
                        <React.Fragment key={item.id}> 
                            {item.type === "message" && <Message message={item as MessageItem} />} 
                            {item.type === "tool_call" && <ToolCall toolCall={item} />} 
                        </React.Fragment>
                    ))}
                    {sessionStatus === 'CONNECTING' && 
                        <div className="flex justify-center items-center p-4">
                             <div className="text-center text-muted-foreground italic">Connecting...</div>
                        </div>
                     }
                </div>

                {/* Audio Element for Playback (Keep it rendered but hidden) */} 
                 <audio ref={remoteAudioElement} hidden playsInline />
             </div>
         </div>
    );
}
