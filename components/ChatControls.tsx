import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { PhoneOffIcon, ScreenShareIcon, HelpCircle } from 'lucide-react'; 
import { cn } from "@/lib/utils";

interface ChatControlsProps {
    onStartClick: () => void;
    onStopClick: () => void;
    isConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    canStartSession: boolean;
    handleHelpClick: () => void;
    helpLoading?: boolean;
}

const ChatControls: React.FC<ChatControlsProps> = ({
    onStartClick,
    onStopClick,
    isConnected,
    isConnecting,
    isSpeaking,
    canStartSession,
    handleHelpClick,
    helpLoading = false,
}) => {
    const [remainingTime, setRemainingTime] = useState(300); // 5 minutes in seconds
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isConnected) {
            setRemainingTime(600); // Reset timer when connection starts
            timerRef.current = setInterval(() => {
                setRemainingTime(prevTime => prevTime - 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setRemainingTime(300); // Reset timer when disconnected
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isConnected]);

    useEffect(() => {
        if (remainingTime === 0) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            onStopClick();
        }
    }, [remainingTime, onStopClick]);

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    let startTooltip = "Share Screen & Start Session";
    if (isConnected || isConnecting) {
        startTooltip = isConnecting ? "Connecting..." : "Session active";
    } else if (!canStartSession) {
        startTooltip = "Grant permissions via sidebar first"; 
    }

    return (
        <div className="flex items-center justify-center gap-3 p-3 bg-card rounded-lg flex-wrap">
            {/* Entweder Start oder Stop Session Button */}
            {!isConnected && !isConnecting ? (
                <Button
                    variant="outline"
                    onClick={onStartClick}
                    disabled={!canStartSession}
                    title={startTooltip}
                    className={cn(
                        "rounded-full",
                        { "cursor-not-allowed opacity-50": !canStartSession },
                        { "animate-pulse-shadow": canStartSession } // <-- NEUE/WIEDERHERGESTELLTE ANIMATIONSKLASSE
                    )}
                >
                    <ScreenShareIcon className="h-5 w-5 mr-2" />
                    Start Session
                </Button>
            ) : (
                <Button
                    variant="outline"
                    onClick={onStopClick}
                    disabled={!isConnected && !isConnecting}
                    title="Stop Session"
                    className={cn(
                        "rounded-full",
                        { 
                            "cursor-not-allowed opacity-50": !isConnected && !isConnecting,
                            "animate-pulse": isConnecting 
                        }
                    )}
                >
                    <PhoneOffIcon className="h-5 w-5 mr-2" />
                    Stop Session
                </Button>
            )}

            {/* Help Button */}
            <Button
                variant="outline"
                size="icon"
                onClick={handleHelpClick}
                disabled={helpLoading}
                title="Call help"
                className="rounded-full"
            >
                <HelpCircle className="h-5 w-5" />
                <span className="sr-only">Call help</span>
            </Button>

            {/* Status Text Area */}
            <div className="text-center text-sm text-muted-foreground h-10 mt-1 w-full flex flex-col justify-center items-center">
                 {isConnecting && <span>Connecting...</span>}
                 {isConnected && (
                    <>
                        <span className="text-primary font-medium">
                            Verbleibende Zeit: {formatTime(remainingTime)}
                        </span>
                        {remainingTime <= 30 && remainingTime > 0 && (
                            <span className="text-yellow-600 font-medium text-xs">
                                Gespräch endet in Kürze
                            </span>
                        )}
                    </>
                 )}
                 {!isConnected && !isConnecting && canStartSession && <span>Ready to start</span>}
                 {!isConnected && !isConnecting && !canStartSession && <span className="text-yellow-600 font-medium">Check permissions in sidebar</span>}
            </div>
        </div>
    );
};

export default ChatControls;