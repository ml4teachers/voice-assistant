import React from 'react';
import { Mic, MicOff } from 'lucide-react';

interface ChatControlsProps {
    isConnected: boolean;
    isConnecting: boolean;
    isSpeaking: boolean;
    currentUtterance: string;
    startSession: () => void;
    stopSession: () => void;
}

const ChatControls: React.FC<ChatControlsProps> = ({
    isConnected,
    isConnecting,
    isSpeaking,
    currentUtterance,
    startSession,
    stopSession
}) => {
    return (
        <>
            <div className="flex justify-center">
                <button
                    onClick={isConnected ? stopSession : startSession}
                    disabled={isConnecting}
                    title={isConnecting ? "Connecting..." : isConnected ? "Stop session" : "Start session"}
                    className={`px-6 py-3 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out text-white font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    isConnecting
                        ? 'bg-gray-400 cursor-not-allowed'
                        : isConnected
                        ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                        : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
                    }`}
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
                </button>
            </div>

            <div className="text-center text-sm text-gray-500 h-5">
                 {/* Show listening indicator only when currentUtterance is '...' or non-empty? */}
                 {isConnected && !isSpeaking && currentUtterance && <span className="text-blue-600 font-medium">Listening...</span>} 
                 {isConnected && isSpeaking && <span className="text-green-600 font-medium">Assistant Speaking...</span>} 
                 {!isConnected && !isConnecting && <span>Ready to connect</span>}
            </div>
        </>
    );
};

export default ChatControls; 