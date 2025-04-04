"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose // Import DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress"; // Import Progress
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import useToolsStore from '@/stores/useToolsStore'; // To get vectorStoreId
import useSocraticStore from '@/stores/useSocraticStore'; // To manage Socratic state
import { cn } from "@/lib/utils";

type SocraticMode = 'Assessment' | 'Tutoring';

export function SocraticConfigDialog() {
    const { vectorStore } = useToolsStore();
    const {
        setIsSocraticModeActive,
        setCurrentSocraticTopic,
        setSelectedSocraticMode,
        setGeneratedSocraticPrompt,
        isGeneratingPrompt,
        setIsGeneratingPrompt,
        // Potentially clear context/prompt on open?
        // setRetrievedSocraticContext,
    } = useSocraticStore();

    const [topic, setTopic] = useState('');
    const [mode, setMode] = useState<SocraticMode | ''>(localStorage.getItem('socraticMode') as SocraticMode || '');
    const [error, setError] = useState<string | null>(null);
    const [progressValue, setProgressValue] = useState(0); // For progress bar

    const handleGenerate = async () => {
        if (!mode || !topic || !vectorStore?.id) {
            setError("Please select a mode, enter a topic, and ensure a vector store is linked.");
            return;
        }
        setError(null);
        setIsGeneratingPrompt(true);
        setProgressValue(10); // Initial progress

        try {
            // Simulate progress increase
             const interval = setInterval(() => {
                 setProgressValue((prev) => (prev < 90 ? prev + 5 : prev));
             }, 300);

             console.log(`Requesting Socratic prompt generation: Mode=${mode}, Topic=${topic}, VS=${vectorStore.id}`);

            const response = await fetch('/api/socratic/prepare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode, topic, vectorStoreId: vectorStore.id }),
            });

             clearInterval(interval); // Stop simulated progress

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
                throw new Error(errorData.error || `Failed to generate prompt (${response.status})`);
            }

            const data = await response.json();
            if (data.socraticPrompt) {
                 console.log("Successfully generated Socratic prompt.");
                setGeneratedSocraticPrompt(data.socraticPrompt);
                setCurrentSocraticTopic(topic);
                setSelectedSocraticMode(mode as SocraticMode);
                setIsSocraticModeActive(true);
                setProgressValue(100); // Set to complete

                 // Close dialog after a short delay (optional)
                 setTimeout(() => {
                      // Find a way to close the dialog, might need to pass 'setOpen' from parent
                      // Or use DialogClose Trigger
                      document.getElementById('socratic-dialog-close-button')?.click(); // Hacky way if needed
                      setIsGeneratingPrompt(false); // Reset loading state
                      setProgressValue(0); // Reset progress
                 }, 500);

            } else {
                throw new Error("Backend did not return a valid prompt.");
            }

        } catch (err) {
            console.error("Error generating Socratic prompt:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
            setIsGeneratingPrompt(false);
             setProgressValue(0); // Reset progress on error
        }
    };

    return (
        <> {/* Use Fragment to avoid unnecessary div */}
            <DialogHeader>
                <DialogTitle>Configure Socratic Tutor</DialogTitle>
                <DialogDescription>
                    Set up the topic and mode for the Socratic learning session based on the linked knowledge base.
                </DialogDescription>
            </DialogHeader>
            
            {/* Conditionally render Form or Loading State */}
            {isGeneratingPrompt ? (
                // --- Loading State --- 
                <div className="flex flex-col items-center justify-center gap-3 py-8 min-h-[250px]">
                     <Progress value={progressValue} className="w-[80%] h-2" />
                     <p className="text-sm text-muted-foreground text-center mt-1.5">Generating Socratic instructions...</p>
                </div>
             ) : (
                 // --- Form Input State --- 
                 <div className="grid gap-4 py-4">
                     {/* Display Linked Vector Store */} 
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label className="text-right">Knowledge Base</Label>
                         <span className="col-span-3 text-sm text-muted-foreground truncate">
                             {vectorStore?.id ? `${vectorStore.name || 'Linked Store'} (${vectorStore.id})` : "No Vector Store linked"}
                         </span>
                     </div>
                     {/* Mode Selection */} 
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="socratic-mode-select" className="text-right">
                             Mode
                         </Label>
                          <Select
                             value={mode}
                             onValueChange={(value) => {
                                 const newMode = value as SocraticMode | '';
                                 setMode(newMode);
                                 if (newMode) {
                                     localStorage.setItem('socraticMode', newMode);
                                 } else {
                                     localStorage.removeItem('socraticMode');
                                 }
                             }}
                             disabled={!vectorStore?.id}
                         >
                             <SelectTrigger id="socratic-mode-select" className="col-span-3">
                                 <SelectValue placeholder="Select a mode" />
                             </SelectTrigger>
                             <SelectContent>
                                 <SelectItem value="Assessment">Assessment Mode</SelectItem>
                                 <SelectItem value="Tutoring">Tutoring Mode</SelectItem>
                             </SelectContent>
                         </Select>
                     </div>
                     {/* Topic Input */} 
                     <div className="grid grid-cols-4 items-start gap-4">
                         <Label htmlFor="socratic-topic" className="text-right pt-2">
                             Topic / Focus
                         </Label>
                         <Textarea
                             id="socratic-topic"
                             placeholder="Enter the specific topic or concept..."
                             className="col-span-3"
                             rows={3}
                             value={topic}
                             onChange={(e) => setTopic(e.target.value)}
                             disabled={!vectorStore?.id}
                         />
                     </div>
                      {/* Error Display - Show only when form is visible */}
                      {error && (
                         <div className="col-span-4">
                            <p className="text-sm text-destructive text-center pt-1">{error}</p>
                         </div>
                       )}
                 </div>
             )}

            <DialogFooter>
                 <DialogClose asChild>
                      <button id="socratic-dialog-close-button" style={{ display: 'none' }}>Close</button>
                 </DialogClose>
                 <Button
                     type="button"
                     onClick={handleGenerate}
                     // Disable button also when loading
                     disabled={isGeneratingPrompt || !mode || !topic || !vectorStore?.id}
                 >
                     {isGeneratingPrompt ? 'Generating...' : 'Prepare Socratic Session'}
                 </Button>
            </DialogFooter>
        </>
    );
} 