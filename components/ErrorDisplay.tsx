import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorDisplayProps {
    lastError: string | null;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ lastError }) => {
    if (!lastError) return null;

    return (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">Error: {lastError}</p>
        </div>
    );
};

export default ErrorDisplay; 