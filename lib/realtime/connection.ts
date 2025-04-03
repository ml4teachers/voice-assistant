import { RefObject } from "react";
import { EphemeralTokenResponse } from '@/components/realtime-types'; // Assuming type is here

async function fetchEphemeralKey(): Promise<string | null> {
    try {
        // Use your existing API route
        const response = await fetch("/api/realtime-session", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); // Send empty body or model if needed
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
    audioElement: RefObject<HTMLAudioElement | null>
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel } | null> {
    const ephemeralKey = await fetchEphemeralKey();
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
