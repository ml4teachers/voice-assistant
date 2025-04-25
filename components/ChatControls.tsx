import React from 'react';
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
                        { "cursor-not-allowed opacity-50": !canStartSession }
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
            <div className="text-center text-sm text-muted-foreground h-5 mt-1 w-full">
                 {isConnecting && <span>Connecting...</span>}
                 {isConnected && !isSpeaking && <span className="text-blue-600 font-medium">Listening...</span>}
                 {isConnected && isSpeaking && <span className="text-green-600 font-medium">Assistant Speaking...</span>}
                 {!isConnected && !isConnecting && canStartSession && <span>Ready to start</span>}
                 {!isConnected && !isConnecting && !canStartSession && <span className="text-yellow-600 font-medium">Check permissions in sidebar</span>}
            </div>
        </div>
    );
};

export default ChatControls;