"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import useSocraticStore from '@/stores/useSocraticStore'; // Import the Socratic store
import useVoiceStore from '@/stores/useVoiceStore'; // Import the Voice store
import { cn } from "@/lib/utils"; // Import cn utility
import { MicIcon, MessageSquareQuoteIcon } from "lucide-react"; // Import MicIcon and an icon for the opener
import { Button } from "@/components/ui/button"; // Import Button component
// --- Import VoiceOnlyView normally ---
import VoiceOnlyView from './VoiceOnlyView';
import { useAudioFrequencyData } from '@/hooks/useAudioVolumeAnalyzer'; // Use the RENAMED hook
import { Tool } from './realtime-types';
// import { useToast } from "@/components/ui/use-toast"; // Unused

// Define view modes
type ViewMode = "transcript" | "voiceOnly";

type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
type PermissionStatus = "prompt" | "granted" | "denied";

// Define Props interface for RealtimeChat
interface RealtimeChatProps {
    viewMode: ViewMode;
}

// Define the schema for our evaluation tool
/*
const socraticEvaluationToolSchema = {
    type: "function" as const,
    name: "submit_socratic_evaluation",
    description: "Submits the tutor's evaluation of the user's response and the next question.",
    parameters: {
        type: "object" as const,
        properties: {
            evaluation: {
                type: "string" as const,
                description: "Brief, encouraging evaluation of the user's input based on context, expectations, and misconceptions."
            },
            matched_expectations: {
                type: "array" as const,
                items: { type: "string" as const },
                description: "List of specific EXPECTATION strings (from the prompt) that the user's response correctly addressed."
            },
            triggered_misconceptions: {
                type: "array" as const,
                items: { type: "string" as const },
                description: "List of specific MISCONCEPTION strings (from the prompt) that the user's response seemed to indicate."
            },
            follow_up_question: {
                type: "string" as const,
                description: "The next Socratic question to ask the user."
            }
        },
        required: ["evaluation", "matched_expectations", "triggered_misconceptions", "follow_up_question"],
        additionalProperties: false
    },
};
*/

export default function RealtimeChat({ viewMode }: RealtimeChatProps) {
    const { chatMessages, rawSet: rawSetConversation } = useConversationStore(); // Get messages and rawSet from Zustand
    // --- Selectors for Socratic state (primarily for UI now) ---
    const isSocraticModeActiveUI = useSocraticStore((state) => state.isSocraticModeActive);
    const selectedSocraticMode = useSocraticStore((state) => state.selectedSocraticMode);
    const currentSocraticTopic = useSocraticStore((state) => state.currentSocraticTopic);
    // -------------------------------------------
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
    // --- Refs for Audio Analysis ---
    const audioContextRef = useRef<AudioContext | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);
    const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const localDataArrayRef = useRef<Uint8Array | null>(null);
    const localRafIdRef = useRef<number | null>(null);
    const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
    const remoteSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const remoteDataArrayRef = useRef<Uint8Array | null>(null);
    const remoteRafIdRef = useRef<number | null>(null);
    // -----------------------------
    const baseTools = useMemo(() => getTools(), []); // Use useMemo to get baseTools only once

    // --- Get selected voice from store ---
    const selectedVoice = useVoiceStore((state) => state.selectedVoice);
    // ----------------------------------

    // --- NEW: State for Assistant's MediaStream ---
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    // --- NEW: State for Volume Levels (0-1) ---
    const [isSocraticGeneratingPrompt, setIsSocraticGeneratingPrompt] = useState(false);
    const socraticDialogueState = useRef('idle'); // 'idle', 'generating', 'active


    // const { toast } = useToast(); // Unused
    // const conversationManager = useRef(new ConversationManager()); // Assuming unused now

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
        if (chatContainerRef.current && viewMode === 'transcript') {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages, viewMode]);

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
             localStreamRef.current = null; // Ensure ref is null on error
             return null;
         }
     }, []);
     // ---------------------------------------------------

    // --- NEW: Use the frequency data hook --- 
    // Note: Passing localStreamRef.current directly might cause issues if the ref updates
    //       without triggering a re-render where the hook is called.
    //       Consider using a state for the local stream if problems arise.
    const localFrequencyData = useAudioFrequencyData(localStreamRef.current); // Get frequency data for user mic
    const remoteFrequencyData = useAudioFrequencyData(remoteStream); // Get frequency data for assistant stream
    // ----------------------------------

    // Function to start the session - Modified to handle stream acquisition properly
    const startSession = useCallback(async () => {
        console.log("Attempting to start Realtime session (mic granted, stream available)... v5 - No Socratic Tool");
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

        // --- NEW: Ensure remote stream is null initially ---
        setRemoteStream(null);
        // ------------------------------------------------

        try {
            // --- Initialize AudioContext ---
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                try {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                     console.log("AudioContext created/resumed.");
                } catch (e) {
                    console.error("Failed to create AudioContext:", e);
                    cleanupConnection("AudioContext not supported or failed to initialize.");
                    return;
                }
            } else if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(err => { // Resume if suspended
                     console.error("Failed to resume AudioContext:", err);
                     cleanupConnection("Failed to resume AudioContext.");
                     return; // Exit startSession if resume fails
                 });
            }
            // -----------------------------

            // --- Old Local Volume Analysis Setup REMOVED --- 
            // This is now handled by the useAudioVolumeAnalyzer hook.
            // ------------------------------------------------

            const connection = await createRealtimeConnection(
                remoteAudioElement,
                baseTools,
                currentStream,
                // --- Pass setRemoteStream as the callback --- 
                (stream) => {
                    console.log("[RealtimeChat onRemoteTrack Callback] Received stream:", stream.id);
                    setRemoteStream(stream);
                }
                // ----------------------------------------
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

            // --- onopen callback --- 
            dcRef.current.onopen = () => {
                console.log("DataChannel opened, determining final session config via getState() and sending update...");
                setSessionStatus('CONNECTED');
                setLastError(null);

                let toolsForSession = [...baseTools]; // Use baseTools from closure
                let toolChoice: any = "auto"; // Default: auto
                let currentInstructions = DEVELOPER_PROMPT; // Default instructions
                const currentSelectedVoice = useVoiceStore.getState().selectedVoice; // Get latest voice

                const latestSocraticState = useSocraticStore.getState();
                console.log("[RealtimeChat onopen] Full Socratic State from getState():", JSON.stringify(latestSocraticState));

                if (latestSocraticState.isSocraticModeActive) {
                    console.log("[RealtimeChat onopen] Checking generatedSocraticPrompt:", latestSocraticState.generatedSocraticPrompt ? `Exists (length ${latestSocraticState.generatedSocraticPrompt.length})` : "MISSING or empty");

                    if (latestSocraticState.generatedSocraticPrompt) {
                        console.log("Socratic Mode Active (onopen - getState): Using generated Socratic prompt.");
                        currentInstructions = latestSocraticState.generatedSocraticPrompt; 
                        // Ensure toolChoice remains auto for Socratic mode without function forcing
                        toolChoice = "auto"; 
                    } else {
                        console.warn("Socratic Mode active (onopen - getState), but generatedSocraticPrompt is missing. Using default prompt and tools.");
                    }
                } else {
                    console.log("Socratic Mode Inactive (onopen - getState): Using default prompt and tools.");
                }

                const initialSessionUpdate = {
                    type: "session.update",
                    session: {
                        modalities: ["audio", "text"],
                        input_audio_format: "pcm16",
                        output_audio_format: "pcm16",
                        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
                        voice: currentSelectedVoice, // Use selected voice from store
                        turn_detection: {
                            type: "semantic_vad",
                            eagerness: "high",
                            create_response: true,
                            interrupt_response: true,
                        },
                        instructions: currentInstructions, // Use potentially updated instructions
                        tools: toolsForSession,           // Use base tools
                        tool_choice: toolChoice,          // Should be 'auto'
                    },
                };
                console.log("Sending final session.update payload (Socratic Mode: ", latestSocraticState.isSocraticModeActive , ", Voice:", currentSelectedVoice, "):", JSON.stringify(initialSessionUpdate, null, 2));
                sendEvent(initialSessionUpdate);

                // --- NEU: Trigger initial response if in Socratic Mode ---
                // Get the latest state *inside* the callback, as state outside might be stale
                const latestSocraticStateAfterUpdate = useSocraticStore.getState();
                if (latestSocraticStateAfterUpdate.isSocraticModeActive) {
                    console.log("Socratic mode active, requesting initial assistant response...");
                    sendEvent({ type: "response.create" });
                }
                // --- Ende Neu ---
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

        } catch (error) {
             console.error("Error during session start/connection:", error);
             cleanupConnection("Error during connection setup.");
        }

    }, [
        baseTools,
        micPermission, 
        sessionStatus, 
        sendEvent, 
        handleServerEventRef, 
        rawSetConversation, 
        requestMicrophoneAccess, 
    ]);

    // --- Effect to handle attaching the remote stream to the audio element --- 
    useEffect(() => {
        const audioEl = remoteAudioElement.current;
        if (remoteStream && audioEl) {
            console.log("[Audio Effect] Attaching remote stream to audio element:", remoteStream.id);
            if (audioEl.srcObject !== remoteStream) { // Avoid unnecessary re-assignment
                 audioEl.srcObject = remoteStream;
                 // Autoplay should handle playing, but call play() for good measure
                 audioEl.play().catch(err => {
                      console.error("[Audio Effect] Playback failed:", err);
                      // Maybe set an error state if playback fails critically
                      setLastError("Browser prevented audio playback. Interaction might be needed.");
                 });
             }
        } else {
            // console.log("[Audio Effect] No remote stream or audio element, ensuring srcObject is null.");
            if (audioEl && audioEl.srcObject) {
                 audioEl.srcObject = null;
             }
        }

        // Cleanup: Ensure srcObject is null when stream/component unmounts
        // This might be redundant with cleanupConnection, but ensures audio stops
        return () => {
             const currentAudioEl = remoteAudioElement.current; // Capture ref value for cleanup closure
             if (currentAudioEl && currentAudioEl.srcObject) {
                 console.log("[Audio Effect Cleanup] Setting srcObject to null.");
                 currentAudioEl.srcObject = null;
             }
        };
    }, [remoteStream, remoteAudioElement]); // Rerun when the stream or the element ref changes
    // ------------------------------------------------------------------------

    // --- Define cleanupConnection FIRST --- 
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
            pcRef.current.getSenders().forEach(sender => sender.track?.stop());
            if (pcRef.current.connectionState !== 'closed') {
                try { pcRef.current.close(); } catch (e) { console.error("Error closing pc:", e); }
            }
            pcRef.current = null;
        }
        if (remoteAudioElement.current) {
             remoteAudioElement.current.srcObject = null;
             remoteAudioElement.current.pause();
        }

        localStreamRef.current?.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        
        setRemoteStream(null);

        setSessionStatus(errorMsg ? 'ERROR' : 'DISCONNECTED');
        setIsAssistantSpeaking(false);

    }, [remoteAudioElement]); // Dependency on remoteAudioElement ref
    // ---------------------------------------

    // --- Define stopSession AFTER cleanupConnection ---
     const stopSession = useCallback(() => {
         console.log("Stopping session manually...");
         if (dcRef.current && dcRef.current.readyState === 'open') {
             sendEvent({ type: "session.end" }); // Gracefully end session on server first
         }
         // Cleanup immediately regardless of whether session.end was sent
         cleanupConnection();
     }, [cleanupConnection, sendEvent]);
    // --------------------------------------------

    // Cleanup on component unmount
    useEffect(() => {
        // Store refs in variables to use in the cleanup function's closure
        const pc = pcRef.current;
        const dc = dcRef.current;
        return () => {
            console.log("RealtimeChat component unmounting. Cleaning up refs:", { pcExists: !!pc, dcExists: !!dc });
            // Only run full cleanup if connection refs were actually set during the component's lifecycle.
            if (pc || dc) {
               cleanupConnection("Component unmounted");
            } else {
                console.log("Skipping cleanup on unmount as connection refs were null.");
            }
        };
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
                <div className="flex justify-center items-center flex-shrink-0">
                    <h2 className="text-xl font-semibold text-foreground">Realtime Voice Assistant</h2>
                </div>

                {/* Conditionally render ErrorDisplay based on viewMode */}
                {viewMode === 'transcript' && <ErrorDisplay lastError={lastError} />}

                {/* Chat Controls - Always visible */}
                <div className="flex-shrink-0">
                    <ChatControls
                        isConnected={sessionStatus === 'CONNECTED'}
                        isConnecting={sessionStatus === 'CONNECTING'}
                        // Pass isAssistantSpeaking for potential use in controls?
                        isSpeaking={isAssistantSpeaking}
                        currentUtterance={""} // Maybe remove later
                        startSession={startSession}
                        stopSession={stopSession}
                        clearConversation={clearConversation} // Keep?
                        micPermission={micPermission}
                        requestMicPermission={requestMicrophoneAccess}
                    />
                </div>

                {/* --- Conditional Rendering for Transcript / Voice Only --- */}
                {viewMode === 'transcript' ? (
                    /* Transcript Display Area */
                    <div
                        ref={chatContainerRef}
                        className={cn(
                            "flex-grow rounded-md bg-card",
                            "h-0 min-h-[150px]",
                            "overflow-y-auto p-4 space-y-4",
                             // Apply rounding based on Socratic mode
                             isSocraticModeActiveUI ? 'rounded-b-md rounded-t-none' : 'rounded-md'
                        )}
                    >
                        {/* Display "Connecting..." */}
                        {chatMessages.length === 0 && sessionStatus === 'CONNECTING' &&
                            <div className="flex justify-center items-center h-full">
                                 <div className="text-center text-muted-foreground italic">Connecting...</div>
                            </div>
                         }
                        {/* Render actual messages */}
                        {chatMessages.map((item: Item) => (
                            <React.Fragment key={item.id}>
                                {item.type === "message" && <Message message={item as MessageItem} />}
                                {item.type === "tool_call" && <ToolCall toolCall={item} />}
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    /* --- Render VoiceOnlyView normally, remove VisualizerComponent prop --- */
                    <VoiceOnlyView
                        isAssistantSpeaking={isAssistantSpeaking}
                        micPermission={micPermission}
                        sessionStatus={sessionStatus}
                        lastError={lastError}
                        isSocraticModeActiveUI={isSocraticModeActiveUI}
                        // Pass calculated volumes instead of streams
                        localFrequencyData={localFrequencyData}
                        remoteFrequencyData={remoteFrequencyData}
                    />
                    /* -------------------------------------------------------------------- */
                )}

                {/* Audio Element for Playback */} 
                 <audio ref={remoteAudioElement} hidden playsInline />
             </div>
        </div>
    );
}
