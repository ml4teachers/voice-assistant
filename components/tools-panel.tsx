"use client";
import React, { useState } from "react";
import FileSearchSetup from "./file-search-setup";
import WebSearchConfig from "./websearch-config";
import FunctionsView from "./functions-view";
import PanelConfig from "./panel-config";
import useToolsStore from "@/stores/useToolsStore";
import useSocraticStore from "@/stores/useSocraticStore";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { BrainCircuit, BotIcon, Eye, Lock, Wrench, Trash2, MessageSquareQuoteIcon, MicIcon, VideoIcon, VideoOffIcon, MicOffIcon } from "lucide-react";
import { SocraticConfigDialog } from "./SocraticConfigDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { useInterfaceStore } from "@/stores/useInterfaceStore";
import VoiceSelector from "./voice-selector";
import { ModeToggle } from "./mode-toggle";
import useConversationStore from "@/stores/useConversationStore";
import { cn } from "@/lib/utils";
import { useShallow } from 'zustand/react/shallow'; // Import useShallow

export default function ToolsPanel() {
  const {
    fileSearchEnabled,
    setFileSearchEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    functionsEnabled,
    setFunctionsEnabled,
  } = useToolsStore();

  const {
    isSocraticModeActive,
    currentSocraticTopic,
    selectedSocraticMode,
    setIsSocraticModeActive,
  } = useSocraticStore(useShallow((state) => ({ // Use useShallow
    isSocraticModeActive: state.isSocraticModeActive,
    currentSocraticTopic: state.currentSocraticTopic,
    selectedSocraticMode: state.selectedSocraticMode,
    setIsSocraticModeActive: state.setIsSocraticModeActive,
  })));

  const {
    viewMode,
    selectedVoice,
    micPermission,
    cameraPermission,
    setViewMode,
    setSelectedVoice,
    requestMicAccess,
    requestCamAccess,
  } = useInterfaceStore(useShallow((state) => ({ // Use useShallow
    viewMode: state.viewMode,
    selectedVoice: state.selectedVoice,
    micPermission: state.micPermission,
    cameraPermission: state.cameraPermission,
    setViewMode: state.setViewMode,
    setSelectedVoice: state.setSelectedVoice,
    requestMicAccess: state.requestMicAccess,
    requestCamAccess: state.requestCamAccess,
  })));

  const clearConversation = useConversationStore((state) => state.rawSet);

  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);

  const handleClearConversation = () => {
    console.log("Clearing conversation from ToolsPanel.");
    clearConversation({ chatMessages: [] });
  };

  return (
    <Accordion type="single" collapsible className="w-full space-y-4">

      {/* Assistant Behavior Accordion Item */}
      <AccordionItem value="assistant">
        <AccordionTrigger className="text-sm font-medium">
          <div className="flex items-center">
            <BotIcon className="mr-2 h-4 w-4" /> Assistant Behavior
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-4 space-y-4">
          {/* Socratic Mode Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Assistant Mode</h3>
            {isSocraticModeActive ? (
              <div className="p-3 border rounded-md bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200 text-sm space-y-1">
                <p className="font-medium">Socratic Mode Active</p>
                <p className="text-xs">Topic: {currentSocraticTopic || 'N/A'}</p>
                <p className="text-xs">Mode: {selectedSocraticMode || 'N/A'}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  onClick={() => setIsSocraticModeActive(false)}
                >
                  Deactivate
                </Button>
              </div>
            ) : (
              <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" onClick={() => setIsConfigDialogOpen(true)}>
                    <BrainCircuit className="mr-2 h-4 w-4" /> Configure Socratic Tutor
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="sm:max-w-[450px]"
                  aria-describedby="socratic-config-description"
                >
                  <DialogDescription id="socratic-config-description" className="sr-only">
                    Configure Socratic tutor mode, topic, and knowledge base.
                  </DialogDescription>
                  <SocraticConfigDialog onClose={() => setIsConfigDialogOpen(false)} />
                </DialogContent>
              </Dialog>
            )}
          </div>
          {/* Voice Selector Section */}
          <div className="space-y-2">
             <h3 className="text-sm font-medium text-muted-foreground">Assistant Voice</h3>
             <VoiceSelector />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Interface Settings Accordion Item */}
      <AccordionItem value="interface">
        <AccordionTrigger className="text-sm font-medium">
          <div className="flex items-center">
            <Eye className="mr-2 h-4 w-4" /> Interface Settings
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-4 space-y-4">
           {/* View Mode Toggle Group */}
           <div className="space-y-2">
             <h3 className="text-sm font-medium text-muted-foreground">View Mode</h3>
             <ToggleGroup
               type="single"
               variant="outline"
               value={viewMode}
               onValueChange={(value) => { if (value) setViewMode(value as 'transcript' | 'voiceOnly'); }}
               className="justify-start"
             >
               <ToggleGroupItem value="transcript" aria-label="Transcript view" title="Transcript View">
                 <MessageSquareQuoteIcon className="h-4 w-4" />
               </ToggleGroupItem>
               <ToggleGroupItem value="voiceOnly" aria-label="Voice only view" title="Voice Only View">
                 <MicIcon className="h-4 w-4" />
               </ToggleGroupItem>
             </ToggleGroup>
           </div>
           {/* Theme Toggle */}
           <div className="space-y-2">
             <h3 className="text-sm font-medium text-muted-foreground">Theme</h3>
             <ModeToggle />
           </div>
        </AccordionContent>
      </AccordionItem>

      {/* Permissions Accordion Item */}
      <AccordionItem value="permissions">
        <AccordionTrigger className="text-sm font-medium">
          <div className="flex items-center">
            <Lock className="mr-2 h-4 w-4" /> Permissions
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm">
              {micPermission === 'granted' ? <MicIcon className="h-4 w-4 mr-2 text-green-500" /> : <MicOffIcon className={cn("h-4 w-4 mr-2", micPermission === 'denied' ? "text-red-500" : "text-muted-foreground")} />}
              Microphone: <span className={cn("ml-1 font-medium", { "text-green-600": micPermission === 'granted', "text-red-600": micPermission === 'denied', "text-yellow-600": micPermission === 'prompt' })}>{micPermission}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={requestMicAccess}
              disabled={micPermission === 'granted' || micPermission === 'denied'}
              className="h-7 text-xs"
            >
              {micPermission === 'prompt' ? 'Request' : 'Granted'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm">
              {cameraPermission === 'granted' ? <VideoIcon className="h-4 w-4 mr-2 text-green-500" /> : <VideoOffIcon className={cn("h-4 w-4 mr-2", cameraPermission === 'denied' ? "text-red-500" : "text-muted-foreground")} />}
              Camera: <span className={cn("ml-1 font-medium", { "text-green-600": cameraPermission === 'granted', "text-red-600": cameraPermission === 'denied', "text-yellow-600": cameraPermission === 'prompt' })}>{cameraPermission}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={requestCamAccess}
              disabled={cameraPermission === 'granted' || cameraPermission === 'denied'}
              className="h-7 text-xs"
            >
              {cameraPermission === 'prompt' ? 'Request' : 'Granted'}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Tools & Capabilities Accordion Item */}
      <AccordionItem value="tools">
        <AccordionTrigger className="text-sm font-medium">
          <div className="flex items-center">
            <Wrench className="mr-2 h-4 w-4" /> Tools & Capabilities
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-4 space-y-6">
          <PanelConfig
            title="File Search"
            tooltip="Allows to search a knowledge base (vector store)"
            enabled={fileSearchEnabled}
            setEnabled={setFileSearchEnabled}
          >
            <FileSearchSetup />
          </PanelConfig>
          <PanelConfig
            title="Web Search"
            tooltip="Allows to search the web"
            enabled={webSearchEnabled}
            setEnabled={setWebSearchEnabled}
          >
            <WebSearchConfig />
          </PanelConfig>
          <PanelConfig
            title="Functions"
            tooltip="Allows to use locally defined functions"
            enabled={functionsEnabled}
            setEnabled={setFunctionsEnabled}
          >
            <FunctionsView />
          </PanelConfig>
        </AccordionContent>
      </AccordionItem>

      {/* Data Management Accordion Item */}
      <AccordionItem value="data">
        <AccordionTrigger className="text-sm font-medium">
          <div className="flex items-center">
            <Trash2 className="mr-2 h-4 w-4" /> Data Management
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-4">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleClearConversation}
          >
            Clear Conversation History
          </Button>
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  );
}
