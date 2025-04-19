"use client";
// Remove useState, useCallback imports
// import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetDescription,
} from "@/components/ui/sheet";
// Remove unused icons if necessary, keep PanelLeft
import { PanelLeft } from "lucide-react";
import ToolsPanel from "@/components/tools-panel";
import RealtimeChat from "@/components/realtime-chat";
// Remove ModeToggle and VoiceSelector imports
// import { ModeToggle } from "@/components/mode-toggle";
// import VoiceSelector from "@/components/voice-selector";

// Remove type definition if not used elsewhere here
// type ViewMode = "transcript" | "voiceOnly";

export default function Main() {
  // Remove local state and callback for viewMode
  // const [viewMode, setViewMode] = useState<ViewMode>("transcript");
  // const toggleViewMode = useCallback(() => {
  //     setViewMode((prevMode) => (prevMode === "transcript" ? "voiceOnly" : "transcript"));
  // }, []);

  return (
      <div className="flex h-screen w-screen bg-background relative">
          {/* Header Buttons Group (Top Left) - Simplified */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            {/* Sheet component for the ToolsPanel - Only trigger remains */}
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" title="Open Tools Panel">
                        <PanelLeft className="h-4 w-4" />
                        <span className="sr-only">Open Tools Panel</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-full sm:w-[400px] overflow-y-auto p-0">
                    <SheetHeader className="p-6 pb-4 border-b">
                        <SheetTitle>Configuration</SheetTitle>
                        <SheetDescription>
                            Adjust assistant settings and configure tools.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="p-6 pt-4">
                        <ToolsPanel />
                    </div>
                </SheetContent>
            </Sheet>

            {/* REMOVED: View Mode Toggle Button */}
            {/* REMOVED: Theme Toggle Button (ModeToggle) */}
            {/* REMOVED: Voice Selector Button */}
          </div>

          {/* Main content area (Chat) */}
          <div className="flex-grow h-full pt-16"> {/* Keep padding-top */}
              {/* Remove viewMode prop */}
              <RealtimeChat />
          </div>
      </div>
  );
}
