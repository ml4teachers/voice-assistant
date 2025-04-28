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
import useInterfaceStore, { setPermissionRequestFunctions, type StoreState } from '@/stores/useInterfaceStore';
import { useShallow } from 'zustand/react/shallow';
import { useSessionControlStore } from '@/stores/useSessionControlStore';
import FeedbackSurvey from './FeedbackSurvey';
import PostSessionOptions from './PostSessionOptions';
import language from 'react-syntax-highlighter/dist/esm/languages/hljs/1c';

// Typ für Zustand-Callback

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

    const {
        viewMode,
        selectedVoice,
        micPermission,
        cameraPermission,
        setMicPermission,
        setCameraPermission
    } = useInterfaceStore(
        useShallow((state: StoreState) => ({
            viewMode: state.viewMode,
            selectedVoice: state.selectedVoice,
            micPermission: state.micPermission,
            cameraPermission: state.cameraPermission,
            setMicPermission: state.setMicPermission,
            setCameraPermission: state.setCameraPermission
        }))
    );

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

    const appMode = useInterfaceStore((state) => state.appMode);

    const { startRequestConfig, directStartRequested, clearStartRequest, openOnboarding } = useSessionControlStore();

    // _startSessionInternal zuerst deklarieren
    const _startSessionInternal = useCallback(async (
        micStreamInternal: MediaStream,
        camStreamInternal: MediaStream | null,
        screenStreamInternal: MediaStream | null,
        forceRecording: boolean = false
    ) => {
        console.log("--- [_startSessionInternal] Starting internal logic --- ");
        if (!micStreamInternal) {
            console.error("[_startSessionInternal] Error: micStreamInternal is null or undefined. Aborting.");
            cleanupConnection("Internal error: Mic stream missing.");
            return;
        }
        if (appMode === 'research' && !screenStreamInternal) {
            // Nur im Research-Mode ist ScreenStream Pflicht
            console.error("[_startSessionInternal] Error: screenStreamInternal is null or undefined. Aborting.");
            cleanupConnection("Internal error: Screen stream missing.");
            return;
        }
        // Logging ggf. anpassen:
        console.log(`[_startSessionInternal] Received Streams: Mic=${micStreamInternal.id}, Cam=${camStreamInternal?.id || 'N/A'}, Screen=${screenStreamInternal?.id || 'N/A'}`);

        setIsAssistantSpeaking(false);
        setSessionStatus('CONNECTING');
        rawSetConversation({ chatMessages: [] });
        sessionIdRef.current = crypto.randomUUID();
        let participantId: string;
        if (appMode === 'research') {
            participantId = localStorage.getItem('participantId') || `P_Unknown_${sessionIdRef.current.substring(0, 4)}`;
        } else {
            participantId = `DEV_${sessionIdRef.current.substring(0, 4)}`;
        }
        console.log(`[_startSessionInternal] SESSION_METADATA;${sessionIdRef.current};${participantId};...`);

        if (!remoteAudioElement.current) {
            console.error("[_startSessionInternal] Error: remoteAudioElement is null. Aborting.");
            cleanupConnection("Audio El missing");
            return;
        }
        const toolsForSession = getTools();
        console.log("[_startSessionInternal] Tools prepared. Reading Socratic state...");

        // Read Socratic state HERE
        const socraticState = useSocraticStore.getState();
        const instructionsForConnection = (socraticState.isSocraticModeActive && socraticState.generatedSocraticPrompt)
            ? socraticState.generatedSocraticPrompt
            : null;
        console.log(`[_startSessionInternal] Socratic state read. Instructions length for connection: ${instructionsForConnection?.length ?? 0}`);

        console.log("[_startSessionInternal] Attempting createRealtimeConnection...");
        let connection: { pc: RTCPeerConnection; dc: RTCDataChannel } | null = null;
        try {
            connection = await createRealtimeConnection(
                toolsForSession,
                micStreamInternal,
                handleRemoteStream
            );
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
            // LOG HIER EINFÜGEN:
            console.log('[RealtimeChat onopen] Checking Socratic State BEFORE sending update:', useSocraticStore.getState());
            const socraticState = useSocraticStore.getState();
            const currentInstructions = (socraticState.isSocraticModeActive && socraticState.generatedSocraticPrompt)
                ? socraticState.generatedSocraticPrompt
                : DEVELOPER_PROMPT;
            console.log("[RealtimeChat] currentInstructions length:", currentInstructions.length);
            console.log("[RealtimeChat] currentInstructions (start):", currentInstructions.slice(0, 200));

            let remoteAudioStreamFromElement: MediaStream | null = null;
            if (remoteAudioElement.current && remoteAudioElement.current.srcObject instanceof MediaStream) {
                remoteAudioStreamFromElement = remoteAudioElement.current.srcObject;
            }
            if (appMode === 'research') {
                // Nur im Research-Mode: startRecording mit ScreenStream
                try {
                    if (forceRecording) {
                        startRecording(
                            micStreamInternal,
                            camStreamInternal,
                            screenStreamInternal!,
                            remoteAudioStreamFromElement
                        );
                        console.log('[Onboarding/Research] startRecording() called successfully.');
                    }
                } catch (recordingError) {
                    console.error("[_startSessionInternal] Error calling startRecording:", recordingError);
                    setLastError('Fehler beim Start der Aufnahme.');
                }
            }

            const initialSessionUpdate = {
                type: "session.update",
                session: {
                    modalities: ["audio", "text"],
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16",
                    input_audio_transcription: { 
                        model: "gpt-4o-mini-transcribe",
                        language: "de",
                    },
                    voice: useInterfaceStore.getState().selectedVoice,
                    turn_detection: {
                         type: "semantic_vad",
                         eagerness: "high",
                         create_response: true,
                         interrupt_response: true,
                     },
                    instructions: currentInstructions, // <-- RESTORED
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
         startRecording, remoteAudioElement, getTools, handleServerEventRef, appMode, setLastError
     ]);

    // Initiate Session aus Config (Onboarding oder Dev)
    const [isStartingSession, setIsStartingSession] = useState(false);

    const initiateSessionFromConfig = useCallback(async (
        config: { participantId: string; topic: string; mode: string },
        forceRecording: boolean,
        micStream: MediaStream,
        camStream: MediaStream | null,
        screenStream: MediaStream | null
    ) => {
        setLastError(null);
        clearRecordingError();
        const currentMicPerm = useInterfaceStore.getState().micPermission;
        const currentCamPerm = useInterfaceStore.getState().cameraPermission;
        if (currentMicPerm !== 'granted' || currentCamPerm !== 'granted') {
            setLastError('Bitte erteile Mikrofon- und Kamerazugriff.');
            return;
        }
        if (!micStream) {
            setLastError('Mikrofon konnte nicht aktiviert werden.');
            return;
        }
        if (!camStream) {
            setLastError('Kamera-Stream nach Aktivierung nicht gefunden.');
            return;
        }
        if (forceRecording && !screenStream) {
            setLastError('Bildschirmfreigabe fehlgeschlagen oder abgelehnt.');
            return;
        }
        // Validiere den screenStream explizit als MediaStream oder null
        let validatedScreenStream: MediaStream | null = null;
        if (typeof screenStream === 'object' && screenStream !== null && screenStream instanceof MediaStream) {
            validatedScreenStream = screenStream;
        }
        _startSessionInternal(
            micStream,
            camStream,
            validatedScreenStream,
            forceRecording
        );
    }, [requestMicrophoneAccess, handleRequestCameraPermission, requestScreenPermission, _startSessionInternal, clearRecordingError]);

    // Start-Trigger-Effect
    useEffect(() => {
        const config = useSessionControlStore.getState().startRequestConfig;
        const directStart = useSessionControlStore.getState().directStartRequested;
        const mode = useInterfaceStore.getState().appMode;

        const tryStartSessionAfterOnboarding = async (onboardingConfig: { participantId: string; topic: string; mode: string }) => {
             console.log("Attempting start after onboarding:", onboardingConfig);
             setIsStartingSession(true);

             // 1. Request Screen Permission FIRST
             console.log("Requesting screen permission...");
             const screenStream = await requestScreenPermission();

             if (!screenStream) {
                 const errorMsg = "Bildschirmfreigabe ist erforderlich und wurde abgelehnt oder ist fehlgeschlagen. Bitte versuchen Sie es erneut.";
                 console.error(errorMsg);
                 useSessionControlStore.getState().setOnboardingError(errorMsg);
                 useSessionControlStore.getState().openOnboarding(5);
                 useSessionControlStore.getState().clearStartRequest();
                 setIsStartingSession(false);
                 return;
             }
             console.log("Screen permission granted.");

             // 2. Get Mic/Cam Streams (sollten bereits vorhanden/granted sein)
             let currentMicStream = useMediaStore.getState().micStream;
             if (!currentMicStream) {
                 currentMicStream = await requestMicrophoneAccess();
             }
             let currentCameraStream = useMediaStore.getState().cameraStream;
             if (!currentCameraStream && useInterfaceStore.getState().cameraPermission === 'granted') {
                 const camResult = await hookRequestCameraPermission();
                 // Warte, bis der Kamera-Stream im Store gesetzt ist (max. 1 Sekunde)
                 for (let i = 0; i < 10; i++) {
                   currentCameraStream = useMediaStore.getState().cameraStream;
                   if (currentCameraStream) break;
                   await new Promise(res => setTimeout(res, 100));
                 }
                 currentCameraStream = isMediaStream(currentCameraStream) ? currentCameraStream : null;
             }

             if (!currentMicStream) {
                  console.log("Mikrofon-Stream nicht verfügbar. Bitte Berechtigung prüfen.");
                  screenStream?.getTracks().forEach(t => t.stop());
                  useSessionControlStore.getState().clearStartRequest();
                  setIsStartingSession(false);
                  return;
             }

             // Validiere den screenStream explizit als MediaStream oder null
             const validatedScreenStream: MediaStream | null = (screenStream instanceof MediaStream) ? screenStream : null;

             await initiateSessionFromConfig(
                 onboardingConfig,
                 true,
                 currentMicStream,
                 currentCameraStream,
                 validatedScreenStream
             );

             useSessionControlStore.getState().clearStartRequest();
             setIsStartingSession(false);
        };

        const tryDirectDeveloperStart = async () => {
             console.log("Attempting direct developer start...");
             setIsStartingSession(true);

             const currentMicStream = useMediaStore.getState().micStream || await requestMicrophoneAccess();
             let currentCameraStream = useMediaStore.getState().cameraStream;
             if (!currentCameraStream && useInterfaceStore.getState().cameraPermission === 'granted') {
                 const camResult = await hookRequestCameraPermission();
                 currentCameraStream = isMediaStream(camResult) ? camResult : null;
             }

             if (!currentMicStream) {
                 console.log("Mikrofon für Dev-Start benötigt.");
                 setIsStartingSession(false);
                 useSessionControlStore.getState().clearStartRequest();
                 return;
             }

              const devConfig = { participantId: 'developer', topic: 'general', mode: 'General' };
              const nullScreenStream: MediaStream | null = null;
              await initiateSessionFromConfig(
                  devConfig,
                  false,
                  currentMicStream,
                  currentCameraStream,
                  nullScreenStream
              );

             useSessionControlStore.getState().clearStartRequest();
             setIsStartingSession(false);
        };

        if (config && mode === 'research') {
            tryStartSessionAfterOnboarding(config);
        } else if (directStart && mode === 'developer') {
            tryDirectDeveloperStart();
        }
    }, [startRequestConfig, directStartRequested, clearStartRequest, requestScreenPermission, initiateSessionFromConfig, requestMicrophoneAccess, hookRequestCameraPermission]);

    // handleStartClick für ChatControls
    const handleStartClick = useCallback(() => {
        const currentAppMode = useInterfaceStore.getState().appMode;
        if (currentAppMode === 'research') {
            useSessionControlStore.getState().openOnboarding();
        } else {
            useSessionControlStore.getState().requestDirectStart();
        }
    }, []);

    // Post-Session Flow State
    const [postSessionStep, setPostSessionStep] = useState<'options' | 'survey' | null>(null);
    const [surveyAnswers, setSurveyAnswers] = useState<Record<string, number | string> | null>(null);

    const stopSession = useCallback(() => {
        console.log("[RealtimeChat] stopSession called.");
        setIsAssistantSpeaking(false);
        setSessionStatus('DISCONNECTED');
        if (recordingError) clearRecordingError();
        stopRecording();
        cleanupConnection(null); // Kein Fehlertext beim normalen Stop
        setRemoteStream(null);
        setIsSocraticGeneratingPrompt(false);
        // Nach Beenden: Post-Session-Options anzeigen
        setPostSessionStep('options');
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

    // Helper: TXT-Export
    function formatDataForTxt(transcript: Item[], surveyData: Record<string, number | string> | null): string {
        // Format wie in export-chat-txt: User/Assistant: Text
        const lines = transcript
            .filter((msg) => msg.type === "message" && typeof (msg as any).role === "string" && Array.isArray((msg as any).content))
            .map((msg: any) => {
                const who = msg.role === "user" ? "User" : "Assistant";
                const text = msg.content?.[0]?.text ?? "";
                return `${who}: ${text}`;
            });
        let txt = lines.join("\n\n");
        txt += '\n\n=== FEEDBACK ===\n';
        if (surveyData) {
            Object.entries(surveyData).forEach(([key, value]) => {
                txt += `${key}: ${value}\n`;
            });
        }
        return txt;
    }

    function downloadTxtFile(content: string, filename: string) {
        try {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            console.log(`[Download] Triggered download for ${filename}`);
        } catch (err) {
            console.error("Error creating TXT download link:", err);
        }
    }

    // Handler für Post-Session Optionen & Survey
    const handleContinueTopic = () => {
        console.log("TODO: Implement Continue Topic");
        setPostSessionStep(null);
    };
    const handleNewTopic = () => {
        console.log("Resetting for new topic...");
        const socraticStore = useSocraticStore.getState();
        socraticStore.setIsSocraticModeActive(false);
        socraticStore.setCurrentSocraticTopic(null);
        socraticStore.setSelectedSocraticMode(null);
        socraticStore.setRetrievedSocraticContext(null);
        socraticStore.setGeneratedSocraticPrompt(null);
        socraticStore.setIsGeneratingPrompt(false);
        socraticStore.setSocraticDialogueState('idle');
        useConversationStore.getState().rawSet({ chatMessages: [] });
        setPostSessionStep(null);
        useSessionControlStore.getState().openOnboarding();
    };
    const handleEndExperiment = () => {
        setPostSessionStep('survey');
    };
    const handleSurveySubmit = (answers: Record<string, number | string>) => {
        console.log("Survey submitted:", answers);
        setSurveyAnswers(answers);
        const currentTranscript = useConversationStore.getState().chatMessages;
        const formattedContent = formatDataForTxt(currentTranscript, answers);
        const participantId = localStorage.getItem('participantId') || `P_Unknown_${sessionIdRef.current?.substring(0, 4) || 'NoSession'}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Session_${sessionIdRef.current?.substring(0, 8) || 'NoSessionID'}_${participantId}_Feedback_${timestamp}.txt`;
        downloadTxtFile(formattedContent, filename);
        // Download der drei Mediendateien (wie in useRecording)
        if (recordedData.combinedBlob) downloadFile(recordedData.combinedBlob, `Video_CamMic_${timestamp}.webm`);
        if (recordedData.screenBlob) downloadFile(recordedData.screenBlob, `Screen_${timestamp}.webm`);
        if (recordedData.assistantBlob) downloadFile(recordedData.assistantBlob, `AssistantAudio_${timestamp}.webm`);
        // Nach Abschluss alles zurücksetzen
        useConversationStore.getState().rawSet({ chatMessages: [] });
        useSocraticStore.getState().setIsSocraticModeActive(false);
        setPostSessionStep(null); // Kein Dialog mehr anzeigen
        // Optional: Interface-Store zurücksetzen (z.B. ViewMode)
        // useInterfaceStore.getState().setViewMode('transcript');
        // Onboarding für nächsten User vorbereiten, aber nicht öffnen
        useSessionControlStore.getState().setForceOnboardingStep(1);
        useSessionControlStore.getState().setOnboardingError(null);
        useSessionControlStore.getState().clearStartRequest();
    };

    const isCameraStreamActive = !!cameraStream;
    const isMicPermissionGranted = micPermission === 'granted';
    const isCameraPermissionGranted = cameraPermission === 'granted';

    const canStartSession = isMicPermissionGranted && isCameraPermissionGranted && (sessionStatus === 'DISCONNECTED' || sessionStatus === 'ERROR');

    const [helpLoading, setHelpLoading] = useState(false);

    const handleHelpClick = async () => {
        setHelpLoading(true);
        try {
            const response = await fetch("/api/notify-help", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Hilfe von einem Studienteilnehmer angefordert!" }),
            });
            if (response.ok) {
                alert("Hilfe wurde benachrichtigt.");
            } else {
                alert("Fehler beim Senden der Hilfeanfrage.");
            }
        } catch (error) {
            console.error("Error sending help request:", error);
            alert("Netzwerkfehler beim Senden der Hilfeanfrage.");
        } finally {
            setHelpLoading(false);
        }
    };

    return (
        <div className={cn("flex flex-col h-full p-4 gap-4 bg-background")}> 
            <div className="max-w-4xl w-full mx-auto flex flex-col h-full gap-4">
                <div className="flex justify-center items-center flex-shrink-0">
                    <h2 className="text-xl font-semibold text-foreground">Realtime Voice Assistant</h2>
                </div>

                {/* Conditional Rendering für Post-Session-Flow */}
                {(sessionStatus === 'CONNECTED' || sessionStatus === 'CONNECTING' || (sessionStatus === 'DISCONNECTED' && !postSessionStep)) ? (
                    <>
                        {viewMode === 'transcript' && lastError && <ErrorDisplay lastError={lastError || recordingError} />}
                        <div className="flex-shrink-0">
                            <ChatControls
                                onStartClick={handleStartClick}
                                onStopClick={stopSession}
                                isConnected={sessionStatus === 'CONNECTED'}
                                isConnecting={sessionStatus === 'CONNECTING'}
                                isSpeaking={isAssistantSpeaking}
                                canStartSession={canStartSession}
                                handleHelpClick={handleHelpClick}
                                helpLoading={helpLoading}
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
                    </>
                ) : postSessionStep === 'options' ? (
                    <PostSessionOptions
                        onContinueTopic={handleContinueTopic}
                        onNewTopic={handleNewTopic}
                        onEndExperiment={handleEndExperiment}
                    />
                ) : postSessionStep === 'survey' ? (
                    <FeedbackSurvey onSubmit={handleSurveySubmit} />
                ) : (
                    <div className="flex-grow flex items-center justify-center">Vielen Dank für Ihre Teilnahme!</div>
                )}

                <audio ref={remoteAudioElement} hidden playsInline />
            </div>
        </div>
    );
}

// Hilfsfunktion für sichere MediaStream-Prüfung
function isMediaStream(val: unknown): val is MediaStream {
  return typeof val === 'object' && val !== null && typeof (val as MediaStream).getTracks === 'function';
}
