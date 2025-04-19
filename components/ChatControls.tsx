import React from 'react';
import { Button } from "@/components/ui/button";
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, PhoneOffIcon, ScreenShareIcon, EraserIcon } from 'lucide-react';
import { cn } from "@/lib/utils";

// Define PermissionStatus type (can be moved to a central types file)
type PermissionStatus = "prompt" | "granted" | "denied";

interface ChatControlsProps {
    shareScreenAndStartSession: () => void;
    stopSession: () => void;
    clearConversation: () => void;
    micPermission: PermissionStatus;
    requestMicPermission: () => void;
    cameraPermission: PermissionStatus; // <<< ADDED this prop
    isCameraStreamActive: boolean;
    requestCameraPermission: () => void;
    isConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    canStartSession: boolean;
}

const ChatControls: React.FC<ChatControlsProps> = ({
    shareScreenAndStartSession,
    stopSession,
    clearConversation,
    micPermission,
    requestMicPermission,
    cameraPermission,
    isCameraStreamActive,
    requestCameraPermission,
    isConnected,
    isConnecting,
    isSpeaking,
    canStartSession,
}) => {
    const getMicIcon = () => {
        switch (micPermission) {
            case 'granted': return <MicIcon className="h-5 w-5" />;
            case 'denied': return <MicOffIcon className="h-5 w-5 text-destructive" />;
            case 'prompt':
            default: return <MicOffIcon className="h-5 w-5" />;
        }
    };

    const getCameraIcon = () => {
        return cameraPermission === 'granted' ? <VideoIcon className="h-5 w-5" /> : <VideoOffIcon className="h-5 w-5" />;
    };

    // Determine tooltip messages
    const micTooltip = micPermission === 'granted' ? "Microphone Granted" : micPermission === 'denied' ? "Microphone Denied" : "Request Microphone Permission";
    const cameraTooltip = cameraPermission === 'granted' ? "Camera Active" : "Activate Camera"; // Adjusted tooltip text
    let startTooltip = "Share Screen & Start Session";
    if (isConnected || isConnecting) {
        startTooltip = isConnecting ? "Connecting..." : "Session active";
    } else if (!canStartSession) {
        startTooltip = "Grant microphone and camera permissions first";
    }

    // Determine if mic permission has been granted (used for disabling start button)
    const isMicPermissionGranted = micPermission === 'granted';

    return (
        <div className="flex items-center justify-center gap-3 p-3 bg-card rounded-lg flex-wrap">
            {/* Mic Button */}
            <Button
                variant="outline"
                size="icon"
                onClick={requestMicPermission}
                disabled={micPermission === 'denied' || (isMicPermissionGranted && (isConnected || isConnecting))}
                title={micTooltip}
                className={cn({
                    "hover:bg-muted": micPermission === 'prompt' && !isConnected && !isConnecting,
                    "cursor-not-allowed opacity-50": micPermission === 'denied' || (isMicPermissionGranted && (isConnected || isConnecting)),
                    "border-green-500": isMicPermissionGranted,
                    "border-red-500": micPermission === 'denied'
                })}
            >
                {getMicIcon()}
            </Button>

            {/* Camera Button */}
            <Button
                variant="outline"
                size="icon"
                onClick={requestCameraPermission}
                disabled={cameraPermission === 'granted' && (isConnected || isConnecting)}
                title={cameraTooltip}
                className={cn({
                    "hover:bg-muted": cameraPermission !== 'granted' && !isConnected && !isConnecting,
                    "cursor-not-allowed opacity-50": cameraPermission === 'granted' && (isConnected || isConnecting),
                    "border-green-500": cameraPermission === 'granted'
                })}
            >
                {getCameraIcon()}
            </Button>

            {/* Share Screen & Start Session Button */}
            <Button
                variant="default"
                size="icon"
                onClick={shareScreenAndStartSession}
                disabled={!canStartSession || isConnected || isConnecting}
                title={startTooltip}
                className={cn(
                    "bg-green-600 hover:bg-green-700 text-white",
                    { "cursor-not-allowed opacity-50": !canStartSession || isConnected || isConnecting }
                )}
            >
                <ScreenShareIcon className="h-5 w-5" />
            </Button>

            {/* Stop Session Button */}
            <Button
                variant="destructive"
                size="icon"
                onClick={stopSession}
                disabled={!isConnected && !isConnecting}
                title="Stop Session"
                className={cn({
                    "cursor-not-allowed opacity-50": !isConnected && !isConnecting,
                    "animate-pulse": isConnecting
                })}
            >
                <PhoneOffIcon className="h-5 w-5" />
            </Button>

            {/* Clear Conversation Button */}
            <Button
                variant="outline"
                size="icon"
                onClick={clearConversation}
                title="Clear Conversation History"
                disabled={isConnected || isConnecting}
                className={cn({
                    "cursor-not-allowed opacity-50": isConnected || isConnecting
                })}
            >
                <EraserIcon className="h-5 w-5" />
            </Button>

            {/* Status Text Area */}
            <div className="text-center text-sm text-muted-foreground h-5 mt-1">
                {micPermission === 'denied' && <span className="text-red-600 font-medium">Mic access denied</span>}
                {micPermission === 'granted' && cameraPermission !== 'granted' && !isConnected && !isConnecting && <span className="text-yellow-600 font-medium">Camera permission needed</span>}
                {canStartSession && !isConnected && !isConnecting && <span>Ready to Share Screen & Start</span>}
                {micPermission === 'granted' && cameraPermission === 'granted' && isConnected && !isSpeaking && <span className="text-blue-600 font-medium">Listening...</span>}
                {micPermission === 'granted' && cameraPermission === 'granted' && isConnected && isSpeaking && <span className="text-green-600 font-medium">Assistant Speaking...</span>}
            </div>
        </div>
    );
};

export default ChatControls;