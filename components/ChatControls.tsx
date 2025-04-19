import React from 'react';
import { Button } from "@/components/ui/button";
import { PhoneOffIcon, ScreenShareIcon } from 'lucide-react'; 
import { cn } from "@/lib/utils";

interface ChatControlsProps {
    shareScreenAndStartSession: () => void;
    stopSession: () => void;
    isConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    canStartSession: boolean;
}

const ChatControls: React.FC<ChatControlsProps> = ({
    shareScreenAndStartSession,
    stopSession,
    isConnected,
    isConnecting,
    isSpeaking,
    canStartSession,
}) => {
    let startTooltip = "Share Screen & Start Session";
    if (isConnected || isConnecting) {
        startTooltip = isConnecting ? "Connecting..." : "Session active";
    } else if (!canStartSession) {
        startTooltip = "Grant permissions via sidebar first"; 
    }

    return (
        <div className="flex items-center justify-center gap-3 p-3 bg-card rounded-lg flex-wrap">
            {/* Share Screen & Start Session Button */}
            <Button
                variant="outline"
                onClick={shareScreenAndStartSession}
                disabled={!canStartSession || isConnected || isConnecting}
                title={startTooltip}
                className={cn(
                    "rounded-full",
                    { "cursor-not-allowed opacity-50": !canStartSession || isConnected || isConnecting }
                )}
            >
                <ScreenShareIcon className="h-5 w-5 mr-2" />
                Start Session
            </Button>

            {/* Stop Session Button */}
            <Button
                variant="outline"
                onClick={stopSession}
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