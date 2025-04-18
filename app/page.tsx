"use client";
// Remove useState, Menu, X imports if no longer needed
// import { Menu, X } from "lucide-react";
// import { useState } from "react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetDescription,
    // SheetFooter, // Optional
    // SheetClose, // Optional
} from "@/components/ui/sheet";
import { PanelLeft, MicIcon, MessageSquareQuoteIcon } from "lucide-react"; // ADDED Icons
import ToolsPanel from "@/components/tools-panel";
import RealtimeChat from "@/components/realtime-chat";
import { ModeToggle } from "@/components/mode-toggle"; // Corrected name and path
import VoiceSelector from "@/components/voice-selector"; // Import the new component

// Define view modes here as well
type ViewMode = "transcript" | "voiceOnly";

export default function Main() {
  // State for view mode, managed here
  const [viewMode, setViewMode] = useState<ViewMode>("transcript");

  // Function to toggle view mode, managed here
  const toggleViewMode = useCallback(() => {
      setViewMode((prevMode) => (prevMode === "transcript" ? "voiceOnly" : "transcript"));
  }, []);

  return (
      // Main container, fill screen height and width
      <div className="flex h-screen w-screen bg-background relative">

          {/* Header Buttons Group (Top Left) */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            {/* Sheet component for the ToolsPanel */}
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

            {/* View Mode Toggle Button (Moved Here) */}
            <Button variant="outline" size="icon" onClick={toggleViewMode} title={viewMode === 'transcript' ? 'Switch to Voice Only View' : 'Switch to Transcript View'}>
                {viewMode === 'transcript' ? <MicIcon className="h-4 w-4" /> : <MessageSquareQuoteIcon className="h-4 w-4" />}
                <span className="sr-only">Toggle View Mode</span>
            </Button>

            {/* Theme Toggle Button (Moved Here) */}
            <ModeToggle />

            {/* Voice Selector Button (New) */}
            <VoiceSelector />
          </div>

          {/* Main content area (Chat) - takes remaining space */}
          <div className="flex-grow h-full pt-16"> {/* Added pt-16 to avoid overlap with absolute header buttons */}
              <RealtimeChat viewMode={viewMode} /> {/* Pass viewMode as prop */}
          </div>
      </div>
  );
}
