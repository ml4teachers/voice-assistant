import { RefObject } from "react";
import { EphemeralTokenResponse, Tool } from '@/components/realtime-types';

// Modify fetchEphemeralKey to accept ONLY tools
async function fetchEphemeralKey(tools: Tool[]): Promise<string | null> { // Remove tool_resources param
    try {
        console.log("Fetching ephemeral key with tools config:", { tools }); // Log only tools
        // Pass ONLY tools configuration in the request body
        const response = await fetch("/api/realtime-session", { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                // Optionally send model if needed 
                tools: tools, 
            }) 
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
            console.error("Error fetching ephemeral key:", response.status, errorData);
            return null;
        }
        const data: EphemeralTokenResponse = await response.json();
        if (!data.client_secret?.value) {
            console.error("No client_secret in response:", data);
            return null;
        }
        console.log("Ephemeral token fetched successfully.");
        return data.client_secret.value;
    } catch (error) {
        console.error("Network error fetching ephemeral key:", error);
        return null;
    }
}

export async function createRealtimeConnection(
    tools: Tool[],
    mediaStream: MediaStream,
    onRemoteTrack: (stream: MediaStream) => void
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel } | null> {
    // --- NEU: Fetch TURN Credentials FIRST ---
    console.log("Fetching TURN credentials...");
    let iceServers: RTCIceServer[] = [
        // Fallback public STUN server
        { urls: 'stun:stun.l.google.com:19302' }
    ];
    try {
        const response = await fetch('/api/turn-credentials');
        if (response.ok) {
            const data = await response.json();
            if (data.iceServers && Array.isArray(data.iceServers)) {
                console.log("Successfully fetched TURN credentials from backend.");
                iceServers = data.iceServers;
            } else {
                console.warn("Fetched TURN credentials response missing 'iceServers' array. Using STUN fallback.");
            }
        } else {
            console.error(`Failed to fetch TURN credentials: ${response.status} ${await response.text()}. Using STUN fallback.`);
        }
    } catch (error) {
        console.error("Network error fetching TURN credentials. Using STUN fallback.", error);
    }
    console.log("Using ICE Servers:", JSON.stringify(iceServers));
    // --- Ende TURN Fetch ---

    const ephemeralKey = await fetchEphemeralKey(tools);
    if (!ephemeralKey) {
        console.error("Failed to get ephemeral key.");
        return null;
    }

    let pc: RTCPeerConnection | null = null;
    try {
        // --- NEU: Verwende die geholten iceServers ---
        const configuration: RTCConfiguration = {
            iceServers: iceServers
            // Optional: iceTransportPolicy: 'relay' // Zum Testen nur über TURN
        };
        pc = new RTCPeerConnection(configuration); // Übergib die Konfiguration
        // -----------------------------------------
        console.log("PeerConnection created with fetched ICE Servers.");

        pc.ontrack = (e) => {
            console.log(`[connection.ts ontrack] Event received. Kind: ${e.track.kind}, Streams: ${e.streams.length}`);
            if (e.track.kind === 'audio' && e.streams && e.streams[0]) {
                console.log(`[connection.ts ontrack] Calling onRemoteTrack callback with stream ID: ${e.streams[0].id}`);
                onRemoteTrack(e.streams[0]);
            } else {
                console.warn("[connection.ts ontrack] Received track event without valid audio stream.");
            }
        };

        // Add tracks from the provided mediaStream
        if (mediaStream && mediaStream.getTracks().length > 0) {
            mediaStream.getTracks().forEach(track => {
                if (pc) {
                    pc.addTrack(track, mediaStream);
                    console.log(`Track added from provided stream: ${track.kind}`);
                }
            });
        } else {
            console.error("Provided mediaStream is invalid or has no tracks.");
            throw new Error("Invalid media stream provided.");
        }

        const dc = pc.createDataChannel("oai-data-channel", { ordered: true });
        console.log("Data channel created: oai-data-channel");

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("Offer created and set as local description.");

        const model = "gpt-4o-mini-realtime-preview";
        const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${ephemeralKey}`,
                "Content-Type": "application/sdp",
            },
        });

        if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            console.error("SDP exchange failed:", sdpResponse.status, errorText);
            throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
        }

        const answerSdp = await sdpResponse.text();
        const answer: RTCSessionDescriptionInit = { type: "answer", sdp: answerSdp };
        if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(answer);
            console.log("Answer received and set as remote description. Connection setup successful.");
        } else {
            console.warn(`Unexpected signaling state (${pc.signalingState}) before setting remote description. Aborting setup.`);
            throw new Error(`Unexpected signaling state: ${pc.signalingState}`);
        }

        return { pc, dc };

    } catch (error) {
        console.error("Error during WebRTC setup:", error);
        if (pc && pc.connectionState !== 'closed') {
            pc.close();
        }
        return null;
    }
}
