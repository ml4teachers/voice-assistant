"use client";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PanelLeft } from "lucide-react";
import ToolsPanel from "@/components/tools-panel";
import RealtimeChat from "@/components/realtime-chat";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { useSessionControlStore } from "@/stores/useSessionControlStore";

import React, { useState } from "react";
import useInterfaceStore from "@/stores/useInterfaceStore";

export default function Main() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "1234") {
      setDialogOpen(false);
      setSheetOpen(true);
      setPassword("");
      setError("");
    } else {
      setError("Falsches Passwort.");
    }
  };

  const appMode = useInterfaceStore((state) => state.appMode);
  // Onboarding-Dialog State aus Store
  const showOnboardingDialog = useSessionControlStore((s) => s.showOnboardingDialog);
  const closeOnboarding = useSessionControlStore((s) => s.closeOnboarding);

  return (
    <>
      <div className="flex h-screen w-screen bg-background relative">
          {/* Header Buttons Group (Top Left) - Simplified */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            {/* Dialog für Passwortschutz */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" title="Konfiguration öffnen">
                  <PanelLeft className="h-4 w-4" />
                  <span className="sr-only">Konfiguration öffnen</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Konfiguration geschützt</DialogTitle>
                  <DialogDescription>
                    Bitte Passwort eingeben, um die Einstellungen zu öffnen.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <Input
                    type="password"
                    placeholder="Passwort"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoFocus
                  />
                  {error && <div className="text-destructive text-sm">{error}</div>}
                  <DialogFooter>
                    <Button type="submit">Bestätigen</Button>
                    <DialogClose asChild>
                      <Button type="button" variant="ghost">Abbrechen</Button>
                    </DialogClose>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            {/* Sheet für ToolsPanel, nur nach Passwort sichtbar */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="left" className="w-full sm:w-[400px] overflow-y-auto p-0">
                    <SheetHeader className="p-6 pb-4 border-b">
                        <SheetTitle>Configuration</SheetTitle>
                        <SheetDescription>
                            Adjust assistant settings and configure tools.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="p-6 pt-4">
                        <ToolsPanel />
                    </div>
                </SheetContent>
            </Sheet>
          </div>

          {/* Main content area (Chat) */}
          <div className="flex-grow h-full pt-16">
              {/* OnboardingDialog für Research Mode */}
              <OnboardingDialog isOpen={showOnboardingDialog} onClose={closeOnboarding} />
              <RealtimeChat />
          </div>
      </div>
    </>
  );
}
