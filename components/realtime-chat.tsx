"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, AlertTriangle } from 'lucide-react';
import {
    RealtimeEvent,
    ConversationTurn,
    EphemeralTokenResponse // Assuming this type is also moved or defined elsewhere
} from './realtime-types'; // Import the types from the new file
import ErrorDisplay from './ErrorDisplay'; // Import the new component
import ChatControls from './ChatControls'; // Import the new component
import ConversationDisplay from './ConversationDisplay'; // Import the new component

export default function RealtimeChat() {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false); 
    const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]); // Stores the full conversation history
    const [currentUtterance, setCurrentUtterance] = useState<string>(''); // Stores the transcript of the *current* user speech
    const [assistantResponse, setAssistantResponse] = useState<string>(''); // Stores the transcript of the *current* assistant speech
    const [lastError, setLastError] = useState<string | null>(null);

    // --- Use object buffer for accumulating user transcript deltas --- 
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const dataChannel = useRef<RTCDataChannel | null>(null);
    const localStream = useRef<MediaStream | null>(null);
    const remoteAudioElement = useRef<HTMLAudioElement | null>(null); 

    const cleanupConnection = useCallback((errorMsg: string | null = null) => {
        console.log("Cleaning up connection...", errorMsg ? `Reason: ${errorMsg}` : '');
        setLastError(errorMsg); 

        if (dataChannel.current) {
            if (dataChannel.current.readyState === 'open') {
                try { dataChannel.current.close(); } catch (e) { console.error("Error closing data channel:", e); }
            }
            dataChannel.current.onmessage = null;
            dataChannel.current.onopen = null;
            dataChannel.current.onclose = null;
            dataChannel.current.onerror = null;
            dataChannel.current = null;
        }

        if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
            localStream.current = null;
        }

        if (peerConnection.current) {
            if (peerConnection.current.connectionState !== 'closed') {
                try { peerConnection.current.close(); } catch (e) { console.error("Error closing peer connection:", e); }
            }
            peerConnection.current.onicecandidate = null;
            peerConnection.current.onconnectionstatechange = null;
            peerConnection.current.ontrack = null;
            peerConnection.current = null;
        }

        if (remoteAudioElement.current) {
            remoteAudioElement.current.srcObject = null;
            remoteAudioElement.current.pause();
        }

        setIsConnected(false);
        setIsConnecting(false);
        setIsSpeaking(false); 
        setCurrentUtterance(''); // Clear any in-progress utterance
        setAssistantResponse(''); // Clear any in-progress response
        // Keep conversation history upon cleanup
    }, []);

    const handleDataChannelMessage = useCallback((event: MessageEvent) => {
        try {
            const message: RealtimeEvent = JSON.parse(event.data); 
            // console.log('Data Channel Message Type:', message.type); // Log only type for less noise
            setLastError(null); 

            switch (message.type) { 
                case 'session.created': 
                    console.log('Conversation session created:', message.session.session_id);
                    setIsConnected(true);
                    setIsConnecting(false);
                    setConversationHistory([]);
                    break;
                case 'session.updated': 
                    console.log('Session updated.'); // Simplified log
                    break;
                case 'input_audio_buffer.speech_started':
                    console.log(`Speech started (item: ${message.item_id})`);
                    setCurrentUtterance('...');
                    break;
                case 'input_audio_buffer.speech_stopped':
                    console.log(`Speech stopped (item: ${message.item_id})`);
                    break;
                case 'input_audio_buffer.committed':
                    console.log(`Audio buffer committed (item: ${message.item_id})`);
                    break;
                case 'conversation.item.created':
                     // This often just signals the item exists, actual content comes later?
                     console.log(`Conversation item created (type: ${message.item?.type}, role: ${message.item?.role}, id: ${message.item?.id})`);
                     // Optionally clear previous assistant text here, 
                     // although response.created might be better
                     if (message.item?.role === 'assistant') {
                         // We don't do anything with the assistant item creation itself yet
                     }
                    break;
                // --- Re-added User Input Transcription Handling --- 
                case 'conversation.item.input_audio_transcription.delta':
                    // Append delta to the current utterance
                    setCurrentUtterance(prev => (prev === '...' ? '' : prev) + message.delta);
                    break;
                case 'conversation.item.input_audio_transcription.completed':
                    console.log(`User transcript completed (item: ${message.item_id}):`, message.transcript);
                    // Finalize current utterance and append it to history
                    setConversationHistory(prev => [...prev, { role: 'user', text: message.transcript, id: message.item_id }]);
                    setCurrentUtterance(''); // Clear current utterance display
                    break;
                case 'response.created': 
                    console.log(`Response created (id: ${message.response?.id})`); 
                    break;
                case 'response.done': 
                    console.log(`Response done (id: ${message.response?.id}, status: ${message.response?.status})`); 
                    if (message.response?.status === 'failed' || message.response?.status === 'cancelled') {
                        console.error('--> Response failed or cancelled:', message.response.status_details);
                        setLastError(`Response failed: ${message.response.status_details?.error?.message || message.response.status}`);
                    } 
                    break;
                case 'rate_limits.updated':
                    // console.log('Rate limits updated.'); // Likely not needed for UI
                    break;
                case 'response.output_item.added':
                    // console.log('Response output item added.'); // Info only
                    break;
                case 'response.content_part.added':
                    // console.log('Response content part added.'); // Info only
                    break;
                // --- Assistant Output Transcription --- 
                case 'response.audio_transcript.delta':
                    // console.log('Assistant transcript delta');
                    setAssistantResponse(prev => prev + message.delta);
                    break;
                case 'response.audio.done':
                    // console.log('Response audio part done.'); // Info only
                    break;
                case 'response.audio_transcript.done':
                    console.log('Assistant transcript done:', message.transcript);
                    // Add completed assistant response to history and clear current buffer
                    setConversationHistory(prev => [...prev, { role: 'assistant', text: message.transcript, id: message.response_id }]);
                    setAssistantResponse(''); // Clear current assistant response buffer
                    break;
                // -------------------------------------
                case 'response.content_part.done':
                    // console.log('Response content part done.'); // Info only
                    break;
                case 'response.output_item.done':
                    // console.log('Response output item done.'); // Info only
                    break;
                // --- Assistant Audio Buffer Handling --- 
                case 'output_audio_buffer.started': 
                    console.log('Output audio buffer started.'); 
                    setIsSpeaking(true);
                    break;
                 case 'output_audio_buffer.stopped': 
                    console.log('Output audio buffer stopped.'); 
                    setIsSpeaking(false);
                    break;
                // ---------------------------------------
                // --- Remove redundant/fallback handlers? --- 
                // case 'output_text.delta': ...
                // case 'output_text.done': ...
                // case 'output_audio.started': ... 
                // case 'output_audio.ended': ... 
                // -----------------------------------------
                case 'tool_calls':
                     console.log('Tool calls requested:', message.data.tool_calls);
                     // TODO: Implement actual tool call handling
                    break;
                case 'session.ended':
                    console.log('Conversation session ended by server.', message.data?.reason);
                    cleanupConnection(`Session ended: ${message.data?.reason || 'Server closed connection'}`);
                    break;
                case 'error':
                    console.error('Realtime API Error:', message.data);
                    cleanupConnection(`API Error: ${message.data.message}`);
                    break;
                default:
                    // Now we should have cases for most things, log the object if still unknown
                    const unknownMessage = message as any; // Explicit cast to handle 'never' type
                    console.warn('Received unknown event type:', unknownMessage?.type, unknownMessage);
            }

        } catch (error) {
            console.error('Error parsing data channel message:', error, event.data);
        }
    }, [cleanupConnection]);

    const handleIceCandidate = useCallback((event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
            console.log('ICE Candidate:', event.candidate.sdpMid, event.candidate.sdpMLineIndex);
        } else {
            console.log('End of ICE candidates.');
        }
    }, []);

    const handleConnectionStateChange = useCallback(() => {
        if (peerConnection.current) {
            const state = peerConnection.current.connectionState;
            console.log('Peer Connection State:', state);
            switch (state) {
                case 'connected':
                    setLastError(null);
                    break;
                case 'disconnected':
                    console.warn('Peer connection disconnected.');
                    break;
                case 'failed':
                    console.error('Peer connection failed.');
                    cleanupConnection('Connection failed');
                    break;
                case 'closed':
                    console.log('Peer connection closed.');
                    if(isConnected || isConnecting) {
                        cleanupConnection('Connection closed');
                    }
                    break;
            }
        }
    }, [cleanupConnection, isConnected, isConnecting]);

    const handleTrack = useCallback((event: RTCTrackEvent) => {
        console.log('Remote track received (Conversation Mode):', event.track, event.streams);
        console.log(`Incoming track muted state: ${event.track.muted}`);
        event.track.enabled = true; 
        if (remoteAudioElement.current) {
            remoteAudioElement.current.srcObject = event.streams && event.streams.length > 0 ? event.streams[0] : null;
            remoteAudioElement.current.muted = false; // Ensure NOT muted
            console.log(`Audio element muted state set to: ${remoteAudioElement.current.muted}`);
            remoteAudioElement.current.play().catch(e => {
                 console.error("Error playing remote audio:", e);
                 setLastError(`Error playing audio: ${e.message}. Please check browser permissions/settings.`);
            });
        } else {
            console.warn('Could not attach remote stream - No audio element reference.');
        }
    }, [setLastError]);

    const startSession = useCallback(async () => {
        if (isConnecting || isConnected) return;
        console.log("Attempting to start CONVERSATION session..."); 
        setIsConnecting(true);
        setLastError(null); 
        setConversationHistory([]);

        if (!remoteAudioElement.current) {
            console.log("Creating audio element for playback.");
            remoteAudioElement.current = new Audio();
            remoteAudioElement.current.autoplay = true; 
            remoteAudioElement.current.muted = false; 
        }

        try {
             console.log('Fetching ephemeral token...');
            const tokenResponse = await fetch('/api/realtime-session', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }, // Ensure header is set
                body: JSON.stringify({}) // Body can be empty if defaults are ok, or specify model if needed
            }); 
            if (!tokenResponse.ok) {
                 let errorMsg = `Token fetch failed: ${tokenResponse.status}`;
                try {
                    const errorData = await tokenResponse.json();
                    errorMsg += ` - ${errorData.error || JSON.stringify(errorData)}`;
                } catch { }
                throw new Error(errorMsg);
            }
            const tokenData: EphemeralTokenResponse = await tokenResponse.json();
            const ephemeralKey = tokenData.client_secret.value;
            console.log('Ephemeral token received.');

            console.log('Creating PeerConnection...');
            peerConnection.current = new RTCPeerConnection();
            peerConnection.current.onicecandidate = handleIceCandidate;
            peerConnection.current.onconnectionstatechange = handleConnectionStateChange;
            peerConnection.current.ontrack = handleTrack;

             console.log('Creating Data Channel...');
             dataChannel.current = peerConnection.current.createDataChannel('oai-events', { ordered: true });
             dataChannel.current.onmessage = handleDataChannelMessage;
             dataChannel.current.onopen = () => console.log('Data channel opened');
             dataChannel.current.onclose = () => {
                 console.log('Data channel closed');
                 if (peerConnection.current?.connectionState === 'connected') {
                     cleanupConnection('Data channel closed unexpectedly');
                 }
             };
             dataChannel.current.onerror = (err) => {
                 console.error('Data channel error:', err);
                 cleanupConnection('Data channel error');
             };

            console.log('Requesting microphone access...');
            try {
                localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                 console.error("Error getting user media:", err);
                throw new Error("Microphone access denied or not available.");
            }
            localStream.current.getTracks().forEach(track => {
                 if (peerConnection.current) {
                    peerConnection.current.addTrack(track, localStream.current!);
                    console.log('Local audio track added.');
                }
            });

             console.log('Creating SDP offer...');
            const offer = await peerConnection.current.createOffer();
            await peerConnection.current.setLocalDescription(offer);
            console.log('SDP offer created and set as local description.');

            const model = 'gpt-4o-mini-realtime-preview'; 
            const apiUrl = `https://api.openai.com/v1/realtime?model=${model}`;
            console.log(`Sending offer to ${apiUrl}...`);

             const sdpResponse = await fetch(apiUrl, {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    'Authorization': `Bearer ${ephemeralKey}`,
                    'Content-Type': 'application/sdp'
                },
            });

            if (!sdpResponse.ok) {
                 const errorText = await sdpResponse.text();
                throw new Error(`Failed to get SDP answer: ${sdpResponse.status} - ${errorText}`);
            }

            const answerSdp = await sdpResponse.text();
            console.log('SDP answer received.');
            const answer = {
                 type: 'answer' as const,
                sdp: answerSdp,
            };
            if (peerConnection.current.signalingState !== 'have-local-offer') {
                 console.warn(`Unexpected signaling state (${peerConnection.current.signalingState}) before setting remote description. Proceeding anyway.`);
            }
            await peerConnection.current.setRemoteDescription(answer);
            console.log('Remote description set. WebRTC connection negotiation complete.');

        } catch (error) {
             console.error('Error starting Conversation session:', error); 
            const errorMsg = error instanceof Error ? error.message : "Unknown error during startup";
            cleanupConnection(errorMsg); 
        }

    }, [isConnected, isConnecting, cleanupConnection, handleDataChannelMessage, handleIceCandidate, handleConnectionStateChange, handleTrack]);

    const stopSession = useCallback(() => {
        console.log("Stopping session manually...");
        cleanupConnection(); // Call cleanup without an error message
    }, [cleanupConnection]);

    useEffect(() => {
        return () => {
            console.log("RealtimeChat component unmounting. Cleaning up...");
            cleanupConnection("Component unmounted");
        };
    }, [cleanupConnection]);

    return (
        <div className="p-4 border rounded-lg shadow-md space-y-4 max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-center mb-4">Realtime Conversation</h2> 

            <ErrorDisplay lastError={lastError} /> 

            <ChatControls 
                isConnected={isConnected}
                isConnecting={isConnecting}
                isSpeaking={isSpeaking}
                currentUtterance={currentUtterance}
                startSession={startSession}
                stopSession={stopSession}
            />

            <ConversationDisplay 
                conversationHistory={conversationHistory}
                currentUtterance={currentUtterance}
                assistantResponse={assistantResponse}
            />
        </div>
    );
}
