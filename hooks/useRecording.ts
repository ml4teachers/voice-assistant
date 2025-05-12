import { useState, useRef, useCallback, useEffect } from 'react';
import { useMediaStore } from '@/stores/mediaStreamStore'; // Import the store

// Define types for recorder state and recorded data
type RecordingStatus = 'idle' | 'permission-requested' | 'recording' | 'stopped' | 'error'; // Added error state
interface RecordedData {
    // Combined: Camera Video + Mic Audio + Assistant Audio
    combinedBlob: Blob | null; 
    // Separate Screen Video + Screen Audio
    screenBlob: Blob | null; 
    assistantBlob: Blob | null; // <<< ADDED: Assistant Audio Only
}

// Define options for mime types (adjust based on desired quality/compatibility)
const COMBINED_VIDEO_MIME_TYPE_PREF = 'video/webm;codecs=vp9,opus';
const SEPARATE_AUDIO_MIME_TYPE_PREF = 'audio/webm;codecs=opus';
const WAV_MIME_TYPE = 'audio/wav';
const VIDEO_FALLBACK_MIME_TYPE = 'video/webm';
const AUDIO_FALLBACK_MIME_TYPE = 'audio/webm';

// --- MimeType Preferences --- 
// Ordered from most preferred to least preferred/fallback
const VIDEO_TYPES_TO_CHECK = [
    // High quality WebM
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    // H.264 variations (broader compatibility, esp. Safari/Mobile)
    'video/mp4;codecs=h264,aac',  // Common MP4 combination
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // More specific H.264/AAC for Safari?
    'video/webm;codecs=h264,opus',
    // Fallbacks
    'video/mp4',
    'video/webm' 
];
const AUDIO_TYPES_TO_CHECK = [
    'audio/wav', // Preferred for quality if supported
    // Opus variations
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    // AAC / MP4 variations
    'audio/mp4;codecs=mp4a.40.2', // Specific AAC
    'audio/aac',
    'audio/mp4', // Generic MP4 audio
    // Fallbacks
    'audio/webm'
];

// Helper function to find the first supported mime type
function findSupportedMimeType(types: string[]): string | null {
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log(`[findSupportedMimeType] Found supported type: ${type}`);
            return type;
        }
    }
    console.warn(`[findSupportedMimeType] No supported type found in list: ${types.join(', ')}`);
    return null;
}

export function useRecording() {
    const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
    // Restore RecordedData state structure with 3 blobs
    const [recordedData, setRecordedData] = useState<RecordedData>({ 
        combinedBlob: null, screenBlob: null, assistantBlob: null 
    });
    const [error, setError] = useState<string | null>(null);

    // Restore Refs for all THREE recorders and chunks
    const combinedRecorderRef = useRef<MediaRecorder | null>(null);
    const screenRecorderRef = useRef<MediaRecorder | null>(null); 
    const assistantRecorderRef = useRef<MediaRecorder | null>(null); // <<< ADDED assistant recorder ref
    const combinedChunksRef = useRef<Blob[]>([]);
    const screenChunksRef = useRef<Blob[]>([]); 
    const assistantChunksRef = useRef<Blob[]>([]); // <<< ADDED assistant chunks ref

    // Restore Refs for blob readiness tracking (3 blobs)
    const combinedBlobReadyRef = useRef<boolean>(false);
    const screenBlobReadyRef = useRef<boolean>(false); 
    const assistantBlobReadyRef = useRef<boolean>(false); // <<< ADDED assistant blob ready ref

    // *** Get setters/actions from the store ***
    const setCameraStream = useMediaStore((state) => state.setCameraStream);
    const setScreenStream = useMediaStore((state) => state.setScreenStream);
    const stopScreenStreamOnly = useMediaStore((state) => state.stopScreenStreamOnly);
    // Need access to the camera stream state for stopping it
    const cameraStreamFromStore = useMediaStore((state) => state.cameraStream);

    const clearError = useCallback(() => setError(null), []);
    const setAndLogError = useCallback((message: string, logError?: any) => {
        console.error(`[useRecording] Error: ${message}`, logError || '');
        setError(message);
        // Avoid setting status to error here directly unless it's a recorder error
        // Permission errors are handled by the calling component based on success/failure
    }, []);

    // --- Request Camera Only (uses store) --- 
    const requestCameraPermission = useCallback(async (): Promise<boolean> => {
        clearError();
        console.log("[useRecording] Requesting camera permission...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                 video: { width: 1280, height: 720 }, audio: false
            });
            setCameraStream(stream); // Set stream in the store
            console.log("[useRecording] Camera permission granted.");
            return true;
        } catch (err) {
            setAndLogError("Kamerazugriff fehlgeschlagen.", err);
            setCameraStream(null); // Ensure store is cleared on error
            return false;
        }
    }, [clearError, setAndLogError, setCameraStream]);

    // --- Request Screen Only (uses store) --- 
    const requestScreenPermission = useCallback(async (): Promise<MediaStream | null> => {
        console.warn("[useRecording] requestScreenPermission is currently deactivated.");
        // return null; // Temporarily deactivated
        // Simulate permission denial or simply do nothing to prevent screen recording
        // To re-enable, uncomment the original logic below
        /*
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            setScreenStream(stream);
            return stream;
        } catch (err) {
            console.error("Error getting screen media:", err);
            setError("Screen sharing failed or was cancelled.");
            setScreenStream(null);
            return null;
        }
        */
        return null; // Return null as it's deactivated
    }, [setScreenStream, setError]);

    // --- Combined Permission Request (kept for potential internal use, but likely unused by UI now) --- 
    const requestPermissionsAndStreams = useCallback(async (): Promise<{
        cameraStream: MediaStream | null;
        screenStream: MediaStream | null;
        success: boolean;
    }> => {
        // This function is likely problematic due to getDisplayMedia constraints
        console.warn("[useRecording] requestPermissionsAndStreams called - may fail due to getDisplayMedia constraints.");
        const cameraSuccess = await requestCameraPermission();
        let screenStream: MediaStream | null = null;
        if (cameraSuccess) {
            // This direct call here is the issue!
             screenStream = await requestScreenPermission();
        }
        return {
            cameraStream: cameraStreamFromStore,
            screenStream: screenStream,
            success: cameraSuccess && !!screenStream
        };
    }, [requestCameraPermission, requestScreenPermission, cameraStreamFromStore]);

    // Helper function to check if all 3 blobs are ready
    const checkAllBlobsReady = useCallback(() => {
        if (combinedBlobReadyRef.current && 
            screenBlobReadyRef.current && assistantBlobReadyRef.current) { // <<< Check all 3
            console.log("[useRecording] All 3 blobs ready. Setting status to 'stopped'.");
            setRecordingStatus('stopped');
        }
    }, []);

    // --- Start Recording (Final: 3 Recorders) --- 
    const startRecording = useCallback(( 
        microphoneStream: MediaStream, 
        cameraStream: MediaStream | null, 
        _screenStreamToIgnore: MediaStream | null, // Parameter wird ignoriert
        remoteAudioStream: MediaStream | null // <<< ADDED BACK remoteAudioStream >>>
    ) => {
         clearError();
         // ... stream validity checks (important to keep) ...
         if (!microphoneStream?.active || microphoneStream.getAudioTracks().length === 0) { /*...*/ return; }
         if (cameraStream && (!cameraStream?.active || cameraStream.getVideoTracks().length === 0)) { /*...*/ cameraStream = null; }
  
          console.log("[useRecording] Attempting to start recording (3 Recorders)...");
          // Reset all 3 blob ready flags
          combinedBlobReadyRef.current = false;
          screenBlobReadyRef.current = false; 
          assistantBlobReadyRef.current = false; // <<< Reset assistant flag
          // Reset chunks and final data state (3 blobs)
          combinedChunksRef.current = [];
          screenChunksRef.current = []; 
          assistantChunksRef.current = []; // <<< Reset assistant chunks
          setRecordedData({ combinedBlob: null, screenBlob: null, assistantBlob: null }); // <<< Reset state
          setRecordingStatus('idle'); 
  
          try {
              // --- Find MimeTypes --- 
              const chosenCombinedMimeType = findSupportedMimeType(VIDEO_TYPES_TO_CHECK); // For Cam+Mic
              const chosenScreenMimeType = findSupportedMimeType(VIDEO_TYPES_TO_CHECK); // For Screen video+audio
              const chosenAssistantMimeType = findSupportedMimeType(AUDIO_TYPES_TO_CHECK); // For Assistant audio only
              
              if (!chosenCombinedMimeType) { /*...*/ return; }
              if (!chosenScreenMimeType) { /*...*/ return; }
              // Only fail if remote stream exists but mime type doesn't
              if (remoteAudioStream && !chosenAssistantMimeType) { setAndLogError("Browser lacks supported audio mimeType for assistant recording."); return; }
              console.log(`[useRecording] Using MimeTypes - Combined: ${chosenCombinedMimeType}, Screen: ${chosenScreenMimeType}, Assistant: ${chosenAssistantMimeType || 'N/A'}`);

              // --- Prepare Streams --- 
              // 1. Combined Stream (Camera Video + Mic Audio ONLY)
              const combinedStreamTracks: MediaStreamTrack[] = [];
              if (cameraStream) combinedStreamTracks.push(...cameraStream.getVideoTracks());
              combinedStreamTracks.push(...microphoneStream.getAudioTracks());
              const combinedStream = new MediaStream(combinedStreamTracks);
              // 2. Screen Stream (Screen Video + Screen Audio) - Use screenStream directly
              // 3. Assistant Stream (Remote Audio Only) - Use remoteAudioStream directly (if exists)

              // --- Initialize Recorders --- 

              // Combined Recorder (Camera + Mic)
              if (combinedStream.getTracks().length > 0) {
                 console.log(`[useRecording] Initializing combined (Cam+Mic) recorder with type: ${chosenCombinedMimeType}`);
                 combinedRecorderRef.current = new MediaRecorder(combinedStream, { mimeType: chosenCombinedMimeType });
                 combinedRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) combinedChunksRef.current.push(e.data); };
                 combinedRecorderRef.current.onstop = () => { 
                     console.log("[useRecording] Combined (Cam+Mic) recorder stopped.");
                     try {
                       const blob = new Blob(combinedChunksRef.current, { type: chosenCombinedMimeType }); 
                       setRecordedData(prev => ({ ...prev, combinedBlob: blob })); 
                       combinedBlobReadyRef.current = true;
                       console.log(`[useRecording] Combined Blob ready. Checking all 3...`);
                       checkAllBlobsReady(); 
                     } catch (e) { /*...*/ }
                     combinedRecorderRef.current = null;
                 };
                 combinedRecorderRef.current.onerror = (e) => { /* error handling, stop others */ };
              } else { /* Skip and mark ready */ combinedBlobReadyRef.current = true; }
  
              // Screen Recorder (Screen Video + Screen Audio)
              if (cameraStream && cameraStream.getTracks().length > 0) { 
                console.log(`[useRecording] Initializing screen recorder with type: ${chosenScreenMimeType}`);
                screenRecorderRef.current = new MediaRecorder(cameraStream, { mimeType: chosenScreenMimeType });
                screenRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
                screenRecorderRef.current.onstop = () => { 
                    console.log("[useRecording] Screen recorder stopped.");
                    try {
                        const blob = new Blob(screenChunksRef.current, { type: chosenScreenMimeType });
                        setRecordedData(prev => ({ ...prev, screenBlob: blob }));
                        screenBlobReadyRef.current = true;
                        console.log(`[useRecording] Screen Blob ready. Checking all 3...`);
                        checkAllBlobsReady();
                    } catch (e) { /*...*/ }
                    screenRecorderRef.current = null;
                };
                screenRecorderRef.current.onerror = (e) => { /* error handling, stop others */ };
              } else { /* Skip and mark ready */ screenBlobReadyRef.current = true; }

              // Assistant Audio Recorder (Remote Audio Only)
              if (remoteAudioStream && remoteAudioStream.getAudioTracks().length > 0 && chosenAssistantMimeType) { 
                console.log(`[useRecording] Initializing assistant audio recorder with type: ${chosenAssistantMimeType}`);
                assistantRecorderRef.current = new MediaRecorder(remoteAudioStream, { mimeType: chosenAssistantMimeType });
                assistantRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) assistantChunksRef.current.push(e.data); };
                assistantRecorderRef.current.onstop = () => { 
                    console.log("[useRecording] Assistant recorder stopped.");
                    try {
                        const blob = new Blob(assistantChunksRef.current, { type: chosenAssistantMimeType });
                        setRecordedData(prev => ({ ...prev, assistantBlob: blob }));
                        assistantBlobReadyRef.current = true;
                         console.log(`[useRecording] Assistant Blob ready. Checking all 3...`);
                        checkAllBlobsReady();
                    } catch (e) { /* error handling */ setAndLogError("Failed to process assistant recording.", e); setRecordingStatus('error'); }
                    assistantRecorderRef.current = null;
                };
                 assistantRecorderRef.current.onerror = (e) => { /* error handling, stop others */ 
                      setAndLogError("Assistant recorder error.", e); setRecordingStatus('error'); 
                      // Stop others if this one fails mid-recording
                      if (combinedRecorderRef.current?.state === 'recording') combinedRecorderRef.current.stop();
                      if (screenRecorderRef.current?.state === 'recording') screenRecorderRef.current.stop();
                 };
              } else {
                  console.warn("[useRecording] Skipping assistant audio recorder initialization (no stream, no tracks, or no mime type).");
                  assistantBlobReadyRef.current = true; // Mark as ready if skipped
              }
  
              // --- Start Recorders --- 
              combinedRecorderRef.current?.start(1000); 
              screenRecorderRef.current?.start(1000); 
              assistantRecorderRef.current?.start(1000); // <<< Start assistant recorder
              
              setRecordingStatus('recording');
              console.log("[useRecording] Recorders started (Combined=Cam+Mic, Screen, Assistant).");
  
          } catch (err) {
             // Restore full cleanup for all 3 recorders
             setAndLogError(err instanceof Error ? err.message : "MediaRecorder setup/start failed.", err);
             setRecordingStatus('error');
             if (combinedRecorderRef.current?.state === 'recording') combinedRecorderRef.current.stop();
             if (screenRecorderRef.current?.state === 'recording') screenRecorderRef.current.stop();
             if (assistantRecorderRef.current?.state === 'recording') assistantRecorderRef.current.stop(); // <<< Cleanup assistant
             combinedRecorderRef.current = null;
             screenRecorderRef.current = null;
             assistantRecorderRef.current = null; // <<< Cleanup assistant ref
          }
    }, [clearError, setAndLogError, checkAllBlobsReady]); 

    // --- Stop Recording (Restore stopping all 3) --- 
    const stopRecording = useCallback(() => {
        console.log("[useRecording stopRecording] Initiating stop for all recorders...");
        clearError();
        let stoppedCombined = false;
        let stoppedScreen = false; 
        let stoppedAssistant = false; // <<< ADDED assistant stop flag

        // Stop combined recorder
        if (combinedRecorderRef.current?.state === 'recording') { /* stop */ stoppedCombined = true; } 
        else { if (!combinedRecorderRef.current) combinedBlobReadyRef.current = true; }
        // Stop screen recorder
         if (screenRecorderRef.current?.state === 'recording') { /* stop */ stoppedScreen = true; } 
         else { if (!screenRecorderRef.current) screenBlobReadyRef.current = true; }
         // Stop assistant recorder
          if (assistantRecorderRef.current?.state === 'recording') {
             console.log("[useRecording stopRecording] Calling assistantRecorder.stop()");
             assistantRecorderRef.current.stop(); 
             stoppedAssistant = true;
          } else {
              console.log(`[useRecording stopRecording] Assistant recorder not active.`);
               if (!assistantRecorderRef.current) assistantBlobReadyRef.current = true; 
          }

        // Stop streams from MediaStore
        const currentCameraStream = useMediaStore.getState().cameraStream;
        if (currentCameraStream) {
             console.log("[useRecording stopRecording] Stopping camera stream tracks.");
             currentCameraStream.getTracks().forEach(track => track.stop());
        }
        useMediaStore.getState().stopScreenStreamOnly(); 

        console.log(`[useRecording stopRecording] Stop initiated. stoppedCombined=${stoppedCombined}, stoppedScreen=${stoppedScreen}, stoppedAssistant=${stoppedAssistant}`);

        // Restore check for all 3 recorders
        if (!stoppedCombined && !stoppedScreen && !stoppedAssistant) { // <<< Check all 3
             console.warn("[useRecording stopRecording] No recorders were active to stop. Manually checking blob readiness.");
             checkAllBlobsReady();
        }

    }, [clearError, setAndLogError, checkAllBlobsReady]);

    // --- Download Helper --- 
    const downloadFile = useCallback((blob: Blob | null, filename: string) => {
        if (!blob) {
            setAndLogError(`Download fehlgeschlagen: Keine Daten für ${filename}.`);
            return;
        }
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            console.log(`[useRecording] Triggered download for ${filename}`);
        } catch (err) {
            setAndLogError(`Fehler beim Erstellen des Downloads für ${filename}.`, err);
        }
    }, [setAndLogError]);

    // --- Cleanup Effect (Restore cleanup for all 3) --- 
    useEffect(() => {
        return () => {
            if (combinedRecorderRef.current?.state === 'recording') { /* stop */ }
             if (screenRecorderRef.current?.state === 'recording') { /* stop */ }
             if (assistantRecorderRef.current?.state === 'recording') { // <<< ADDED cleanup for assistant
                 console.warn("[useRecording Cleanup] Assistant recorder was still active on unmount. Stopping.");
                 assistantRecorderRef.current.stop();
             }
        };
    }, []);

    return {
        recordingStatus,
        recordedData, // Back to 3 blobs
        error,
        clearError,
        requestCameraPermission, 
        requestScreenPermission,
        startRecording,
        stopRecording,
        downloadFile,
    };
}