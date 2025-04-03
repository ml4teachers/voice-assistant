import { WebSearchConfig } from "@/stores/useToolsStore";

export interface EphemeralTokenResponse {
    client_secret: {
        value: string;
    };
    id: string;
}

export interface RealtimeEventBase { type: string; event_id?: string; }
export interface SessionCreatedEvent extends RealtimeEventBase { type: 'session.created'; session: { session_id: string }; }
export interface SessionEndedEvent extends RealtimeEventBase { type: 'session.ended'; data?: { reason?: string }; }
export interface SessionUpdatedEvent extends RealtimeEventBase { type: 'session.updated'; session: any; }
export interface InputAudioSpeechStartedEvent extends RealtimeEventBase { type: 'input_audio_buffer.speech_started'; audio_start_ms: number; item_id: string; }
export interface InputAudioSpeechStoppedEvent extends RealtimeEventBase { type: 'input_audio_buffer.speech_stopped'; audio_end_ms: number; item_id: string; }
export interface InputAudioCommittedEvent extends RealtimeEventBase { type: 'input_audio_buffer.committed'; previous_item_id: string | null; item_id: string; }
export interface ConversationItemCreatedEvent extends RealtimeEventBase { 
    type: 'conversation.item.created'; 
    previous_item_id: string | null; 
    item: { 
        id: string;
        type: string; 
        role?: 'user' | 'assistant'; 
        content?: { type: string; text?: string; audio?: any }[]; 
    }; 
}
export interface InputAudioTranscriptionDeltaEvent extends RealtimeEventBase { type: 'conversation.item.input_audio_transcription.delta'; item_id: string; content_index: number; delta: string; }
export interface InputAudioTranscriptionCompletedEvent extends RealtimeEventBase { type: 'conversation.item.input_audio_transcription.completed'; item_id: string; content_index: number; transcript: string; }
export interface ResponseCreatedEvent extends RealtimeEventBase { type: 'response.created'; response: { id: string }; }
export interface ResponseDoneEvent extends RealtimeEventBase { 
    type: 'response.done'; 
    response: { id: string; status: string; status_details?: any; output?: any[]; metadata?: any; usage?: any; }; 
}
export interface RateLimitsUpdatedEvent extends RealtimeEventBase { type: 'rate_limits.updated'; rate_limits: any[]; }
export interface ResponseOutputItemAddedEvent extends RealtimeEventBase { type: 'response.output_item.added'; response_id: string; output_index: number; item: any; }
export interface ResponseContentPartAddedEvent extends RealtimeEventBase { type: 'response.content_part.added'; response_id: string; item_id: string; output_index: number; content_index: number; content_part: any; }
export interface ResponseAudioTranscriptDeltaEvent extends RealtimeEventBase { type: 'response.audio_transcript.delta'; response_id: string; item_id: string; output_index: number; content_index: number; delta: string; }
export interface ResponseAudioDoneEvent extends RealtimeEventBase { type: 'response.audio.done'; response_id: string; item_id: string; output_index: number; content_index: number; }
export interface ResponseAudioTranscriptDoneEvent extends RealtimeEventBase { type: 'response.audio_transcript.done'; response_id: string; item_id: string; output_index: number; content_index: number; transcript: string; }
export interface ResponseContentPartDoneEvent extends RealtimeEventBase { type: 'response.content_part.done'; response_id: string; item_id: string; output_index: number; content_index: number; }
export interface ResponseOutputItemDoneEvent extends RealtimeEventBase { type: 'response.output_item.done'; response_id: string; output_index: number; item: any; }
export interface OutputAudioBufferStartedEvent extends RealtimeEventBase { type: 'output_audio_buffer.started'; response_id: string; }
export interface OutputAudioBufferStoppedEvent extends RealtimeEventBase { type: 'output_audio_buffer.stopped'; response_id: string; }
export interface ToolCallEvent extends RealtimeEventBase { type: 'tool_calls'; data: { tool_calls: any[] }; } 
export interface ErrorEvent extends RealtimeEventBase { 
    type: 'error'; 
    error?: { 
        type?: string; 
        code?: string | number; 
        message: string; 
        param?: string; 
    }; 
    data?: { message: string; code?: number }; 
}

export interface ResponseFunctionCallArgumentsDeltaEvent extends RealtimeEventBase {
    type: 'response.function_call_arguments.delta';
    response_id: string;
    item_id: string;
    output_index: number;
    delta: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent extends RealtimeEventBase {
    type: 'response.function_call_arguments.done';
    response_id: string;
    item_id: string;
    output_index: number;
    arguments: string;
}

export type RealtimeEvent =
    | SessionCreatedEvent 
    | SessionEndedEvent
    | SessionUpdatedEvent 
    | InputAudioSpeechStartedEvent
    | InputAudioSpeechStoppedEvent
    | InputAudioCommittedEvent
    | ConversationItemCreatedEvent
    | InputAudioTranscriptionDeltaEvent
    | InputAudioTranscriptionCompletedEvent
    | ResponseCreatedEvent 
    | ResponseDoneEvent    
    | RateLimitsUpdatedEvent
    | ResponseOutputItemAddedEvent
    | ResponseContentPartAddedEvent
    | ResponseAudioTranscriptDeltaEvent
    | ResponseAudioDoneEvent
    | ResponseAudioTranscriptDoneEvent
    | ResponseContentPartDoneEvent
    | ResponseOutputItemDoneEvent
    | OutputAudioBufferStartedEvent
    | OutputAudioBufferStoppedEvent
    | ToolCallEvent 
    | ErrorEvent
    | ResponseFunctionCallArgumentsDeltaEvent
    | ResponseFunctionCallArgumentsDoneEvent;

export interface ConversationTurn {
    role: 'user' | 'assistant';
    text: string;
    id: string; 
}

// --- Tool Definition Types (New) ---
export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  // Add other potential properties based on OpenAPI spec if needed
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  // additionalProperties?: boolean; // Check if supported/needed by Realtime API
}

// Define specific tool types
export interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters?: ToolParameters; // Optional for tools without params
  // strict?: boolean; // Check if supported/needed
}

export interface FileSearchTool {
  type: "file_search";
  vector_store_ids?: string[]; // Configuration specific to file_search
  name?: string; // Add optional name property
}

// Union type for all supported tool definitions
export type Tool = FunctionTool | FileSearchTool;

// --- Tool Call Type (New) ---
// Represents a function call requested by the model via the DataChannel
export interface ToolCall {
    type: "function_call"; // Differentiates from other potential tool types
    name: string;
    arguments: any; // Parsed arguments object
    call_id?: string; // ID provided by OpenAI to match result
    item_id?: string; // ID of the conversation item associated with the call
}
// --- End New Types ---
