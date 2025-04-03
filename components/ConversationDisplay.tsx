import React from 'react';
import { ConversationTurn } from './realtime-types';

interface ConversationDisplayProps {
    conversationHistory: ConversationTurn[];
    currentUtterance: string;
    assistantResponse: string;
}

const ConversationDisplay: React.FC<ConversationDisplayProps> = ({
    conversationHistory,
    currentUtterance,
    assistantResponse
}) => {
    if (conversationHistory.length === 0 && !currentUtterance && !assistantResponse) {
        return null; // Don't render anything if there's nothing to show
    }

    return (
        <div className="space-y-3 mt-4 p-4 border rounded-md bg-gray-50 max-h-[50vh] overflow-y-auto shadow-inner flex flex-col">
            {/* Render conversation history */} 
            {conversationHistory.map((turn) => (
                <div key={turn.id} className={`mb-2 ${turn.role === 'user' ? 'self-start' : 'self-end'}`}>
                    <h3 className={`font-medium text-sm mb-1 ${turn.role === 'user' ? 'text-blue-600' : 'text-green-600'}`}>
                        {turn.role === 'user' ? 'User' : 'Assistant'}:
                    </h3>
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed bg-white p-2 rounded-md shadow-sm">
                        {turn.text}
                    </p>
                </div>
            ))}
            {/* Display current user utterance (in progress) */} 
            {currentUtterance && (
                <div className="mb-2 self-start">
                    <h3 className="font-medium text-sm text-blue-600 mb-1">User:</h3>
                    <p className="text-gray-400 italic whitespace-pre-wrap leading-relaxed bg-white p-2 rounded-md shadow-sm">
                        {currentUtterance}
                    </p>
                </div>
            )}
            {/* Display current assistant response (in progress) */} 
            {assistantResponse && (
                <div className="mb-2 self-end">
                    <h3 className="font-medium text-sm text-green-600 mb-1">Assistant:</h3>
                    <p className="text-gray-400 italic whitespace-pre-wrap leading-relaxed bg-white p-2 rounded-md shadow-sm">
                        {assistantResponse}
                    </p>
                </div>
            )}
        </div>
    );
};

export default ConversationDisplay; 