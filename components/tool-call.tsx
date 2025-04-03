import React from "react";

import { ToolCallItem } from "@/hooks/useHandleRealtimeEvents";
import { BookOpenText, Clock, Globe, Zap } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coy } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ToolCallProps {
  toolCall: ToolCallItem;
}

function ApiCallCell({ toolCall }: ToolCallProps) {
  return (
    <div className="flex flex-col w-[70%] relative mb-[-8px]">
      <div>
        <div className="flex flex-col text-sm rounded-[16px]">
          <div className="font-semibold p-3 pl-0 text-gray-700 rounded-b-none flex gap-2">
            <div className="flex gap-2 items-center text-blue-500 ml-[-8px]">
              <Zap size={16} />
              <div className="text-sm font-medium">
                {toolCall.status === "completed"
                  ? `Called ${toolCall.name}`
                  : `Calling ${toolCall.name}...`}
              </div>
            </div>
          </div>

          <div className="bg-[#fafafa] rounded-xl py-2 ml-4 mt-2">
            <div className="max-h-96 overflow-y-scroll text-xs border-b mx-6 p-2">
              <SyntaxHighlighter
                customStyle={{
                  backgroundColor: "#fafafa",
                  padding: "8px",
                  paddingLeft: "0px",
                  marginTop: 0,
                  marginBottom: 0,
                }}
                language="json"
                style={coy}
              >
                {JSON.stringify(toolCall.parsedArguments, null, 2)}
              </SyntaxHighlighter>
            </div>
            <div className="max-h-96 overflow-y-scroll mx-6 p-2 text-xs">
              {toolCall.output ? (
                (() => {
                  try {
                    const parsedOutput = JSON.parse(toolCall.output);

                    // Specific handling for errors returned by tools
                    if (parsedOutput?.error) {
                        return (
                            <div className="whitespace-pre-wrap p-2 text-red-600">
                                Error: {parsedOutput.error}
                            </div>
                        );
                    }

                    // Fallback for other successful tool calls: Show formatted JSON
                    return (
                      <SyntaxHighlighter
                        customStyle={{
                          backgroundColor: "#fafafa",
                          padding: "8px",
                          paddingLeft: "0px",
                          marginTop: 0,
                        }}
                        language="json"
                        style={coy}
                      >
                        {JSON.stringify(parsedOutput, null, 2)}
                      </SyntaxHighlighter>
                    );
                  } catch (e) {
                    // Fallback if output is not valid JSON
                    console.error("Failed to parse tool output:", e);
                    return (
                       <div className="whitespace-pre-wrap p-2 text-orange-600">
                           Raw Output (JSON parse failed):
                           {toolCall.output}
                       </div>
                    )
                  }
                })()
              ) : (
                <div className="text-zinc-500 flex items-center gap-2 py-2">
                  <Clock size={16} /> Waiting for result...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileSearchCell({ toolCall }: ToolCallProps) {
  return (
    <div className="flex gap-2 items-center text-blue-500 mb-[-16px] ml-[-8px]">
      <BookOpenText size={16} />
      <div className="text-sm font-medium mb-0.5">
        {toolCall.status === "completed"
          ? "Searched files"
          : "Searching files..."}
      </div>
    </div>
  );
}

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

export default function ToolCall({ toolCall }: ToolCallProps) {
  return (
    <div className="flex justify-start pt-2">
      {toolCall.tool_type === "function_call" && <ApiCallCell toolCall={toolCall} />}
    </div>
  );
}
