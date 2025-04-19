"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import useConversationStore from '@/stores/useConversationStore';
import { createRealtimeConnection } from '@/lib/realtime/connection';
import { useHandleRealtimeEvents } from '@/hooks/useHandleRealtimeEvents';
import { getTools } from '@/lib/tools/tools';
import { DEVELOPER_PROMPT, MODEL } from '@/config/constants';
import { RealtimeEvent } from './realtime-types';
import ErrorDisplay from './ErrorDisplay';
import ChatControls from './ChatControls';
import Message from './message';
import ToolCall from './tool-call';
import { Item, MessageItem, FunctionCallItem } from '@/hooks/useHandleRealtimeEvents';
import useToolsStore from '@/stores/useToolsStore';
import useSocraticStore from '@/stores/useSocraticStore';
import { cn } from "@/lib/utils";
import { MicIcon, MessageSquareQuoteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import VoiceOnlyView from './VoiceOnlyView';
import { useAudioFrequencyData } from '@/hooks/useAudioVolumeAnalyzer';
import { Tool } from './realtime-types';
import { useRecording } from '@/hooks/useRecording';
import { useMediaStore } from '@/stores/mediaStreamStore';
import { useInterfaceStore, setPermissionRequestFunctions } from '@/stores/useInterfaceStore';

type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export default function RealtimeChat() {
    const { chatMessages, rawSet: rawSetConversation } = useConversationStore();
    const isSocraticModeActiveUI = useSocraticStore((state) => state.isSocraticModeActive);
    const selectedSocraticMode = useSocraticStore((state) => state.selectedSocraticMode);
    const currentSocraticTopic = useSocraticStore((state) => state.currentSocraticTopic);
    const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const remoteAudioElement = useRef<HTMLAudioElement | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);
    const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const localDataArrayRef = useRef<Uint8Array | null>(null);
    const localRafIdRef = useRef<number | null>(null);
    const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
    const remoteSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const remoteDataArrayRef = useRef<Uint8Array | null>(null);
    const remoteRafIdRef = useRef<number | null>(null);
    const baseTools = useMemo(() => getTools(), []);

    const viewMode = useInterfaceStore((state) => state.viewMode);
    const selectedVoice = useInterfaceStore((state) => state.selectedVoice);
    const micPermission = useInterfaceStore((state) => state.micPermission);
    const cameraPermission = useInterfaceStore((state) => state.cameraPermission);
    const setMicPermission = useInterfaceStore((state) => state.setMicPermission);
    const setCameraPermission = useInterfaceStore((state) => state.setCameraPermission);

    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isSocraticGeneratingPrompt, setIsSocraticGeneratingPrompt] = useState(false);
    const socraticDialogueState = useRef('idle');

    const {
        recordingStatus,
        recordedData,
        error: recordingError,
        clearError: clearRecordingError,
        requestCameraPermission: hookRequestCameraPermission,
        requestScreenPermission,
        startRecording,
        stopRecording,
        downloadFile,
    } = useRecording();

    const sessionIdRef = useRef<string | null>(null);

    const micStream = useMediaStore((state) => state.micStream);
    const cameraStream = useMediaStore((state) => state.cameraStream);
    const screenStream = useMediaStore((state) => state.screenStream);
    const setMicStream = useMediaStore((state) => state.setMicStream);
    const setCameraStream = useMediaStore((state) => state.setCameraStream);
    const stopAllStreams = useMediaStore((state) => state.stopAllStreams);

    const requestMicrophoneAccess = useCallback(async (): Promise<MediaStream | null> => {
        console.log("[requestMicrophoneAccess] Requesting access...");
        try {
           const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
           setMicStream(stream);
           console.log(`[requestMicrophoneAccess] Access granted. Stream set in store (ID: ${stream?.id}).`);
           setMicPermission("granted");
           setLastError(null);
           return stream;
        } catch (err) {
           console.error("[requestMicrophoneAccess] Error getting user media:", err);
           setMicStream(null);
           setMicPermission("denied");
           setLastError("Microphone access denied.");
           return null;
        }
    }, [setMicStream, setMicPermission]);

    const handleRequestCameraPermission = useCallback(async () => {
        console.log("[handleRequestCameraPermission] Requesting camera permission...");
        setLastError(null);
        clearRecordingError();
        const success = await hookRequestCameraPermission();
        if (success) {
            setCameraPermission("granted");
        } else {
             console.error("[handleRequestCameraPermission] Camera permission failed or denied.");
             setLastError("Kamerazugriff fehlgeschlagen oder abgelehnt.");
             navigator.permissions.query({ name: 'camera' as PermissionName }).then(status => setCameraPermission(status.state));
        }
     }, [hookRequestCameraPermission, clearRecordingError, setLastError, setCameraPermission]);

    useEffect(() => {
        console.log("[Permission Setup Effect] Setting request functions in useInterfaceStore");
        const wrappedMicRequest = async () => { await requestMicrophoneAccess(); };
        const wrappedCamRequest = async () => { await handleRequestCameraPermission(); };
        setPermissionRequestFunctions(
            wrappedMicRequest,
            wrappedCamRequest
        );
    }, [requestMicrophoneAccess, handleRequestCameraPermission]);

    const sendEvent = useCallback((event: any) => {
        if (dcRef.current && dcRef.current.readyState === 'open') {
            console.log(">>> Sending Client Event:", event.type, JSON.stringify(event));
            dcRef.current.send(JSON.stringify(event));
        } else {
            console.error("Cannot send event, DataChannel not open.", event.type);
        }
    }, []);

    const handleServerEventRef = useHandleRealtimeEvents(sendEvent);

    useEffect(() => {
        if (chatContainerRef.current && viewMode === 'transcript') {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages, viewMode]);

    useEffect(() => {
        const activateCameraIfGranted = async () => {
            const currentCamPerm = useInterfaceStore.getState().cameraPermission;
            if (currentCamPerm === 'granted') {
                console.log("[Permission Effect] Camera initially granted, attempting activation...");
                handleRequestCameraPermission();
            }
        };

        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
             setMicPermission(permissionStatus.state);
             permissionStatus.onchange = () => {
                 const newState = permissionStatus.state;
                 console.log("[Permission Effect] Mic permission changed to:", newState);
                 setMicPermission(newState);
             };
        }).catch(err => {
             console.warn("Could not query microphone permission status:", err);
             setMicPermission("prompt");
        });

        navigator.permissions.query({ name: 'camera' as PermissionName }).then((permissionStatus) => {
            const initialState = permissionStatus.state;
            console.log("[Permission Effect] Initial camera permission state:", initialState);
            setCameraPermission(initialState);
            if (initialState === 'granted') {
                console.log("[Permission Effect] Camera initially granted, attempting activation...");
                setTimeout(activateCameraIfGranted, 100);
            }
            permissionStatus.onchange = () => {
                const newState = permissionStatus.state;
                console.log("[Permission Effect] Camera permission changed to:", newState);
                setCameraPermission(newState);
                 if (newState === 'granted') {
                     activateCameraIfGranted();
                 } else if (newState === 'denied') {
                     console.log("[Permission Effect] Camera denied after load, ensuring stream is stopped.");
                     useMediaStore.getState().setCameraStream(null);
                 }
            };
       }).catch(err => {
            console.warn("Could not query camera permission status:", err);
            setCameraPermission("prompt");
       });
    }, [setMicPermission, setCameraPermission, handleRequestCameraPermission]);

    const handleRemoteStream = useCallback((stream: MediaStream) => {
        console.log("[RealtimeChat handleRemoteStream] Received remote stream:", stream.id);
        const audioEl = remoteAudioElement.current;
        if (audioEl) {
            if (audioEl.srcObject !== stream) {
                audioEl.srcObject = stream;
                setRemoteStream(stream);
                audioEl.play().catch(e => console.error("Error playing remote audio:", e));
                console.log("[RealtimeChat handleRemoteStream] Attached stream to audio element.");
            }
        } else {
            console.warn("[RealtimeChat handleRemoteStream] Remote audio element missing.");
        }
    }, [remoteAudioElement]);

    const cleanupConnection = useCallback((errorMsg: string | null = null) => {
        console.log(`[cleanupConnection] Cleaning up. Reason: ${errorMsg || 'Manual stop/unmount'}`);
        if (errorMsg) setLastError(errorMsg);

        stopRecording();

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
            if (dcRef.current.readyState !== 'closed') {
                 dcRef.current.close();
            }
            dcRef.current = null;
            console.log("[cleanupConnection] RTCDataChannel closed and cleaned up.");
        }

        if (remoteAudioElement.current) {
            remoteAudioElement.current.srcObject = null;
            console.log("[cleanupConnection] Remote audio element cleared.");
        }
        setRemoteStream(null);

        stopAllStreams();

        setSessionStatus(errorMsg ? 'ERROR' : 'DISCONNECTED');
        setIsAssistantSpeaking(false);
    }, [
         stopAllStreams, stopRecording, remoteAudioElement, setLastError, 
         setSessionStatus, setIsAssistantSpeaking, setRemoteStream
        ]);

    const localFrequencyData = useAudioFrequencyData(micStream);
    const remoteFrequencyData = useAudioFrequencyData(remoteStream);

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

        setIsAssistantSpeaking(false);
        setSessionStatus('CONNECTING');
        console.log("[_startSessionInternal] Status set to CONNECTING.");
        rawSetConversation({ chatMessages: [] });

        sessionIdRef.current = crypto.randomUUID();
        const participantId = prompt("Teilnehmer-ID:", `P_${sessionIdRef.current.substring(0, 4)}`) || `P_Unknown_${sessionIdRef.current.substring(0, 4)}`;
        if (participantId) localStorage.setItem('participantId', participantId);
        console.log(`[_startSessionInternal] SESSION_METADATA;${sessionIdRef.current};${participantId};...`);

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
                micStreamInternal,
                handleRemoteStream
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

        console.log("[_startSessionInternal] Setting up DataChannel handlers...");
        dcRef.current.onopen = () => {
            console.log("[_startSessionInternal] >>> DataChannel opened <<< ");
            setSessionStatus('CONNECTED');
            console.log("[_startSessionInternal] Status set to CONNECTED.");

            let remoteAudioStreamFromElement: MediaStream | null = null;
            if (remoteAudioElement.current && remoteAudioElement.current.srcObject instanceof MediaStream) {
                remoteAudioStreamFromElement = remoteAudioElement.current.srcObject;
                 console.log(`[_startSessionInternal] Got remote audio stream from element: ${remoteAudioStreamFromElement?.id || 'N/A'}`);
            } else {
                 console.warn("[_startSessionInternal] Could not get remote audio stream from element when DC opened.");
            }

            console.log("[_startSessionInternal] DataChannel open. Calling startRecording() NOW...");
            try {
                startRecording(
                    micStreamInternal, 
                    camStreamInternal, 
                    screenStreamInternal,
                    remoteAudioStreamFromElement
                 );
                console.log("[_startSessionInternal] startRecording() called successfully.");
            } catch (recordingError) {
                console.error("[_startSessionInternal] Error calling startRecording:", recordingError);
                setLastError("Failed to start recording after connection.");
            }

            const currentSelectedVoice = useInterfaceStore.getState().selectedVoice;
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
             console.log("[_startSessionInternal] <<< DataChannel message received <<< ", event.data.substring(0, 100) + "...");
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

    const handleShareScreenAndStartSession = useCallback(async () => {
        console.log(`--- [handleShareScreenAndStartSession] Initiated.`);
        setLastError(null);
        clearRecordingError();

        const currentMicPerm = useInterfaceStore.getState().micPermission;
        const currentCamPerm = useInterfaceStore.getState().cameraPermission;

        if (sessionStatus !== 'DISCONNECTED' && sessionStatus !== 'ERROR') {
            console.warn("[handleShareScreenAndStartSession] Session already active or connecting.");
            return;
        }
        if (currentMicPerm !== "granted") {
            setLastError("Mikrofonberechtigung fehlt.");
            console.error("[handleShareScreenAndStartSession] Microphone permission not granted.");
            return;
        }
        if (currentCamPerm !== "granted") {
            setLastError("Kameraberechtigung fehlt.");
            console.error("[handleShareScreenAndStartSession] Camera permission not granted.");
            return;
        }

        let currentMicStream = useMediaStore.getState().micStream;
        if (!currentMicStream) {
            console.log("[handleShareScreenAndStartSession] Mic stream not active, attempting to activate...");
            const micStreamResult = await requestMicrophoneAccess();
            if (!micStreamResult) {
                setLastError("Mikrofon konnte nicht aktiviert werden.");
                console.error("[handleShareScreenAndStartSession] Failed to activate microphone stream.");
                return;
            }
            currentMicStream = micStreamResult;
            console.log("[handleShareScreenAndStartSession] Mic stream activated.");
        }

        let currentCameraStream = useMediaStore.getState().cameraStream;
        if (!currentCameraStream) {
            console.log("[handleShareScreenAndStartSession] Camera stream not active, attempting to activate...");
            await handleRequestCameraPermission();
            currentCameraStream = useMediaStore.getState().cameraStream;
            if (!currentCameraStream) {
                 setLastError("Kamera-Stream nach Aktivierung nicht gefunden.");
                 console.error("[handleShareScreenAndStartSession] Camera stream not found in store even after successful activation request.");
                 return;
            }
            console.log("[handleShareScreenAndStartSession] Camera stream activated.");
        }

        console.log("[handleShareScreenAndStartSession] Requesting screen permission NOW...");
        const screenStreamFromRequest = await requestScreenPermission();

        if (screenStreamFromRequest) {
            console.log("[handleShareScreenAndStartSession] Screen permission granted. Starting internal session logic...");
            _startSessionInternal(
                currentMicStream,
                currentCameraStream,
                screenStreamFromRequest
            );
        } else {
            console.error("[handleShareScreenAndStartSession] Screen permission denied or failed. Aborting.");
            setLastError("Bildschirmfreigabe fehlgeschlagen oder abgelehnt.");
        }

    }, [
        sessionStatus,
        requestMicrophoneAccess,
        handleRequestCameraPermission,
        requestScreenPermission,
        _startSessionInternal,
        clearRecordingError,
        setLastError,
    ]);

    const stopSession = useCallback(() => {
        console.log("[RealtimeChat] stopSession called.");
        setIsAssistantSpeaking(false);
        setSessionStatus('DISCONNECTED');
        if (recordingError) clearRecordingError();
        setLastError(null);

        stopRecording();
        cleanupConnection("Session ended");

        setRemoteStream(null);
        setIsSocraticGeneratingPrompt(false);
    }, [
        stopRecording,
        cleanupConnection,
        recordingError,
        clearRecordingError,
        setSessionStatus,
        setIsAssistantSpeaking,
        setRemoteStream,
        setIsSocraticGeneratingPrompt
    ]);

    useEffect(() => {
        return () => {
            console.log("RealtimeChat component unmounting. Cleaning up...");
            cleanupConnection("Component unmounted");
        };
    }, [cleanupConnection]);

    useEffect(() => {
        if (recordingStatus === 'stopped' && 
            recordedData.combinedBlob && 
            recordedData.screenBlob && 
            recordedData.assistantBlob && 
            sessionIdRef.current)
        {
            const participantId = localStorage.getItem('participantId') || `P_Unknown_${sessionIdRef.current.substring(0, 4)}`;
            console.log("Recording fully stopped, triggering ALL 3 downloads...");

            const combinedBlobType = recordedData.combinedBlob.type;
            let combinedExtension = 'webm'; 
             if (combinedBlobType.includes('mp4')) combinedExtension = 'mp4';
            console.log(`[Download Effect] Determined combined file extension: .${combinedExtension} from blob type: ${combinedBlobType}`);
            downloadFile(recordedData.combinedBlob, `${sessionIdRef.current}_${participantId}_Combined_(Cam+Mic).${combinedExtension}`);

            const screenBlobType = recordedData.screenBlob.type;
            let screenExtension = 'webm'; 
             if (screenBlobType.includes('mp4')) screenExtension = 'mp4';
            console.log(`[Download Effect] Determined screen file extension: .${screenExtension} from blob type: ${screenBlobType}`);
            downloadFile(recordedData.screenBlob, `${sessionIdRef.current}_${participantId}_Screen.${screenExtension}`);

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
             console.warn(`[Download Effect] Recording stopped, but not all blobs are ready: Combined=${!!recordedData.combinedBlob}, Screen=${!!recordedData.screenBlob}, Assistant=${!!recordedData.assistantBlob}`);
        }
    }, [recordingStatus, recordedData, downloadFile, sessionIdRef]);

    const isCameraStreamActive = !!cameraStream;
    const isMicPermissionGranted = micPermission === 'granted';
    const isCameraPermissionGranted = cameraPermission === 'granted';

    const canStartSession = isMicPermissionGranted && isCameraPermissionGranted && (sessionStatus === 'DISCONNECTED' || sessionStatus === 'ERROR');

    return (
         <div className={cn("flex flex-col h-full p-4 gap-4 bg-background")}>
             <div className="max-w-4xl w-full mx-auto flex flex-col h-full gap-4">
                <div className="flex justify-center items-center flex-shrink-0">
                    <h2 className="text-xl font-semibold text-foreground">Realtime Voice Assistant</h2>
                </div>

                {viewMode === 'transcript' && <ErrorDisplay lastError={lastError || recordingError} />}

                <div className="flex-shrink-0">
                    <ChatControls
                        shareScreenAndStartSession={handleShareScreenAndStartSession}
                        stopSession={stopSession}
                        isConnected={sessionStatus === 'CONNECTED'}
                        isConnecting={sessionStatus === 'CONNECTING'}
                        isSpeaking={isAssistantSpeaking}
                        canStartSession={canStartSession}
                    />
                </div>

                {viewMode === 'transcript' ? (
                    <div
                        ref={chatContainerRef}
                        className={cn(
                            "flex-grow rounded-md bg-card",
                            "h-0 min-h-[150px]",
                            "overflow-y-auto p-4 space-y-4",
                             isSocraticModeActiveUI ? 'rounded-b-md rounded-t-none' : 'rounded-md'
                        )}
                    >
                        {chatMessages.length === 0 && sessionStatus === 'CONNECTING' &&
                            <div className="flex justify-center items-center h-full">
                                 <div className="text-center text-muted-foreground italic">Connecting...</div>
                            </div>
                         }
                        {chatMessages.map((item: Item) => (
                            <React.Fragment key={item.id}>
                                {item.type === "message" && <Message message={item as MessageItem} />}
                                {item.type === "tool_call" && <ToolCall toolCall={item} />}
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    <VoiceOnlyView
                        isAssistantSpeaking={isAssistantSpeaking}
                        micPermission={micPermission}
                        sessionStatus={sessionStatus}
                        lastError={lastError}
                        isSocraticModeActiveUI={isSocraticModeActiveUI}
                        localFrequencyData={localFrequencyData}
                        remoteFrequencyData={remoteFrequencyData}
                    />
                )}

                 <audio ref={remoteAudioElement} hidden playsInline />
             </div>
        </div>
    );
}
