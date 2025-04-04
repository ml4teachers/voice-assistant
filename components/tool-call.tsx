import React from "react";

import { Item, FunctionCallItem, FileSearchCallItem } from "@/hooks/useHandleRealtimeEvents";
import { BookOpenText, Clock, Globe, Zap, Loader2 } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";

interface ToolCallProps {
  toolCall: Item;
}

function ApiCallCell({ toolCall }: { toolCall: FunctionCallItem }) {
  const { theme } = useTheme();
  const syntaxTheme = theme === 'dark' ? oneDark : oneLight;

  const showSpinner = toolCall.status === 'in_progress';

  return (
    <div className="flex flex-col w-[85%] relative mb-2 text-sm">
      <div>
        <div className="flex flex-col rounded-md border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b">
            <Zap size={16} className="text-primary flex-shrink-0" />
            <div className="font-medium text-foreground">
              {toolCall.status === "completed"
                ? `Called: ${toolCall.name}`
                : toolCall.status === "failed"
                  ? `Failed: ${toolCall.name}`
                  : `Calling: ${toolCall.name}...`}
            </div>
            {showSpinner && <Loader2 size={16} className="animate-spin text-muted-foreground ml-auto" />}
          </div>

          <div className="mb-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">Arguments:</div>
            <div className="max-h-48 overflow-y-auto rounded bg-muted/50 p-2">
              <SyntaxHighlighter
                language="json"
                style={syntaxTheme}
                customStyle={{
                  backgroundColor: "transparent",
                  padding: "0px",
                  margin: 0,
                  fontSize: "0.75rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(toolCall.parsedArguments ?? {}, null, 2) || "{}"}
              </SyntaxHighlighter>
            </div>
          </div>

          <div>
             <div className="text-xs font-medium text-muted-foreground mb-1">Result:</div>
             <div className="max-h-60 overflow-y-auto rounded bg-muted/50 p-2 text-xs">
               {toolCall.status === 'in_progress' ? (
                  <div className="flex items-center gap-2 text-muted-foreground italic">
                     <Clock size={14} /> Waiting for result...
                  </div>
               ) : toolCall.output ? (
                  (() => {
                    try {
                      const parsedOutput = JSON.parse(toolCall.output);
                      const isError = parsedOutput?.error;

                      return (
                        <SyntaxHighlighter
                          language={isError ? "text" : "json"}
                          style={syntaxTheme}
                          customStyle={{
                            backgroundColor: "transparent",
                            padding: "0px",
                            margin: 0,
                            fontSize: "0.75rem",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            color: isError ? (theme === 'dark' ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--destructive))') : undefined,
                          }}
                        >
                          {isError ? parsedOutput.error : JSON.stringify(parsedOutput, null, 2)}
                        </SyntaxHighlighter>
                      );
                    } catch (e) {
                       // Fallback for non-JSON output (or parse error)
                      return (
                         <div className="whitespace-pre-wrap text-orange-600 dark:text-orange-400">
                             Raw Output (JSON parse failed):
                             <pre>{toolCall.output}</pre>
                         </div>
                      );
                    }
                  })()
               ) : toolCall.status === 'failed' ? (
                  <div className="text-destructive italic">
                      Execution failed (no specific output).
                  </div>
               ) : (
                  <div className="text-muted-foreground italic">
                      Completed (no specific output).
                  </div>
               )}
            </div>
           </div>

        </div>
      </div>
    </div>
  );
}

function FileSearchCell({ toolCall }: { toolCall: FileSearchCallItem }) {
  const showSpinner = toolCall.status === 'in_progress';
  return (
    <div className="flex items-center gap-2 text-primary mb-1 ml-[-4px]">
      <BookOpenText size={16} className="flex-shrink-0" />
      <div className="text-sm font-medium text-foreground">
        {toolCall.status === "completed"
          ? "Searched files"
          : toolCall.status === "in_progress"
             ? "Searching files..."
             : "File search failed"}
      </div>
       {showSpinner && <Loader2 size={16} className="animate-spin text-muted-foreground ml-1" />}
    </div>
  );
}

// Comment out WebSearchCell for now as it's handled by ApiCallCell via the wrapper
/*
function WebSearchCell({ toolCall }: ToolCallProps) {
  return (
    <div className="flex gap-2 items-center text-blue-500 mb-[-16px] ml-[-8px]">
      <Globe size={16} />
      <div className="text-sm font-medium">
        {toolCall.status === "completed"
          ? "Searched the web"
          : "Searching the web..."}
      </div>
    </div>
  );
}
*/

// Separate component to render the specific tool call type
function SpecificToolCall({ toolCall }: { toolCall: FunctionCallItem | FileSearchCallItem }) {
  switch (toolCall.tool_type) {
    case "function_call":
      return <ApiCallCell toolCall={toolCall} />;
    case "file_search_call":
      if (!toolCall.call_id?.startsWith('socratic-ctx-')) {
          return <FileSearchCell toolCall={toolCall} />;
      }
      return null;
    default:
      // This should ideally not happen if types are correct, but provide fallback
      const unknownType: never = toolCall; // Use 'never' for exhaustiveness check
      console.warn("Unknown tool_type for tool_call item:", unknownType);
      return (
        <div className="text-xs text-red-500">
          Unknown Tool Call Type
        </div>
      );
  }
}

export default function ToolCall({ toolCall }: ToolCallProps) {
  // Ensure it's a tool_call type before rendering
  if (toolCall.type !== 'tool_call') {
    return null;
  }

  return (
    <div className="flex justify-start pt-2">
      {/* Pass the correctly typed toolCall to the helper component */}
      <SpecificToolCall toolCall={toolCall} />
    </div>
  );
}
