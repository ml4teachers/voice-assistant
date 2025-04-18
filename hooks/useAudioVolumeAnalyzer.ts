// hooks/useAudioVolumeAnalyzer.ts
import { useState, useEffect, useRef } from 'react';

// Default smoothing for the AnalyserNode itself
const DEFAULT_SMOOTHING_TIME_CONSTANT = 0.6;

export function useAudioFrequencyData(
    stream: MediaStream | null,
    fftSize: number = 256 // Default FFT size (power of 2)
): Uint8Array | null { // Return the raw frequency data array
    // State now holds the frequency data array
    const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    // dataArrayRef will hold the Uint8Array for frequency data
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);

    useEffect(() => {
        // Cleanup function
        const cleanup = () => {
            // console.log(`[useAudioFrequencyData] Cleaning up for stream: ${stream?.id}`);
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            sourceRef.current?.disconnect();
            sourceRef.current = null;
            analyserRef.current?.disconnect();
            // console.log("Analyser disconnected");
            analyserRef.current = null;
            // Don't close context here, might be shared or reused - let it be garbage collected if needed
            // audioContextRef.current?.close().catch(console.error);
            audioContextRef.current = null;
            dataArrayRef.current = null;
            setFrequencyData(null); // Reset state on cleanup
        };

        if (stream) {
            // console.log(`[useAudioFrequencyData] Setting up for stream: ${stream.id}, fftSize: ${fftSize}`);
            // Perform cleanup before setting up new refs
            cleanup();

            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = fftSize;
                // Set smoothing for the frequency data analysis
                analyserRef.current.smoothingTimeConstant = DEFAULT_SMOOTHING_TIME_CONSTANT;

                sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                // Use Uint8Array for getByteFrequencyData - size is frequencyBinCount
                dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

                // console.log(`[useAudioFrequencyData] frequencyBinCount: ${analyserRef.current.frequencyBinCount}`);

                sourceRef.current.connect(analyserRef.current);
                // console.log("Source connected to Analyser");
                // Do not connect analyser to destination

                const loop = () => {
                    if (!analyserRef.current || !dataArrayRef.current) {
                        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                        // console.log("[useAudioFrequencyData] Loop exit: Analyser or dataArray missing.");
                        return;
                    }

                    try {
                        // Get frequency data
                        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

                        // Update state with a *copy* of the data array to trigger re-render
                        // Important: AnalyserNode reuses the buffer, so we need to copy.
                        setFrequencyData(new Uint8Array(dataArrayRef.current));

                        animationFrameIdRef.current = requestAnimationFrame(loop);

                    } catch (err) {
                        console.error("[useAudioFrequencyData] Error in analysis loop:", err); // Corrected console.error
                        // Attempt to stop the loop on error to prevent spamming
                        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                        cleanup(); // Perform cleanup on loop error
                    }
                };

                animationFrameIdRef.current = requestAnimationFrame(loop);

            } catch (error) {
                console.error("[useAudioFrequencyData] Error setting up Web Audio API:", error);
                cleanup();
            }
        } else {
            // Stream removed or null initially
            cleanup();
        }

        // Return cleanup function
        return cleanup;

    }, [stream, fftSize]); // Rerun effect if stream or fftSize changes

    return frequencyData; // Return the array
}