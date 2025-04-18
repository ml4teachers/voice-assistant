import { create } from 'zustand';

// Define the available voices
export const availableVoices = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const; // Use 'as const' for stricter typing

export type Voice = typeof availableVoices[number]; // Type for a single voice

interface VoiceState {
  selectedVoice: Voice;
  setSelectedVoice: (voice: Voice) => void;
}

const useVoiceStore = create<VoiceState>((set) => ({
  selectedVoice: "alloy", // Default voice
  setSelectedVoice: (voice) => {
    if (availableVoices.includes(voice)) {
      set({ selectedVoice: voice });
      console.log(`Voice selected: ${voice}`);
    } else {
      console.warn(`Attempted to select invalid voice: ${voice}`);
    }
  },
}));

export default useVoiceStore; 