import { create } from 'zustand';

type ViewMode = 'transcript' | 'voiceOnly';

interface InterfaceState {
  viewMode: ViewMode;
  selectedVoice: string;
  micPermission: 'prompt' | 'granted' | 'denied';
  cameraPermission: 'prompt' | 'granted' | 'denied';
  setViewMode: (mode: ViewMode) => void;
  setSelectedVoice: (voice: string) => void;
  setMicPermission: (status: 'prompt' | 'granted' | 'denied') => void;
  setCameraPermission: (status: 'prompt' | 'granted' | 'denied') => void;
  // Placeholder for actions that will eventually call the request functions
  requestMicAccess: () => void;
  requestCamAccess: () => void;
}

// Define the functions to request permissions - these will be set later
let requestMicrophoneAccessCallback = () => { console.warn("requestMicrophoneAccess not implemented yet in store"); };
let requestCameraAccessCallback = () => { console.warn("requestCameraAccess not implemented yet in store"); };

export const useInterfaceStore = create<InterfaceState>((set) => ({
  viewMode: 'transcript',
  selectedVoice: 'echo', // Default voice, adjust if needed
  micPermission: 'prompt',
  cameraPermission: 'prompt',
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedVoice: (voice) => set({ selectedVoice: voice }),
  setMicPermission: (status) => set({ micPermission: status }),
  setCameraPermission: (status) => set({ cameraPermission: status }),
  requestMicAccess: () => requestMicrophoneAccessCallback(),
  requestCamAccess: () => requestCameraAccessCallback(),
}));

// Function to allow setting the actual permission request implementations from elsewhere (e.g., useRecording hook)
export const setPermissionRequestFunctions = (micFunc: () => Promise<void>, camFunc: () => Promise<void>) => {
    requestMicrophoneAccessCallback = micFunc;
    requestCameraAccessCallback = camFunc;
};