import { create } from 'zustand';

interface MediaStreamState {
  micStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  // Actions to set streams (replace previous stream if exists)
  setMicStream: (stream: MediaStream | null) => void;
  setCameraStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  // Action to stop and clear all streams
  stopAllStreams: () => void;
  // Helper to stop only screen stream (e.g., on 'ended' event)
  stopScreenStreamOnly: () => void;
}

export const useMediaStore = create<MediaStreamState>((set, get) => ({
  micStream: null,
  cameraStream: null,
  screenStream: null,

  setMicStream: (stream) => {
    const current = get().micStream;
    if (current && current !== stream) {
        console.log('[MediaStore] Stopping previous mic stream:', current.id);
        current.getTracks().forEach(track => track.stop());
    }
    set({ micStream: stream });
    console.log('[MediaStore] Mic stream set:', stream?.id);
  },

  setCameraStream: (stream) => {
    const current = get().cameraStream;
    if (current && current !== stream) {
         console.log('[MediaStore] Stopping previous camera stream:', current.id);
         current.getTracks().forEach(track => track.stop());
    }
    set({ cameraStream: stream });
     console.log('[MediaStore] Camera stream set:', stream?.id);
  },

  setScreenStream: (stream) => {
    const current = get().screenStream;
     if (current && current !== stream) {
         console.log('[MediaStore] Stopping previous screen stream:', current.id);
         current.getTracks().forEach(track => track.stop());
     }
     // Add listener to new stream to clear it when user stops sharing via browser UI
     if (stream) {
         const videoTrack = stream.getVideoTracks()[0];
         if (videoTrack) {
             videoTrack.addEventListener('ended', () => {
                 console.log('[MediaStore] Screen sharing stopped via UI - clearing stream.');
                 // Check if the stream being ended is still the current one in the store
                 if (get().screenStream?.id === stream.id) {
                     get().stopScreenStreamOnly(); // Call specific stop fn
                 }
             }, { once: true }); // Use { once: true } to avoid multiple listeners if setScreenStream is called rapidly
         }
     }
    set({ screenStream: stream });
     console.log('[MediaStore] Screen stream set:', stream?.id);
  },

   // Helper to stop only screen stream (e.g., on 'ended' event or specific cleanup)
   stopScreenStreamOnly: () => {
       const currentScreenStream = get().screenStream;
       if (currentScreenStream) {
            console.log('[MediaStore] Stopping screen stream tracks only:', currentScreenStream.id);
            currentScreenStream.getTracks().forEach(track => track.stop());
            set({ screenStream: null });
       }
   },

  // Function to stop and clear all streams
  stopAllStreams: () => {
    console.log('[MediaStore] Stopping all streams...');
    const { micStream, cameraStream, screenStream } = get();
    micStream?.getTracks().forEach(track => track.stop());
    cameraStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());
    set({ micStream: null, cameraStream: null, screenStream: null });
    console.log('[MediaStore] All streams stopped and cleared.');
  },
})); 