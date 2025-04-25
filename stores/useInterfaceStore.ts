import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'transcript' | 'voiceOnly';

interface StoreState {
  viewMode: ViewMode;
  selectedVoice: string;
  micPermission: 'prompt' | 'granted' | 'denied';
  cameraPermission: 'prompt' | 'granted' | 'denied';
  appMode: 'developer' | 'research';
  setViewMode: (mode: ViewMode) => void;
  setSelectedVoice: (voice: string) => void;
  setMicPermission: (status: 'prompt' | 'granted' | 'denied') => void;
  setCameraPermission: (status: 'prompt' | 'granted' | 'denied') => void;
  setAppMode: (mode: 'developer' | 'research') => void;
  // Placeholder for actions that will eventually call the request functions
  requestMicAccess: () => void;
  requestCamAccess: () => void;
}

// Define the functions to request permissions - these will be set later
let requestMicrophoneAccessCallback = () => { console.warn("requestMicrophoneAccess not implemented yet in store"); };
let requestCameraAccessCallback = () => { console.warn("requestCameraAccess not implemented yet in store"); };

const useInterfaceStore = create<StoreState>()(
  persist(
    (set) => ({
      viewMode: 'transcript',
      selectedVoice: 'echo',
      micPermission: 'prompt',
      cameraPermission: 'prompt',
      appMode: 'developer',
      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedVoice: (voice) => set({ selectedVoice: voice }),
      setMicPermission: (status) => set({ micPermission: status }),
      setCameraPermission: (status) => set({ cameraPermission: status }),
      setAppMode: (mode) => set({ appMode: mode }),
      requestMicAccess: () => requestMicrophoneAccessCallback(),
      requestCamAccess: () => requestCameraAccessCallback(),
    }),
    {
      name: 'interface-settings-store',
      partialize: (state) => ({
        viewMode: state.viewMode,
        selectedVoice: state.selectedVoice,
        appMode: state.appMode,
      }),
    }
  )
);

// Function to allow setting the actual permission request implementations from elsewhere (e.g., useRecording hook)
export const setPermissionRequestFunctions = (micFunc: () => Promise<void>, camFunc: () => Promise<void>) => {
    requestMicrophoneAccessCallback = micFunc;
    requestCameraAccessCallback = camFunc;
};

export type { StoreState };

export default useInterfaceStore;