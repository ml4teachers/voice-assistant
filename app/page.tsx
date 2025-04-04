"use client";
// Remove useState, Menu, X imports if no longer needed
// import { Menu, X } from "lucide-react";
// import { useState } from "react";
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
import { PanelLeft } from "lucide-react"; // Icon for trigger button
import ToolsPanel from "@/components/tools-panel";
import RealtimeChat from "@/components/realtime-chat";

export default function Main() {
  // Remove useState for isToolsPanelOpen
  // const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);

  return (
      // Main container, fill screen height and width
      <div className="flex h-screen w-screen bg-background relative">

          {/* Sheet component for the ToolsPanel */} 
          <Sheet>
              <SheetTrigger asChild>
                   {/* Persistent button to trigger the sheet from the left */}
                   <Button variant="outline" size="icon" className="absolute top-4 left-4 z-10">
                      <PanelLeft className="h-4 w-4" />
                      {/* Screenreader Text */} 
                      <span className="sr-only">Open Tools Panel</span>
                  </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:w-[400px] overflow-y-auto p-0">
                  {/* Header within the sheet */}
                  <SheetHeader className="p-6 pb-4 border-b"> 
                      <SheetTitle>Configuration</SheetTitle>
                      <SheetDescription>
                          Adjust assistant settings and configure tools.
                      </SheetDescription>
                  </SheetHeader>
                  {/* Content area for the ToolsPanel component */}
                  <div className="p-6 pt-4">
                     <ToolsPanel />
                  </div>
                  {/* Optional: SheetFooter */} 
              </SheetContent>
          </Sheet>

          {/* Main content area (Chat) - takes remaining space */}
          <div className="flex-grow h-full">
              <RealtimeChat />
          </div>
      </div>
  );
}
