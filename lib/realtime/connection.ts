import { RefObject } from "react";
import { EphemeralTokenResponse, Tool } from '@/components/realtime-types'; // Assuming type is here

// Define type for tool resources configuration - No longer needed here
/*
interface ToolResources {
    file_search?: {
        vector_store_ids?: string[];
    };
}
*/

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
                // tool_resources: tool_resources // <-- REMOVED
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
    audioElement: RefObject<HTMLAudioElement | null>,
    // Accept ONLY tools configuration as argument
    tools: Tool[]
    // tool_resources: ToolResources | null // <-- REMOVED
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel } | null> {
    // Pass ONLY tools configuration to fetchEphemeralKey
    const ephemeralKey = await fetchEphemeralKey(tools); // Remove tool_resources argument
    if (!ephemeralKey) {
        console.error("Failed to get ephemeral key.");
        return null;
    }

    let pc: RTCPeerConnection | null = null;
    let mediaStream: MediaStream | null = null;

    try {
        pc = new RTCPeerConnection();
        console.log("PeerConnection created.");

        pc.ontrack = (e) => {
            if (audioElement.current && e.track.kind === 'audio') { // Ensure it's an audio track
                console.log("Received remote audio track:", e.track.kind);
                // Check if srcObject is already set to avoid unnecessary re-assignment
                if (audioElement.current.srcObject !== e.streams[0]) {
                    audioElement.current.srcObject = e.streams[0];
                    audioElement.current.play().catch(err => console.error("Audio playback failed:", err));
                }
            }
        };

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStream.getTracks().forEach(track => {
                if (pc) { // Check if pc still exists
                    pc.addTrack(track, mediaStream!);
                }
            });
            console.log("Microphone access granted and track added.");
        } catch (err) {
            console.error("Error getting user media:", err);
            throw new Error("Microphone access denied or failed."); // Re-throw for connect function to catch
        }

        const dc = pc.createDataChannel("oai-data-channel", { ordered: true });
        console.log("Data channel created: oai-data-channel");

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("Offer created and set as local description.");

        // Select the appropriate model for the Realtime API session
        const model = "gpt-4o-mini-realtime-preview"; // Or fetch from config/constants if different
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
        // Check signaling state before setting remote description
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
        // Cleanup resources on error
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        if (pc && pc.connectionState !== 'closed') {
            pc.close();
        }
        return null; // Indicate failure
    }
}
