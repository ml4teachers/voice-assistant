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
import { Button } from "@/components/ui/button"; // Sicherstellen, dass Button importiert ist
import VoiceOnlyView from './VoiceOnlyView';
import { useAudioFrequencyData } from '@/hooks/useAudioVolumeAnalyzer';
import { Tool } from './realtime-types';
import { useRecording } from '@/hooks/useRecording';
import { useMediaStore } from '@/stores/mediaStreamStore';
import useInterfaceStore, { setPermissionRequestFunctions, type StoreState } from '@/stores/useInterfaceStore';
import { useShallow } from 'zustand/react/shallow';
import { useSessionControlStore } from '@/stores/useSessionControlStore';
import language from 'react-syntax-highlighter/dist/esm/languages/hljs/1c';
import { formatDataForTxt, downloadTxtFile } from './export-chat-txt';
import FeedbackSurvey from './FeedbackSurvey'; // Import FeedbackSurvey

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

    // Neue States für Dankesnachricht-Flow
    const [showThankYouMessage, setShowThankYouMessage] = useState(false);
    const [sessionJustEndedWithMessages, setSessionJustEndedWithMessages] = useState(false);
    const [showFeedbackSurvey, setShowFeedbackSurvey] = useState(false); // Neuer State für Feedback Survey

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
        clearError: clearRecordingError, // This is used
        startRecording,
        stopRecording,
        downloadFile
    } = useRecording();

    const sessionIdRef = useRef<string | null>(null);
    const participantIdRef = useRef<string | null>(null); // Ref für Participant ID

    const micStream = useMediaStore((state) => state.micStream);
    const cameraStream = useMediaStore((state) => state.cameraStream);
    // const screenStream = useMediaStore((state) => state.screenStream); // Not used
    const setMicStream = useMediaStore((state) => state.setMicStream);
    const setCameraStream = useMediaStore((state) => state.setCameraStream); // This is used
    const stopAllStreams = useMediaStore((state) => state.stopAllStreams);

    const requestMicrophoneAccess = useCallback(async (): Promise<MediaStream | null> => {
        console.log("[requestMicrophoneAccess] Requesting access...");
        try {
           const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
           setMicStream(stream);
           console.log(`[requestMicrophoneAccess] Access granted. Stream set in store (ID: ${stream?.id}).`);
           setMicPermission("granted");
           return stream;
        } catch (err) {
           console.error("[requestMicrophoneAccess] Error getting user media:", err);
           setMicStream(null);
           setMicPermission("denied");
           setLastError("Microphone access denied.");
           return null;
        }
    }, [setMicStream, setMicPermission]); // setLastError was removed as it's set inside

    const handleRequestCameraPermission = useCallback(async (): Promise<MediaStream | null> => {
        console.log("[handleRequestCameraPermission] Requesting camera permission directly...");
        setLastError(null);
        if (clearRecordingError) clearRecordingError(); // Ensure clearRecordingError is available and called if needed

        try {
            const constraints = { video: true, audio: false }; // Standard constraints for camera
            console.log("[handleRequestCameraPermission] Requesting user media with constraints:", constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log("[handleRequestCameraPermission] Got camera stream:", stream);
            setCameraStream(stream); // Update stream in useMediaStore
            console.log(`[handleRequestCameraPermission] Camera access granted. Stream set in store (ID: ${stream?.id}).`);
            setCameraPermission("granted"); // Update permission in useInterfaceStore
            return stream;
        } catch (err: any) {
            console.error("[handleRequestCameraPermission] Error getting user media for camera:", err);
            setCameraStream(null); // Clear stream in store on error
            setCameraPermission("denied"); // Set permission to denied in store

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setLastError("Camera access was denied. Please grant permission in your browser settings.");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setLastError("No camera found. Please ensure a camera is connected and enabled.");
            } else {
                setLastError("Failed to access camera. Please ensure it's not in use by another application and try again.");
            }
            return null;
        }
    }, [setLastError, setCameraStream, setCameraPermission, clearRecordingError]); // Added clearRecordingError to dependencies

    useEffect(() => {
        console.log("[Permission Setup Effect] Setting request functions in useInterfaceStore");
        const wrappedMicRequest = async () => { await requestMicrophoneAccess(); };
        // Corrected function name
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
            if (currentCamPerm === 'granted' && useInterfaceStore.getState().appMode !== 'demo') {
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
            if (initialState === 'granted' && useInterfaceStore.getState().appMode !== 'demo') {
                console.log("[Permission Effect] Camera initially granted, attempting activation...");
                setTimeout(activateCameraIfGranted, 100);
            }
            permissionStatus.onchange = () => {
                const newState = permissionStatus.state;
                console.log("[Permission Effect] Camera permission changed to:", newState);
                setCameraPermission(newState);
                 if (newState === 'granted' && useInterfaceStore.getState().appMode !== 'demo') {
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
        _screenStreamInternalToIgnore: MediaStream | null, // Parameter wird ignoriert
        forceRecording: boolean = false,
        participantIdFromConfig: string | null // Neuer Parameter für die Participant ID
    ) => {
        console.log("--- [_startSessionInternal] Starting internal logic --- ");
        if (!micStreamInternal) {
            console.error("[_startSessionInternal] Error: micStreamInternal is null or undefined. Aborting.");
            cleanupConnection("Internal error: Mic stream missing.");
            return;
        }
        // Entferne die Prüfung für screenStreamInternal, da Screen Recording deaktiviert ist
        // if (appMode === 'research' && !screenStreamInternal) {
        //     console.error("[_startSessionInternal] Error: screenStreamInternal is null or undefined. Aborting.");
        //     cleanupConnection("Internal error: Screen stream missing.");
        //     return;
        // }
        console.log(`[_startSessionInternal] Received Streams: Mic=${micStreamInternal.id}, Cam=${camStreamInternal?.id || 'N/A'}, Screen=N/A (deactivated)`);

        setIsAssistantSpeaking(false);
        setSessionStatus('CONNECTING');
        rawSetConversation({ chatMessages: [] });
        sessionIdRef.current = crypto.randomUUID();
        let pIdToUse: string;

        if (appMode === 'research') {
            if (participantIdFromConfig && participantIdFromConfig.trim() !== "") { // Verfeinerte Prüfung
                pIdToUse = participantIdFromConfig;
            } else {
                // Sicherstellen, dass sessionIdRef.current hier nicht null ist (sollte durch vorherige Zuweisung der Fall sein)
                pIdToUse = `P_Unknown_NoConfig_${sessionIdRef.current!.substring(0, 4)}`;
                console.warn(`[_startSessionInternal] Research mode but participantIdFromConfig was '${participantIdFromConfig || 'null/undefined'}'. Using fallback: ${pIdToUse}`);
            }
        } else { // developer mode
            pIdToUse = `DEV_${sessionIdRef.current!.substring(0, 4)}`;
        }
        participantIdRef.current = pIdToUse; // Participant ID im Ref speichern
        console.log(`[_startSessionInternal] participantIdRef.current set to: ${participantIdRef.current}`); // Hinzugefügtes Logging
        console.log(`[_startSessionInternal] SESSION_METADATA;${sessionIdRef.current};${participantIdRef.current};...`);

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
            // Auch im Demo-Modus den Mikrofon-Stream senden (keine Aufzeichnung, aber Audio für die Session nötig)
            const localStreamForConnection = micStreamInternal;
            connection = await createRealtimeConnection(
                toolsForSession,
                localStreamForConnection,
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

            let remoteAudioStreamFromElement: MediaStream | null = null;
            if (remoteAudioElement.current && remoteAudioElement.current.srcObject instanceof MediaStream) {
                remoteAudioStreamFromElement = remoteAudioElement.current.srcObject;
            }

            if (appMode === 'research') {
                try {
                    // Aufnahme von Cam/Mic und Assistant Audio im Research-Modus immer starten,
                    // da Screen Recording (und damit das ursprüngliche forceRecording-Konzept) entfernt wurde.
                    startRecording(
                        micStreamInternal,
                        camStreamInternal,
                        null, // ScreenStream ist explizit null, da deaktiviert
                        remoteAudioStreamFromElement
                    );
                    console.log('[Research Mode] startRecording() called for CamMic & Assistant Audio.');
                } catch (recordingError) {
                    console.error("[_startSessionInternal] Error calling startRecording:", recordingError);
                    setLastError('Fehler beim Start der Aufnahme.');
                }
            } else if (appMode === 'demo') {
                console.log('[Demo Mode] Keine Aufnahme wird gestartet.');
            }

            const socraticState = useSocraticStore.getState();
            const currentInstructions = (socraticState.isSocraticModeActive && socraticState.generatedSocraticPrompt)
                ? socraticState.generatedSocraticPrompt
                : DEVELOPER_PROMPT;
            console.log("[RealtimeChat] currentInstructions length:", currentInstructions.length);
            console.log("[RealtimeChat] currentInstructions (start):", currentInstructions.slice(0, 200));

            if (remoteAudioElement.current && remoteAudioElement.current.srcObject instanceof MediaStream) {
                remoteAudioStreamFromElement = remoteAudioElement.current.srcObject; // Weise den Wert erneut zu, falls nötig
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
        _forceRecording: boolean, // Wird ignoriert, da Screen Recording aus ist
        micStream: MediaStream,
        camStream: MediaStream | null,
        _screenStreamToIgnore: MediaStream | null // Wird ignoriert
    ) => {
        setLastError(null);
        clearRecordingError();
        const currentMicPerm = useInterfaceStore.getState().micPermission;
        const currentCamPerm = useInterfaceStore.getState().cameraPermission;
        const modeNow = useInterfaceStore.getState().appMode;
        if (modeNow === 'demo') {
            if (currentMicPerm !== 'granted') {
                setLastError('Bitte erteile Mikrofonzugriff.');
                return;
            }
        } else {
            if (currentMicPerm !== 'granted' || currentCamPerm !== 'granted') {
                setLastError('Bitte erteile Mikrofon- und Kamerazugriff.');
                return;
            }
        }
        if (!micStream) {
            setLastError('Mikrofon konnte nicht aktiviert werden.');
            return;
        }
        // Kamera-Stream ist optional, daher keine Fehlermeldung, wenn nicht vorhanden
        // if (!camStream) {
        //     setLastError('Kamera-Stream nach Aktivierung nicht gefunden.');
        //     return;
        // }

        // Entferne die Prüfung für forceRecording und screenStream, da Screen Recording aus ist
        // if (forceRecording && !screenStream) {
        //     setLastError('Bildschirmfreigabe fehlgeschlagen oder abgelehnt.');
        //     return;
        // }

        _startSessionInternal(
            micStream,
            camStream,
            null, // ScreenStream ist explizit null
            false, // forceRecording ist false, da Screen Recording aus ist
            config.participantId // Participant ID aus der Config hier übergeben
        );
    }, [requestMicrophoneAccess, handleRequestCameraPermission, /* requestScreenPermission removed */ _startSessionInternal, clearRecordingError]);

    // Start-Trigger-Effect
    useEffect(() => {
        const config = useSessionControlStore.getState().startRequestConfig;
        const directStart = useSessionControlStore.getState().directStartRequested;
        const mode = useInterfaceStore.getState().appMode;

        const tryStartSessionAfterOnboarding = async (onboardingConfig: { participantId: string; topic: string; mode: string }) => {
             console.log("Attempting start after onboarding (screen share deactivated):", onboardingConfig);
             setIsStartingSession(true);

             // Entferne den Aufruf von requestScreenPermission und die dazugehörige Fehlerbehandlung
             // console.log("Requesting screen permission...");
             // const screenStream = await requestScreenPermission(); // AUSKOMMENTIERT

             // if (!screenStream) { // AUSKOMMENTIERT
             //     const errorMsg = "Bildschirmfreigabe ist erforderlich und wurde abgelehnt oder ist fehlgeschlagen. Bitte versuchen Sie es erneut.";
             //     console.error(errorMsg);
             //     useSessionControlStore.getState().setOnboardingError(errorMsg);
             //     useSessionControlStore.getState().openOnboarding(5); // Zurück zum letzten Onboarding-Schritt
             //     useSessionControlStore.getState().clearStartRequest();
             //     setIsStartingSession(false);
             //     return;
             // }
             // console.log("Screen permission granted."); // AUSKOMMENTIERT

             // 2. Get Mic/Cam Streams (sollten bereits vorhanden/granted sein)
             let currentMicStream = useMediaStore.getState().micStream;
             if (!currentMicStream) {
                 currentMicStream = await requestMicrophoneAccess();
             }
              let currentCameraStream = useMediaStore.getState().cameraStream;
              if (useInterfaceStore.getState().appMode !== 'demo') {
                  if (!currentCameraStream && useInterfaceStore.getState().cameraPermission === 'granted') {
                      const camResult = await handleRequestCameraPermission();
                      // Warte, bis der Kamera-Stream im Store gesetzt ist (max. 1 Sekunde)
                      for (let i = 0; i < 10; i++) {
                        currentCameraStream = useMediaStore.getState().cameraStream;
                        if (currentCameraStream) break;
                        await new Promise(res => setTimeout(res, 100));
                      }
                      currentCameraStream = isMediaStream(currentCameraStream) ? currentCameraStream : null;
                  }
              } else {
                  currentCameraStream = null; // Demo: keine Kamera
              }

             if (!currentMicStream) {
                  console.log("Mikrofon-Stream nicht verfügbar. Bitte Berechtigung prüfen.");
                  // screenStream?.getTracks().forEach(t => t.stop()); // screenStream ist nicht mehr vorhanden
                  useSessionControlStore.getState().clearStartRequest();
                  setIsStartingSession(false);
                  return;
             }

             // screenStream wird nicht mehr validiert oder übergeben
             // const validatedScreenStream: MediaStream | null = (screenStream instanceof MediaStream) ? screenStream : null;

             await initiateSessionFromConfig(
                 onboardingConfig,
                 false, // forceRecording ist false, da Screen Recording aus ist
                 currentMicStream,
                 currentCameraStream,
                 null // screenStream ist explizit null
             );

             useSessionControlStore.getState().clearStartRequest();
             setIsStartingSession(false);
        };

        const tryDirectStart = async () => {
             console.log("Attempting direct start (non-research)...");
             setIsStartingSession(true);

             const modeNow = useInterfaceStore.getState().appMode;
             const isDemo = modeNow === 'demo';

             const currentMicStream = useMediaStore.getState().micStream || await requestMicrophoneAccess();
             let currentCameraStream = useMediaStore.getState().cameraStream;
             if (!isDemo) {
                 if (!currentCameraStream && useInterfaceStore.getState().cameraPermission === 'granted') {
                     const camResult = await handleRequestCameraPermission();
                     currentCameraStream = isMediaStream(camResult) ? camResult : null;
                 }
             } else {
                 currentCameraStream = null; // Demo-Modus: Kamera nicht verwenden
             }

             if (!currentMicStream) {
                 console.log("Mikrofon für Start benötigt.");
                 setIsStartingSession(false);
                 useSessionControlStore.getState().clearStartRequest();
                 return;
             }

             const cfg = { participantId: isDemo ? 'demo' : 'developer', topic: 'general', mode: 'General' };
             await initiateSessionFromConfig(
                 cfg,
                 false,
                 currentMicStream,
                 currentCameraStream,
                 null
             );

             useSessionControlStore.getState().clearStartRequest();
             setIsStartingSession(false);
        };

        if (config && (mode === 'research' || mode === 'demo')) {
            tryStartSessionAfterOnboarding(config);
        } else if (directStart && mode === 'developer') {
            tryDirectStart();
        }
        // Removed requestScreenPermission from dependencies
    }, [startRequestConfig, directStartRequested, clearStartRequest, initiateSessionFromConfig, requestMicrophoneAccess, handleRequestCameraPermission]);

    // handleStartClick für ChatControls
    const handleStartClick = useCallback(() => {
        const currentAppMode = useInterfaceStore.getState().appMode;
        if (currentAppMode === 'research' || currentAppMode === 'demo') {
            useSessionControlStore.getState().openOnboarding();
        } else {
            useSessionControlStore.getState().requestDirectStart();
        }
    }, []);

    // Definition von handleStopSessionClick
    const handleStopSessionClick = useCallback(() => {
        console.log("[RealtimeChat] handleStopSessionClick called.");
        setIsAssistantSpeaking(false);
        // setSessionStatus('DISCONNECTED'); // Wird durch cleanupConnection gesetzt
        if (recordingError) clearRecordingError();

        // Prüfen, ob Nachrichten vorhanden waren, BEVOR alles zurückgesetzt wird
        if (useConversationStore.getState().chatMessages.length > 0) {
            setSessionJustEndedWithMessages(true);
        }
        
        stopRecording(); 
        cleanupConnection(null); 
        setRemoteStream(null);
        setIsSocraticGeneratingPrompt(false);
    }, [
        stopRecording,
        cleanupConnection,
        recordingError,
        clearRecordingError,
        // chatMessages.length hier nicht als Abhängigkeit, da wir den Zustand über den Store prüfen
    ]);

    // Download, Reset und ThankYou-Nachricht Effekt
    useEffect(() => {
        // Nur ausführen, wenn die Session explizit als "gerade beendet mit Nachrichten" markiert wurde,
        // die Aufnahme gestoppt ist und die Session getrennt ist.
        // UND der Feedback Survey NICHT angezeigt wird (um eine Endlosschleife zu vermeiden, falls der Survey selbst den Status ändert)
        if (
            sessionJustEndedWithMessages &&
            recordingStatus === 'stopped' &&
            sessionStatus === 'DISCONNECTED' &&
            !showFeedbackSurvey &&
            !showThankYouMessage &&
            useInterfaceStore.getState().appMode !== 'demo'
        ) {
            console.log("[RealtimeChat] Download useEffect: Conditions met. Showing Feedback Survey.");
            // Zuerst den Survey anzeigen, anstatt direkt Downloads und Reset durchzuführen
            setShowFeedbackSurvey(true);
        }
    }, [
        sessionJustEndedWithMessages,
        recordingStatus,
        sessionStatus,
        showFeedbackSurvey, // Abhängigkeit hinzugefügt
        showThankYouMessage // Abhängigkeit hinzugefügt
        // recordedData, downloadFile, formatDataForTxt, downloadTxtFile sind hier nicht mehr direkt nötig,
        // da sie in handleFeedbackSubmit verwendet werden.
    ]);

    const handleFeedbackSubmit = useCallback((feedbackData: Record<string, number | string>) => {
        console.log("[RealtimeChat] Feedback submitted:", JSON.stringify(feedbackData)); // Log als JSON für Klarheit

        // Logik für Download und Reset, die vorher im useEffect war:
        const currentTranscript = useConversationStore.getState().chatMessages;
        console.log("[RealtimeChat] currentTranscript for download (after feedback):", JSON.stringify(currentTranscript, null, 2));

        const pIdForFilename = participantIdRef.current || `P_Unknown_${sessionIdRef.current?.substring(0, 4) || 'NoSession'}`;
        // Übergabe einer Kopie von feedbackData, um mögliche Mutationen zu vermeiden
        const formattedContent = formatDataForTxt(currentTranscript, { ...feedbackData }); 
        console.log("[RealtimeChat] formattedContent for download (after feedback):", formattedContent ? `\"${formattedContent.substring(0, 200)}...\"` : 'null or empty');

        const now = new Date();
        const swissTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
        const year = swissTime.getFullYear();
        const month = (swissTime.getMonth() + 1).toString().padStart(2, '0');
        const day = swissTime.getDate().toString().padStart(2, '0');
        const hours = swissTime.getHours().toString().padStart(2, '0');
        const minutes = swissTime.getMinutes().toString().padStart(2, '0');
        const formattedTimestamp = `${year}${month}${day}_${hours}${minutes}`;
        const transcriptFilename = `Transcript_${pIdForFilename}_${formattedTimestamp}.txt`;
        if (formattedContent && currentTranscript.length > 0 && useInterfaceStore.getState().appMode !== 'demo') {
            console.log(`[RealtimeChat] Attempting to download transcript (after feedback): ${transcriptFilename}`);
            downloadTxtFile(formattedContent, transcriptFilename);
        } else {
            console.log("[RealtimeChat] Transcript download SKIPPED (after feedback). Conditions not met.");
        }

        if (recordedData.combinedBlob && useInterfaceStore.getState().appMode !== 'demo') {
            const userMediaFilename = `User_${pIdForFilename}_${formattedTimestamp}.webm`;
            downloadFile(recordedData.combinedBlob, userMediaFilename);
        }
        if (recordedData.assistantBlob && useInterfaceStore.getState().appMode !== 'demo') {
            const assistantAudioFilename = `Assistant_${pIdForFilename}_${formattedTimestamp}.webm`;
            downloadFile(recordedData.assistantBlob, assistantAudioFilename);
        }

        // Stores zurücksetzen für die nächste Session
        useConversationStore.getState().rawSet({ chatMessages: [] });
        const socraticStore = useSocraticStore.getState();
        socraticStore.setIsSocraticModeActive(false);
        socraticStore.setCurrentSocraticTopic(null);
        socraticStore.setSelectedSocraticMode(null);
        socraticStore.setRetrievedSocraticContext(null);
        socraticStore.setGeneratedSocraticPrompt(null);
        socraticStore.setIsGeneratingPrompt(false);
        socraticStore.setSocraticDialogueState('idle');        
        useSessionControlStore.getState().setForceOnboardingStep(1); 
        useSessionControlStore.getState().setOnboardingError(null);
        useSessionControlStore.getState().clearStartRequest();        
        setShowFeedbackSurvey(false); // Feedback Survey ausblenden
        setShowThankYouMessage(true); // Dankesnachricht anzeigen
        setSessionJustEndedWithMessages(false); // Flag zurücksetzen

    }, [recordedData, downloadFile, formatDataForTxt, downloadTxtFile, sessionIdRef, participantIdRef]); // participantIdRef als Abhängigkeit hinzugefügt

    // Timeout und manuelle Rückkehr von der Dankesnachricht
    useEffect(() => {
        let timerId: NodeJS.Timeout | null = null;
        if (showThankYouMessage) {
            console.log("[RealtimeChat] Showing thank you message, starting 30s timer to return to start.");
            timerId = setTimeout(() => {
                console.log("[RealtimeChat] Thank you message timer elapsed, returning to start.");
                setShowThankYouMessage(false);
            }, 30000); // 30 Sekunden
        }
        return () => {
            if (timerId) {
                console.log("[RealtimeChat] Clearing thank you message timer.");
                clearTimeout(timerId);
            }
        };
    }, [showThankYouMessage]);

    const micStreamActive = micStream && micStream.getTracks().some(track => track.readyState === 'live');
    const cameraStreamActive = cameraStream && cameraStream.getTracks().some(track => track.readyState === 'live');

    const isCameraStreamActive = !!cameraStream;
    const isMicPermissionGranted = micPermission === 'granted';
    const isCameraPermissionGranted = cameraPermission === 'granted';

    const canStartSession = (
        sessionStatus === 'DISCONNECTED' || sessionStatus === 'ERROR'
    ) && (
        useInterfaceStore.getState().appMode === 'demo'
            ? true
            : (isMicPermissionGranted && isCameraPermissionGranted)
    );

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
            <div className="max-w-4xl w-full mx-auto flex flex-col h-full gap-8 mt-24">
                <div className="flex justify-center items-center flex-shrink-0">
                    <h2 className="text-4xl font-semibold text-foreground">Realtime Voice Assistant</h2>
                </div>

                {/* Conditional Rendering basierend auf showFeedbackSurvey und showThankYouMessage */}
                {showFeedbackSurvey ? (
                    <FeedbackSurvey onSubmit={handleFeedbackSubmit} />
                ) : showThankYouMessage ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-lg font-medium text-center p-4 gap-6"> {/* Increased gap */}
                        <p className="text-xl">Vielen Dank for Ihre Teilnahme!</p> {/* Larger text */}
                        <p className="text-muted-foreground">Die Daten wurden heruntergeladen und die Sitzung zurückgesetzt.</p>
                        <Button 
                            onClick={() => {
                                console.log("[RealtimeChat] 'Neue Sitzung starten' button clicked from thank you message.");
                                setShowThankYouMessage(false);
                            }} 
                            variant="default" // Default button style
                            size="lg" // Larger button
                        >
                            Neue Sitzung starten
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Fehleranzeige, falls vorhanden und relevant */}
                        {(lastError && sessionStatus !== 'CONNECTING') && ( // Zeige Fehler nicht, während aktiv verbunden wird
                            <ErrorDisplay lastError={lastError} />
                        )}
                        {/* recordingError wird oft spezifischer behandelt oder führt zu lastError */}
                        {/* {recordingError && <ErrorDisplay lastError={recordingError} />} */}

                        <div className="flex-shrink-0">
                            <ChatControls
                                onStartClick={handleStartClick}
                                onStopClick={handleStopSessionClick} 
                                isConnected={sessionStatus === 'CONNECTED'}
                                isConnecting={sessionStatus === 'CONNECTING'}
                                isSpeaking={isAssistantSpeaking}
                                canStartSession={canStartSession} 
                                handleHelpClick={handleHelpClick}
                                helpLoading={helpLoading}
                            />
                        </div>

                        {(sessionStatus === 'CONNECTED' || sessionStatus === 'CONNECTING') ? (
                            <>
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
                                        lastError={lastError} // lastError hier übergeben
                                        isSocraticModeActiveUI={isSocraticModeActiveUI}
                                        localFrequencyData={localFrequencyData}
                                        remoteFrequencyData={remoteFrequencyData}
                                    />
                                )}
                            </>
                        ) : (
                            // Fallback-Ansicht, wenn nicht verbunden und keine Dankesnachricht
                            <div className="flex-grow flex items-center justify-center text-lg font-medium text-center p-4">
                                {!lastError && "Sitzung nicht aktiv. Klicken Sie auf Start, um zu beginnen."}
                            </div>
                        )}
                    </>
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
