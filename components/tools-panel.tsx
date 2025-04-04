"use client";
import React from "react";
import FileSearchSetup from "./file-search-setup";
import WebSearchConfig from "./websearch-config";
import FunctionsView from "./functions-view";
import PanelConfig from "./panel-config";
import useToolsStore from "@/stores/useToolsStore";
import useSocraticStore from "@/stores/useSocraticStore";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { BrainCircuit } from "lucide-react";
import { SocraticConfigDialog } from "./SocraticConfigDialog";

export default function ToolsPanel() {
  const {
    fileSearchEnabled,
    setFileSearchEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    functionsEnabled,
    setFunctionsEnabled,
  } = useToolsStore();

  // --- Read Socratic state primitives individually --- 
  const isSocraticModeActive = useSocraticStore((state) => state.isSocraticModeActive);
  const currentSocraticTopic = useSocraticStore((state) => state.currentSocraticTopic);
  const selectedSocraticMode = useSocraticStore((state) => state.selectedSocraticMode);
  const setIsSocraticModeActive = useSocraticStore((state) => state.setIsSocraticModeActive);
  // ---------------------------------------------------

  return (
    <div className="flex flex-col h-full">

      <div className="mb-6 space-y-2">
          <h1 className="text-foreground font-medium">Assistant Mode</h1>
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
              <Dialog>
                  <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
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
                      <SocraticConfigDialog />
                  </DialogContent>
              </Dialog>
           )}
      </div>

      <Separator className="my-6" />

      <PanelConfig
        title="File Search"
        tooltip="Allows to search a knowledge base (vector store)"
        enabled={fileSearchEnabled}
        setEnabled={setFileSearchEnabled}
      >
        <FileSearchSetup />
      </PanelConfig>

      <Separator className="my-6" />

      <PanelConfig
        title="Web Search"
        tooltip="Allows to search the web"
        enabled={webSearchEnabled}
        setEnabled={setWebSearchEnabled}
      >
        <WebSearchConfig />
      </PanelConfig>

      <Separator className="my-6" />

      <PanelConfig
        title="Functions"
        tooltip="Allows to use locally defined functions"
        enabled={functionsEnabled}
        setEnabled={setFunctionsEnabled}
      >
        <FunctionsView />
      </PanelConfig>

      <Separator className="my-6" />

      <ModeToggle />

    </div>
  );
}
