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
// import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
    setIsSocraticModeActive,
  } = useSocraticStore();

  return (
    <div className="flex flex-col h-full">

      <PanelConfig
        title="Socratic Mode"
        tooltip="Engage in guided learning dialogues using provided context."
        enabled={isSocraticModeActive}
        setEnabled={setIsSocraticModeActive}
      >
        <span className="text-muted-foreground text-xs">Engage in guided learning dialogues.</span>
      </PanelConfig>

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
