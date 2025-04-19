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
import { useRecording } from '@/hooks/useRecording';
import { useMediaStore } from '@/stores/mediaStreamStore'; // Import the media store
// import { useToast } from "@/components/ui/use-toast"; // Unused

// Define view modes
type ViewMode = "transcript" | "voiceOnly";

type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
type PermissionStatus = "prompt" | "granted" | "denied";

// Define Props interface for RealtimeChat
interface RealtimeChatProps {
    viewMode: ViewMode;
}

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
    const chatContainerRef = useRef<HTMLDivElement | null>(null);
    const [micPermission, setMicPermission] = useState<PermissionStatus>("prompt");
    const [cameraPermission, setCameraPermission] = useState<PermissionStatus>("prompt"); // <<< ADDED state for camera permission status
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

    // --- Recording Hook Integration ---
    const {
        recordingStatus,
        recordedData,
        error: recordingError,
        clearError: clearRecordingError,
        requestCameraPermission,
        requestScreenPermission,
        startRecording,
        stopRecording,
        downloadFile,
    } = useRecording();

    // const { toast } = useToast(); // Unused
    // const conversationManager = useRef(new ConversationManager()); // Assuming unused now

    const sessionIdRef = useRef<string | null>(null);

    // --- Zustand Store Selectors (Optimized) --- 
    // Select individual streams to prevent unnecessary re-renders
    const micStream = useMediaStore((state) => state.micStream);
    const cameraStream = useMediaStore((state) => state.cameraStream);
    const screenStream = useMediaStore((state) => state.screenStream);
    // Select actions (these are stable)
    const setMicStream = useMediaStore((state) => state.setMicStream);
    const setCameraStream = useMediaStore((state) => state.setCameraStream);
    const stopAllStreams = useMediaStore((state) => state.stopAllStreams);

    // Define requestMicrophoneAccess
    const requestMicrophoneAccess = useCallback(async (): Promise<MediaStream | null> => {
        console.log("[requestMicrophoneAccess] Requesting access...");
        try {
           // Stop potentially existing stream in store before getting new one
           // setMicStream(null); // setMicStream handles stopping previous stream
           const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
           setMicStream(stream); // Assign to store
           console.log(`[requestMicrophoneAccess] Access granted. Stream set in store (ID: ${stream?.id}).`);
           setMicPermission("granted"); // Update UI state
           setLastError(null);
           return stream;
        } catch (err) {
           console.error("[requestMicrophoneAccess] Error getting user media:", err);
           setMicStream(null); // Ensure store is null on error
           setMicPermission("denied");
           setLastError("Microphone access denied.");
           return null;
        }
    }, [setMicStream]); // Dependency on store action

    // --- Define handleRequestCameraPermission (uses hook which uses store) --- 
    const handleRequestCameraPermission = useCallback(async () => {
        console.log("[handleRequestCameraPermission] Requesting camera permission...");
        setLastError(null);
        clearRecordingError();
        const success = await requestCameraPermission(); // Hook handles store update
        if (success) {
            setCameraPermission("granted"); // <<< Update status on success
        } else {
             console.error("[handleRequestCameraPermission] Camera permission failed or denied.");
             setLastError("Kamerazugriff fehlgeschlagen oder abgelehnt.");
             // Update status based on potential denial (though getUserMedia might not always trigger permission change event)
             navigator.permissions.query({ name: 'camera' as PermissionName }).then(status => setCameraPermission(status.state));
        }
     }, [requestCameraPermission, clearRecordingError, setLastError]); // <<< Removed setCameraPermission from deps, it's stable

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

    // Effect to scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current && viewMode === 'transcript') {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages, viewMode]);

    // Check initial permission status on mount (Mic and Camera)
    useEffect(() => {
        // --- Define activation logic INSIDE the effect ---
        const activateCameraIfGranted = async () => {
            if (cameraPermission === 'granted') {
                console.log("[Permission Effect] Camera initially granted, attempting activation...");
                handleRequestCameraPermission();
            }
        };

        // Microphone
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
             setMicPermission(permissionStatus.state);
             // Automatically request mic if already granted (optional, consider UX)
             // if (permissionStatus.state === 'granted') {
             //     requestMicrophoneAccess(); 
             // }
             permissionStatus.onchange = () => {
                 const newState = permissionStatus.state;
                 console.log("[Permission Effect] Mic permission changed to:", newState);
                 setMicPermission(newState);
                 // if (newState === 'granted') {
                 //     requestMicrophoneAccess();
                 // }
             };
        }).catch(err => {
             console.warn("Could not query microphone permission status:", err);
             setMicPermission("prompt");
        });

        // Camera <<< ADDED Camera Check
        navigator.permissions.query({ name: 'camera' as PermissionName }).then((permissionStatus) => {
            const initialState = permissionStatus.state;
            console.log("[Permission Effect] Initial camera permission state:", initialState);
            setCameraPermission(initialState);
            // <<< Automatically request camera if already granted on initial load >>>
            if (initialState === 'granted') {
                console.log("[Permission Effect] Camera initially granted, attempting activation...");
                setTimeout(activateCameraIfGranted, 100);
            }
            permissionStatus.onchange = () => {
                const newState = permissionStatus.state;
                console.log("[Permission Effect] Camera permission changed to:", newState);
                setCameraPermission(newState);
                 // <<< Automatically request camera if granted *after* initial load >>>
                 if (newState === 'granted') {
                     activateCameraIfGranted();
                 } else if (newState === 'denied') {
                     // If denied after granting, ensure stream is stopped
                     console.log("[Permission Effect] Camera denied after load, ensuring stream is stopped.");
                     useMediaStore.getState().setCameraStream(null); // Use store action to stop/clear stream
                 }
            };
       }).catch(err => {
            console.warn("Could not query camera permission status:", err);
            setCameraPermission("prompt");
       });
    }, [requestCameraPermission, clearRecordingError, setLastError, setCameraStream, handleRequestCameraPermission]);

    // Define handleRemoteStream (accepts MediaStream)
    const handleRemoteStream = useCallback((stream: MediaStream) => {
        console.log("[RealtimeChat handleRemoteStream] Received remote stream:", stream.id);
        const audioEl = remoteAudioElement.current;
        if (audioEl) {
            if (audioEl.srcObject !== stream) {
                audioEl.srcObject = stream;
                setRemoteStream(stream); // Update state
                audioEl.play().catch(e => console.error("Error playing remote audio:", e));
                console.log("[RealtimeChat handleRemoteStream] Attached stream to audio element.");
            }
        } else {
            console.warn("[RealtimeChat handleRemoteStream] Remote audio element missing.");
        }
    }, [remoteAudioElement]);

    // Define cleanupConnection
    const cleanupConnection = useCallback((errorMsg: string | null = null) => {
        console.log(`[cleanupConnection] Cleaning up. Reason: ${errorMsg || 'Manual stop/unmount'}`);
        if (errorMsg) setLastError(errorMsg);

        // Stop recorders AND Cam/Screen streams managed by useRecording hook
        // Ensure stopRecording is called to finalize blobs and set status
        stopRecording();

        // Cleanup WebRTC 
        if (pcRef.current) {
            pcRef.current.ontrack = null;
            pcRef.current.onicecandidate = null;
            pcRef.current.onconnectionstatechange = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.onicegatheringstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
            console.log("[cleanupConnection] RTCPeerConnection closed and cleaned up.");
        }
        if (dcRef.current) {
            dcRef.current.onopen = null;
            dcRef.current.onmessage = null;
            dcRef.current.onclose = null;
            dcRef.current.onerror = null;
            // Don't necessarily close here if pc.close() handles it, but belt-and-suspenders:
            if (dcRef.current.readyState !== 'closed') {
                 dcRef.current.close();
            }
            dcRef.current = null;
            console.log("[cleanupConnection] RTCDataChannel closed and cleaned up.");
        }

        // Cleanup remote audio
        if (remoteAudioElement.current) {
            remoteAudioElement.current.srcObject = null;
            console.log("[cleanupConnection] Remote audio element cleared.");
        }
        setRemoteStream(null);

        // Stop and clear ALL streams (Mic, Cam, Screen) from store
        // This happens *after* stopRecording has initiated the recorder stop
        stopAllStreams();

        // Update session status and reset UI states
        setSessionStatus(errorMsg ? 'ERROR' : 'DISCONNECTED');
        setIsAssistantSpeaking(false);
        // Don't reset mic permission UI state here, it reflects actual permission
        // setMicPermission("prompt"); 

    }, [
         stopAllStreams, stopRecording, remoteAudioElement, setLastError, 
         setSessionStatus, setIsAssistantSpeaking, setRemoteStream
        ]);

    // --- Use the frequency data hook --- 
    const localFrequencyData = useAudioFrequencyData(micStream);
    const remoteFrequencyData = useAudioFrequencyData(remoteStream);

    // --- Internal Session Start Logic --- 
    const _startSessionInternal = useCallback(async (
        micStreamInternal: MediaStream,
        camStreamInternal: MediaStream | null,
        screenStreamInternal: MediaStream
    ) => {
        console.log("--- [_startSessionInternal] Starting internal logic --- ");
        if (!micStreamInternal) {
            console.error("[_startSessionInternal] Error: micStreamInternal is null or undefined. Aborting.");
            cleanupConnection("Internal error: Mic stream missing.");
            return;
        }
        if (!screenStreamInternal) {
            console.error("[_startSessionInternal] Error: screenStreamInternal is null or undefined. Aborting.");
            cleanupConnection("Internal error: Screen stream missing.");
            return;
        }
        console.log(`[_startSessionInternal] Received Streams: Mic=${micStreamInternal.id}, Cam=${camStreamInternal?.id || 'N/A'}, Screen=${screenStreamInternal.id}`);

        // --- Prepare Session & Connect --- 
        setIsAssistantSpeaking(false);
        setSessionStatus('CONNECTING');
        console.log("[_startSessionInternal] Status set to CONNECTING.");
        rawSetConversation({ chatMessages: [] });

        sessionIdRef.current = crypto.randomUUID();
        const participantId = prompt("Teilnehmer-ID:", `P_${sessionIdRef.current.substring(0, 4)}`) || `P_Unknown_${sessionIdRef.current.substring(0, 4)}`;
        if (participantId) localStorage.setItem('participantId', participantId);
        console.log(`[_startSessionInternal] SESSION_METADATA;${sessionIdRef.current};${participantId};...`);

        // Setup WebRTC Connection
        if (!remoteAudioElement.current) {
            console.error("[_startSessionInternal] Error: remoteAudioElement is null. Aborting.");
            cleanupConnection("Audio El missing");
            return;
        }
        const toolsForSession = getTools();
        console.log("[_startSessionInternal] Tools prepared. Attempting createRealtimeConnection...");
        let connection: { pc: RTCPeerConnection; dc: RTCDataChannel } | null = null;
        try {
            connection = await createRealtimeConnection(
                remoteAudioElement,
                toolsForSession,
                micStreamInternal, // Use the passed mic stream
                handleRemoteStream // Pass the correct callback (should expect MediaStream)
            );
             console.log("[_startSessionInternal] createRealtimeConnection call finished.");
        } catch (connError) {
            console.error("[_startSessionInternal] Error during createRealtimeConnection:", connError);
            cleanupConnection("Connection failed");
            return;
        }

        if (!connection || !connection.pc || !connection.dc) {
            console.error("[_startSessionInternal] Error: createRealtimeConnection returned null or invalid connection object.", connection);
            cleanupConnection("Connection object null or invalid");
            return;
        }

        console.log("[_startSessionInternal] Connection object received. Setting refs.");
        pcRef.current = connection.pc;
        dcRef.current = connection.dc;
        console.log(`[_startSessionInternal] Refs set: pcRef=${!!pcRef.current}, dcRef=${!!dcRef.current}`);

        // --- Setup Handlers & Start Recording --- 
        console.log("[_startSessionInternal] Setting up DataChannel handlers...");
        dcRef.current.onopen = () => {
            console.log("[_startSessionInternal] >>> DataChannel opened <<< ");
            setSessionStatus('CONNECTED');
            console.log("[_startSessionInternal] Status set to CONNECTED.");

            // --- Get Remote Audio Stream Directly --- 
            let remoteAudioStreamFromElement: MediaStream | null = null;
            if (remoteAudioElement.current && remoteAudioElement.current.srcObject instanceof MediaStream) {
                remoteAudioStreamFromElement = remoteAudioElement.current.srcObject;
                 console.log(`[_startSessionInternal] Got remote audio stream from element: ${remoteAudioStreamFromElement?.id || 'N/A'}`);
            } else {
                 console.warn("[_startSessionInternal] Could not get remote audio stream from element when DC opened.");
            }

            // --- Start Recording (Final Call Signature with 4 streams) --- 
            console.log("[_startSessionInternal] DataChannel open. Calling startRecording() NOW...");
            try {
                // Pass all streams needed for the 3 recorders (Mic, Cam, Screen, Assistant)
                startRecording(
                    micStreamInternal, 
                    camStreamInternal, 
                    screenStreamInternal,
                    remoteAudioStreamFromElement // Pass the stream containing assistant audio
                 );
                console.log("[_startSessionInternal] startRecording() called successfully.");
            } catch (recordingError) {
                console.error("[_startSessionInternal] Error calling startRecording:", recordingError);
                setLastError("Failed to start recording after connection.");
            }

            // --- Send COMPLETE Session Update --- 
            const currentSelectedVoice = useVoiceStore.getState().selectedVoice;
            const currentInstructions = DEVELOPER_PROMPT;
            const initialSessionUpdate = {
                type: "session.update",
                session: {
                    modalities: ["audio", "text"],
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16", 
                    input_audio_transcription: { model: "gpt-4o-mini-transcribe" }, 
                    voice: currentSelectedVoice,
                    turn_detection: {
                         type: "semantic_vad",
                         eagerness: "high",
                         create_response: true,
                         interrupt_response: true, 
                     },
                    instructions: currentInstructions,
                    tools: toolsForSession, 
                    tool_choice: "auto", 
                 }
             };
            console.log("[_startSessionInternal] Sending session.update payload...");
            sendEvent(initialSessionUpdate);
            console.log("[_startSessionInternal] session.update payload sent.");

            // --- Trigger Initial Socratic Turn (If Applicable) --- 
            const latestSocraticStateAfterUpdate = useSocraticStore.getState();
            if (latestSocraticStateAfterUpdate.isSocraticModeActive) {
                console.log("[_startSessionInternal] Socratic mode active, sending response.create...");
                sendEvent({ type: "response.create" });
            } else {
                 console.log("[_startSessionInternal] Socratic mode inactive.");
            }
            console.log("[_startSessionInternal] onopen handler finished.");
        };
        dcRef.current.onmessage = (event) => {
             console.log("[_startSessionInternal] <<< DataChannel message received <<< ", event.data.substring(0, 100) + "..."); // Log truncated message
            try {
                handleServerEventRef.current(JSON.parse(event.data));
            } catch (parseError) {
                 console.error("[_startSessionInternal] Error parsing server event:", parseError, "Raw data:", event.data);
            }
        };
        dcRef.current.onclose = () => {
             console.log("[_startSessionInternal] >>> DataChannel closed <<< ");
            cleanupConnection("DataChannel closed");
        };
        dcRef.current.onerror = (error) => {
             console.error("[_startSessionInternal] >>> DataChannel error <<< ", error);
            cleanupConnection(`DataChannel error: ${error}`);
        };
        console.log("[_startSessionInternal] DataChannel handlers set.");

        // Optional: Add PeerConnection state change logging if needed
        if (pcRef.current) {
            pcRef.current.onconnectionstatechange = () => {
                 console.log(`[_startSessionInternal] PeerConnection state changed: ${pcRef.current?.connectionState}`);
            };
            pcRef.current.oniceconnectionstatechange = () => {
                 console.log(`[_startSessionInternal] ICE Connection state changed: ${pcRef.current?.iceConnectionState}`);
            };
            pcRef.current.onicegatheringstatechange = () => {
                 console.log(`[_startSessionInternal] ICE Gathering state changed: ${pcRef.current?.iceGatheringState}`);
             };
             console.log("[_startSessionInternal] PeerConnection state handlers set.");
        }

        console.log("[_startSessionInternal] Setup complete, waiting for DataChannel to open...");

     }, [
         rawSetConversation, createRealtimeConnection, handleRemoteStream, sendEvent, cleanupConnection,
         startRecording, remoteAudioElement, getTools, handleServerEventRef,
     ]);

    // --- MODIFIED: Handler for "Share Screen & Start" Button --- 
    const handleShareScreenAndStartSession = useCallback(async () => {
        console.log(`--- [handleShareScreenAndStartSession] Initiated.`);
        setLastError(null);
        clearRecordingError();

        // --- 1. Pre-checks (Permissions) --- 
        if (sessionStatus !== 'DISCONNECTED' && sessionStatus !== 'ERROR') {
            console.warn("[handleShareScreenAndStartSession] Session already active or connecting.");
            return;
        }
        if (micPermission !== "granted") {
            setLastError("Mikrofonberechtigung fehlt.");
            console.error("[handleShareScreenAndStartSession] Microphone permission not granted.");
            return;
        }
        if (cameraPermission !== "granted") {
            setLastError("Kameraberechtigung fehlt.");
            console.error("[handleShareScreenAndStartSession] Camera permission not granted.");
            return;
        }

        // --- 2. Ensure Mic Stream is Active (if permission granted) --- 
        let currentMicStream = useMediaStore.getState().micStream;
        if (!currentMicStream) {
            console.log("[handleShareScreenAndStartSession] Mic stream not active, attempting to activate...");
            const micStreamResult = await requestMicrophoneAccess(); // This updates the store
            if (!micStreamResult) {
                setLastError("Mikrofon konnte nicht aktiviert werden.");
                console.error("[handleShareScreenAndStartSession] Failed to activate microphone stream.");
                return; // Stop if mic activation fails
            }
            currentMicStream = micStreamResult; // Use the newly acquired stream
            console.log("[handleShareScreenAndStartSession] Mic stream activated.");
        }

        // --- 3. Ensure Camera Stream is Active (if permission granted) --- 
        let currentCameraStream = useMediaStore.getState().cameraStream;
        if (!currentCameraStream) {
            console.log("[handleShareScreenAndStartSession] Camera stream not active, attempting to activate...");
            // Directly call the function that gets the stream and updates the store
            const cameraSuccess = await requestCameraPermission(); // From useRecording hook
            if (!cameraSuccess) {
                setLastError("Kamera konnte nicht aktiviert werden.");
                console.error("[handleShareScreenAndStartSession] Failed to activate camera stream.");
                return; // Stop if camera activation fails
            }
            // Re-fetch from store after activation attempt
            currentCameraStream = useMediaStore.getState().cameraStream;
            if (!currentCameraStream) {
                 // This case might happen if requestCameraPermission succeeded but the store update is async or failed
                 setLastError("Kamera-Stream nach Aktivierung nicht gefunden.");
                 console.error("[handleShareScreenAndStartSession] Camera stream not found in store even after successful activation request.");
                 return;
            }
            console.log("[handleShareScreenAndStartSession] Camera stream activated.");
        }

        // --- 4. Request Screen Permission (User Gesture Required!) --- 
        console.log("[handleShareScreenAndStartSession] Requesting screen permission NOW...");
        const screenStreamFromRequest = await requestScreenPermission(); // Hook sets it in store

        // --- 5. Check Screen Permission & Start Internal Logic --- 
        if (screenStreamFromRequest) {
            console.log("[handleShareScreenAndStartSession] Screen permission granted. Starting internal session logic...");
            // Pass the streams we ensured are active
            _startSessionInternal(
                currentMicStream, // The mic stream we confirmed/activated
                currentCameraStream, // The camera stream we confirmed/activated
                screenStreamFromRequest // The screen stream we just got
            );
        } else {
            console.error("[handleShareScreenAndStartSession] Screen permission denied or failed. Aborting.");
            setLastError("Bildschirmfreigabe fehlgeschlagen oder abgelehnt.");
            // Optional: Stop Mic/Cam streams if they were *only* started for this attempt?
            // Consider the UX - maybe leave them active for a retry?
        }

    }, [
        sessionStatus,
        micPermission,
        cameraPermission,
        requestMicrophoneAccess,
        handleRequestCameraPermission, // Use the existing handler for camera activation
        requestCameraPermission, // From useRecording hook, used by handleRequestCameraPermission
        requestScreenPermission,
        _startSessionInternal,
        clearRecordingError,
        setLastError,
    ]);

    // Define stopSession
    const stopSession = useCallback(() => {
        console.log("[RealtimeChat] stopSession called.");
        setIsAssistantSpeaking(false);
        setSessionStatus('DISCONNECTED');
        // Clear any previous errors when stopping manually
        if (recordingError) clearRecordingError(); // Clear recorder specific errors
        setLastError(null); // Clear general errors

        // Use the stopRecording function from the hook
        stopRecording();

        // Cleanup WebSocket and other resources, pass a neutral reason or nothing
        cleanupConnection("Session ended"); // Use a neutral reason
        // OR: cleanupConnection(); // If the default log message is sufficient

        // Reset state related to transcription, etc.
        // ... (keep existing resets)
        setRemoteStream(null);
        setIsSocraticGeneratingPrompt(false);
    }, [
        stopRecording,
        cleanupConnection,
        recordingError, // Add dependencies
        clearRecordingError,
        setSessionStatus,
        setIsAssistantSpeaking,
        setRemoteStream,
        setIsSocraticGeneratingPrompt
    ]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log("RealtimeChat component unmounting. Cleaning up...");
            cleanupConnection("Component unmounted");
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

    // Effect to handle downloads when recording stops and ALL 3 blobs are ready
    useEffect(() => {
        // Check for stopped status and presence of all THREE blobs
        if (recordingStatus === 'stopped' && 
            recordedData.combinedBlob && 
            recordedData.screenBlob && 
            recordedData.assistantBlob && 
            sessionIdRef.current)
        {
            const participantId = localStorage.getItem('participantId') || `P_Unknown_${sessionIdRef.current.substring(0, 4)}`;
            console.log("Recording fully stopped, triggering ALL 3 downloads...");

            // 1. Download Combined (Camera + Mic Audio)
            const combinedBlobType = recordedData.combinedBlob.type;
            let combinedExtension = 'webm'; 
             if (combinedBlobType.includes('mp4')) combinedExtension = 'mp4';
            console.log(`[Download Effect] Determined combined file extension: .${combinedExtension} from blob type: ${combinedBlobType}`);
            downloadFile(recordedData.combinedBlob, `${sessionIdRef.current}_${participantId}_Combined_(Cam+Mic).${combinedExtension}`);

            // 2. Download Screen Recording (Screen Video + Screen Audio)
            const screenBlobType = recordedData.screenBlob.type;
            let screenExtension = 'webm'; 
             if (screenBlobType.includes('mp4')) screenExtension = 'mp4';
            console.log(`[Download Effect] Determined screen file extension: .${screenExtension} from blob type: ${screenBlobType}`);
            downloadFile(recordedData.screenBlob, `${sessionIdRef.current}_${participantId}_Screen.${screenExtension}`);

            // 3. Download Assistant Audio (Assistant Audio Only)
            const assistantBlobType = recordedData.assistantBlob.type;
            let assistantExtension = 'bin'; 
            if (assistantBlobType.includes('wav')) assistantExtension = 'wav';
            else if (assistantBlobType.includes('opus')) assistantExtension = 'opus'; 
            else if (assistantBlobType.includes('webm')) assistantExtension = 'webm';
            else if (assistantBlobType.includes('mp4')) assistantExtension = 'm4a'; 
            else if (assistantBlobType.includes('aac')) assistantExtension = 'aac';
            console.log(`[Download Effect] Determined assistant file extension: .${assistantExtension} from blob type: ${assistantBlobType}`);
            downloadFile(recordedData.assistantBlob, `${sessionIdRef.current}_${participantId}_AssistantAudio.${assistantExtension}`);

        } else if (recordingStatus === 'stopped') {
             // Restore original warning log with all 3 checks
             console.warn(`[Download Effect] Recording stopped, but not all blobs are ready: Combined=${!!recordedData.combinedBlob}, Screen=${!!recordedData.screenBlob}, Assistant=${!!recordedData.assistantBlob}`);
        }
    // Restore original dependencies
    }, [recordingStatus, recordedData, downloadFile, sessionIdRef]);

    // --- Render UI --- 
    // Get camera stream status directly from store variable
    const isCameraStreamActive = !!cameraStream; // Keep this for UI elements that depend on stream *activity*
    // Determine if mic permission is granted
    const isMicPermissionGranted = micPermission === 'granted';
    // Determine if camera permission is granted
    const isCameraPermissionGranted = cameraPermission === 'granted';

    // <<< MODIFIED: Enable start button based on PERMISSIONS, not active streams >>>
    const canStartSession = isMicPermissionGranted && isCameraPermissionGranted && (sessionStatus === 'DISCONNECTED' || sessionStatus === 'ERROR');

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
                {viewMode === 'transcript' && <ErrorDisplay lastError={lastError || recordingError} />}

                {/* Chat Controls - Always visible */}
                <div className="flex-shrink-0">
                    <ChatControls
                        shareScreenAndStartSession={handleShareScreenAndStartSession}
                        stopSession={stopSession}
                        clearConversation={clearConversation}
                        micPermission={micPermission}
                        requestMicPermission={requestMicrophoneAccess}
                        cameraPermission={cameraPermission}
                        isCameraStreamActive={isCameraStreamActive} // Pass stream status for icon/tooltip updates
                        requestCameraPermission={handleRequestCameraPermission} // Keep for manual button click
                        isConnected={sessionStatus === 'CONNECTED'}
                        isConnecting={sessionStatus === 'CONNECTING'}
                        isSpeaking={isAssistantSpeaking}
                        // Pass the derived state to enable/disable the button
                        canStartSession={canStartSession} // <<< Use the modified condition
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
