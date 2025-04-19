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
import { Volume2, PlayIcon } from "lucide-react"; // Voice icon and PlayIcon
import useVoiceStore, { availableVoices, Voice } from "@/stores/useVoiceStore";

export default function VoiceSelector() {
  const selectedVoice = useVoiceStore((state) => state.selectedVoice);
  const setSelectedVoice = useVoiceStore((state) => state.setSelectedVoice);
  // State to keep track of currently playing audio
  const [playingAudio, setPlayingAudio] = React.useState<HTMLAudioElement | null>(null);

  const handleValueChange = (value: string) => {
    // Stop any currently playing audio when selection changes
    if (playingAudio) {
      playingAudio.pause();
      playingAudio.currentTime = 0;
      setPlayingAudio(null);
    }
    setSelectedVoice(value as Voice);
  };

  // Function to play audio preview
  const playPreview = (event: React.MouseEvent, voice: Voice) => {
    event.stopPropagation(); // Prevent dropdown from closing or item selection

    // Stop any currently playing audio
    if (playingAudio) {
      playingAudio.pause();
      playingAudio.currentTime = 0;
      // If the same button is clicked again, just stop the audio
      if (playingAudio.src.endsWith(`/${voice}.mp3`)) {
        setPlayingAudio(null);
        return;
      }
    }

    const audioSrc = `/${voice}.mp3`; // Construct the path to the audio file in /public
    const audio = new Audio(audioSrc);
    
    audio.play().catch(err => {
        console.error("Error playing audio:", err);
        // Handle potential errors, e.g., file not found
    });
    
    // Set the new audio element as playing
    setPlayingAudio(audio);

    // Reset playing state when audio finishes
    audio.onended = () => {
      setPlayingAudio(null);
    };
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
            <DropdownMenuRadioItem key={voice} value={voice} className="flex justify-between items-center">
              <span>
                {/* Capitalize first letter */}
                {voice.charAt(0).toUpperCase() + voice.slice(1)}
              </span>
              {/* Add Play button */}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 ml-2" // Adjust styling as needed
                onClick={(e) => playPreview(e, voice)}
                title={`Play ${voice} preview`}
              >
                <PlayIcon className="h-4 w-4" />
                <span className="sr-only">Play {voice} preview</span>
              </Button>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 