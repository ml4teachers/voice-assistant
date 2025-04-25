import useConversationStore from "@/stores/useConversationStore";

export function exportChatAsTxt() {
  const chatMessages = useConversationStore.getState().chatMessages;
  if (!chatMessages || chatMessages.length === 0) {
    alert("Kein Chatverlauf zum Exportieren vorhanden.");
    return;
  }
  const lines = chatMessages
    .filter((msg) => msg.type === "message" && typeof msg.role === "string" && Array.isArray(msg.content))
    .map((msg: any) => {
      const who = msg.role === "user" ? "User" : "Assistant";
      // msg.content ist ein Array von ContentItem, wir nehmen das erste Element mit Text
      const text = msg.content?.[0]?.text ?? "";
      return `${who}: ${text}`;
    });
  const txt = lines.join("\n\n");
  const blob = new Blob([txt], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chatverlauf_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
