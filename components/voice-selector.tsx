"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Volume2 } from "lucide-react"; // Voice icon
import useVoiceStore, { availableVoices, Voice } from "@/stores/useVoiceStore";

export default function VoiceSelector() {
  const selectedVoice = useVoiceStore((state) => state.selectedVoice);
  const setSelectedVoice = useVoiceStore((state) => state.setSelectedVoice);

  const handleValueChange = (value: string) => {
    // Type assertion as DropdownMenuRadioGroup passes string
    setSelectedVoice(value as Voice);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Select Voice">
          <Volume2 className="h-4 w-4" />
          <span className="sr-only">Select Voice ({selectedVoice})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Select Voice</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={selectedVoice} onValueChange={handleValueChange}>
          {availableVoices.map((voice) => (
            <DropdownMenuRadioItem key={voice} value={voice}>
              {/* Capitalize first letter */} 
              {voice.charAt(0).toUpperCase() + voice.slice(1)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 