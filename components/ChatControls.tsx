import React from 'react';
import { Mic, MicOff, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface ChatControlsProps {
    isConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    currentUtterance: string;
    startSession: () => void;
    stopSession: () => void;
    clearConversation: () => void;
}

const ChatControls: React.FC<ChatControlsProps> = ({
    isConnected,
    isConnecting,
    isSpeaking,
    currentUtterance,
    startSession,
    stopSession,
    clearConversation
}) => {
    return (
        <>
            <div className="flex flex-col items-center gap-3">
                <div className="flex justify-center items-center gap-4">
                    <Button
                        onClick={isConnected ? stopSession : startSession}
                        disabled={isConnecting}
                        variant={isConnected ? "destructive" : "default"}
                        size="lg"
                        className="px-6 py-3 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        title={isConnecting ? "Connecting..." : isConnected ? "Stop session" : "Start session"}
                    >
                        {isConnecting ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Connecting...
                            </>
                        ) : isConnected ? (
                            <><MicOff className="mr-2 h-5 w-5" /> Stop Session</>
                        ) : (
                            <><Mic className="mr-2 h-5 w-5" /> Start Session</>
                        )}
                    </Button>

                    <Button 
                        onClick={clearConversation} 
                        variant="outline"
                        size="icon"
                        className="rounded-full"
                        title="Clear conversation"
                        disabled={isConnecting}
                     >
                         <Trash2 className="h-5 w-5" />
                     </Button>
                </div>

                <div className="text-center text-sm text-muted-foreground h-5 mt-1">
                     {isConnected && !isSpeaking && currentUtterance && <span className="text-blue-600 font-medium">Listening...</span>} 
                     {isConnected && isSpeaking && <span className="text-green-600 font-medium">Assistant Speaking...</span>} 
                     {!isConnected && !isConnecting && <span>Ready to connect</span>}
                </div>
            </div>
        </>
    );
};

export default ChatControls; 