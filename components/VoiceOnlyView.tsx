'use client';

import React, { useEffect, useState, useRef } from 'react';
import { cn } from "@/lib/utils";
import { MicIcon, BotIcon, UserIcon } from "lucide-react";
type PermissionStatus = "prompt" | "granted" | "denied";
type SessionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";


interface VoiceOnlyViewProps {
    isAssistantSpeaking: boolean;
    micPermission: PermissionStatus;
    sessionStatus: SessionStatus;
    lastError: string | null;
    isSocraticModeActiveUI: boolean; // To maintain consistent styling/rounding
    // --- Change streams to volumes ---
    // localStream: MediaStream | null;  // User stream from mic
    // remoteStream: MediaStream | null; // Assistant stream from server
    localFrequencyData: Uint8Array | null;  // Changed prop
    remoteFrequencyData: Uint8Array | null; // Changed prop
    // -------------------------------
    
}

const NUM_BARS = 16; // Default number of bars
const BAR_DECAY_RATE = 0.06; // How quickly bars fall (lower = slower) - Adjusted slightly
// Renaming: Factor implies relative, but we now use it for a minimum relative height
const DEFAULT_BAR_MIN_HEIGHT_PERCENT = 0.1; // e.g., 10% minimum height relative to container

const FrequencyVisualizer = ({ 
    frequencyData, 
    activeColor, 
    numBars = NUM_BARS, // Use default if not provided
    minHeightFactor = DEFAULT_BAR_MIN_HEIGHT_PERCENT, // Use renamed default
    dataStartIndex = 0, // Default start index
    dataEndIndex = -1,    // Default end index (-1 means use full length)
    maxHeightFactors     // NEW: Optional array to scale max height per bar
}: { 
    frequencyData: Uint8Array | null, 
    activeColor: string, 
    numBars?: number,
    minHeightFactor?: number, // Keep prop name for consistency, but represents percent now
    dataStartIndex?: number,
    dataEndIndex?: number,
    maxHeightFactors?: number[] // NEW PROP TYPE
}) => {
    // Initialize state with the correct number of bars
    const [displayedBars, setDisplayedBars] = useState<number[]>(new Array(numBars).fill(minHeightFactor)); // Initialize with min height
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        // Reset bars if numBars changes, initialize with minHeightFactor
        setDisplayedBars(new Array(numBars).fill(minHeightFactor));
    }, [numBars, minHeightFactor]);

    // Animate bars towards target with decay
     useEffect(() => {
         let animationFrameId: number;

         const updateBars = () => {
             setDisplayedBars(currentBars => {
                 // Ensure currentBars has the correct length, fill with minHeightFactor if needed
                 const safeCurrentBars = currentBars.length === numBars ? currentBars : new Array(numBars).fill(minHeightFactor);
                 const effectiveEndIndex = dataEndIndex < 0 ? (frequencyData ? frequencyData.length : 0) : dataEndIndex;
                 // Map data, ensuring the result is at least minHeightFactor
                 const targetDataBars = frequencyData ? mapDataToBars(frequencyData, numBars, dataStartIndex, effectiveEndIndex) : new Array(numBars).fill(0);
                 const targetBars = targetDataBars.map(h => Math.max(minHeightFactor, h)); // Apply min height factor HERE

                 const nextBars = [...safeCurrentBars];
                 let changed = false;
                 for (let i = 0; i < numBars; i++) {
                     const targetHeight = targetBars[i]; // Target height (already includes min)
                     const currentHeight = safeCurrentBars[i];

                     if (Math.abs(targetHeight - currentHeight) < 0.001) {
                         nextBars[i] = targetHeight; // Snap if close enough
                     } else if (targetHeight > currentHeight) {
                         // Grow faster? Or just set directly?
                         // Let's try setting directly for faster response upwards
                         nextBars[i] = targetHeight;
                         changed = true;
                     } else {
                         // Decay slowly
                         nextBars[i] = Math.max(minHeightFactor, currentHeight - BAR_DECAY_RATE); // Ensure decay doesn't go below min
                         if (Math.abs(nextBars[i] - currentHeight) > 0.001) changed = true;
                     }
                 }

                 // Only update state if something actually changed
                 return changed ? nextBars : safeCurrentBars;
             });
             animationFrameId = requestAnimationFrame(updateBars);
         };

         animationFrameId = requestAnimationFrame(updateBars);

         return () => cancelAnimationFrame(animationFrameId);
     }, [frequencyData, numBars, dataStartIndex, dataEndIndex, minHeightFactor, BAR_DECAY_RATE]); // Added dependencies


    return (
        // Main container remains flex
        <div className="w-full h-full flex items-center justify-between overflow-hidden gap-1"> {/* Reduced gap slightly */}
            {displayedBars.map((height, index) => {
                // Height is already guaranteed >= minHeightFactor (0-1 range) from the animation logic
                
                // Get the max height factor for this specific bar, default to 1.0
                const maxFactor = maxHeightFactors?.[index] ?? 1.0;
                
                // Scale the current height by the max factor
                // const scaledHeight = height * maxFactor; // OLD: Incorrectly scaled min height

                // NEW LOGIC: Scale only height *above* the minimum
                const heightAboveMin = Math.max(0, height - minHeightFactor);
                const scaledHeightAboveMin = heightAboveMin * maxFactor;
                const finalHeight = minHeightFactor + scaledHeightAboveMin;
                
                // Convert the final scaled height to percentage
                const heightPercent = finalHeight * 100;

                return (
                    // Outer Wrapper: Fixed width, centers the inner bar
                    <div
                        key={index}
                        className="h-full w-[10%] flex items-center justify-center" // Fixed width, flex centering
                    >
                        {/* Inner Bar: Takes width, rounded, colored, animates height */}
                        <div
                            className="w-full rounded-full bg-primary transition-height duration-75 ease-out" // Use primary color directly
                            style={{
                                height: `${heightPercent}%`, // Animate height percentage
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
};

// Helper function to map frequency data to a smaller number of bars
// (Ensure this function returns values between 0 and 1)
function mapDataToBars(
    data: Uint8Array, 
    numBars: number, 
    startIndex: number = 0, // Start index for mapping
    endIndex: number = -1   // End index (exclusive), -1 means use full length
): number[] {
    const bars = new Array(numBars).fill(0);
    const effectiveEndIndex = endIndex < 0 ? data.length : Math.min(data.length, endIndex);
    const relevantDataLength = Math.max(0, effectiveEndIndex - startIndex);
    
    if (relevantDataLength === 0 || numBars === 0) return bars;

    const step = relevantDataLength / numBars; // Use float step

    for (let i = 0; i < numBars; i++) {
        const barStartIndex = Math.floor(i * step) + startIndex;
        const barEndIndex = Math.floor((i + 1) * step) + startIndex;
        const actualEndIndex = Math.min(barEndIndex, effectiveEndIndex);

        let sum = 0;
        let count = 0;
        for (let j = barStartIndex; j < actualEndIndex; j++) {
            if (j >= 0 && j < data.length) { // Bounds check
                sum += data[j];
                count++;
            }
        }
        // Average the values for the bar and normalize (0-255 -> 0-1)
        if (count > 0) {
            // Ensure result is capped at 1, can happen with high values?
            bars[i] = Math.min(1, (sum / count) / 255);
        } else {
            bars[i] = 0;
        }
    }
    return bars;
}
// -------------------------------------------

// Define the scaling factors for the assistant visualizer
const assistantMaxHeightFactors = [0.6, 0.8, 1.0, 1.0, 0.8, 0.6];

export default function VoiceOnlyView({
    isAssistantSpeaking,
    micPermission,
    sessionStatus,
    lastError,
    isSocraticModeActiveUI,
    localFrequencyData,  // Use new props
    remoteFrequencyData, // Use new props

}: VoiceOnlyViewProps) {


    return (
        <div className={cn(
            "flex-grow flex flex-col items-center justify-between rounded-md p-4 gap-8",
             // Apply rounding based on Socratic mode for consistency with transcript view
             isSocraticModeActiveUI ? 'rounded-b-md rounded-t-none' : 'rounded-md'
        )}>
            {/* Assistant Visualizer */}
            <div className="w-80 h-80 bg-muted border rounded-full flex items-center justify-center px-8 shadow-md my-16"> {/* Increased size */}
                 <div className="w-full h-[80%]"> {/* Increased inner container height */} 
                      {/* --- Use FrequencyVisualizer --- */}
                      <FrequencyVisualizer
                          frequencyData={remoteFrequencyData}
                          numBars={6} // Explicitly 6 bars
                          minHeightFactor={0.1} 
                          dataStartIndex={3} 
                          dataEndIndex={9} 
                          activeColor="hsl(var(--primary))"
                          maxHeightFactors={assistantMaxHeightFactors} // Pass the scaling factors
                      />
                      {/* -------------------------------- */}
                 </div>
            </div>

             {/* User Visualizer (no maxHeightFactors, uses default 1.0) */}
             <div className="flex items-center gap-3 w-full max-w-xs justify-center">
                 <MicIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                 <div className="w-40 h-20 flex items-center justify-center">
                    <FrequencyVisualizer
                        frequencyData={localFrequencyData}
                        numBars={6} 
                        minHeightFactor={0.2} // Keep user's higher min height
                        dataStartIndex={1} 
                        dataEndIndex={11} 
                        activeColor="hsl(var(--primary))"
                        // No maxHeightFactors prop here
                    />
                 </div>
            </div>

            {/* Minimal Status/Error Display */}
            <div className="text-center text-muted-foreground text-sm h-6"> {/* Fixed height to prevent layout shifts */}
                {sessionStatus === 'CONNECTED' && !lastError && (
                    <span>{isAssistantSpeaking ? 'Assistant Speaking...' : 'Listening...'}</span>
                )}
                 {sessionStatus === 'CONNECTING' && (
                    <span className="italic">Connecting...</span>
                )}
                 {lastError && ( // Show error prominently if it exists
                     <span className="text-destructive">{lastError}</span>
                 )}
                 {sessionStatus === 'DISCONNECTED' && !lastError && (
                    <span>Ready</span>
                 )}
                 {sessionStatus === 'ERROR' && !lastError && ( // Generic error if lastError is somehow null
                     <span className="text-destructive">Connection Error</span>
                 )}
            </div>

        </div>
    );
} 