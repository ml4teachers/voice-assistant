import useConversationStore from "@/stores/useConversationStore";
import { type Item as ChatItem } from "@/hooks/useHandleRealtimeEvents"; // Annahme des Typs

// Funktion zum Formatieren der Chat-Daten und Survey-Antworten als Text
export function formatDataForTxt(chatMessages: ChatItem[], surveyAnswers: Record<string, number | string> | null): string {
  console.log("[formatDataForTxt] Received chatMessages (raw):", chatMessages);
  console.log("[formatDataForTxt] Received surveyAnswers (raw):", surveyAnswers);
  // Attempt to stringify, but be careful with circular references if objects are complex
  try {
    console.log("[formatDataForTxt] Received chatMessages (JSON):", JSON.stringify(chatMessages, null, 2));
    console.log("[formatDataForTxt] Received surveyAnswers (JSON):", JSON.stringify(surveyAnswers, null, 2));
  } catch (e) {
    console.warn("[formatDataForTxt] Could not stringify input data for logging:", e);
  }

  const newline = String.fromCharCode(10); // Use character code for newline

  const lines = chatMessages
    .filter((msg) => {
      const passesFilter = msg.type === "message" && typeof msg.role === "string" && Array.isArray(msg.content);
      // console.log(`[formatDataForTxt] Filtering msg (ID: ${msg.id || 'N/A'}): type=${msg.type}, role=${msg.role}, isContentArray=${Array.isArray(msg.content)}, passes=${passesFilter}`);
      return passesFilter;
    })
    .map((msg: any, index: number) => {
      // console.log(`[formatDataForTxt] Mapping message ${index} (raw):`, msg);
      try {
        console.log(`[formatDataForTxt] Mapping message ${index} (JSON):`, JSON.stringify(msg, null, 2));
      } catch (e) {
        console.warn(`[formatDataForTxt] Could not stringify message ${index} for logging:`, e);
      }
      const who = msg.role === "user" ? "User" : "Assistant";
      
      let text = "";
      if (msg.content && Array.isArray(msg.content)) {
        const textContentItem = msg.content.find((c: any) => c.type === 'input_text' || c.type === 'output_text');
        // console.log(`[formatDataForTxt] Message ${index} - textContentItem (raw):`, textContentItem);
        try {
          console.log(`[formatDataForTxt] Message ${index} - textContentItem (JSON):`, JSON.stringify(textContentItem, null, 2));
        } catch (e) {
          console.warn(`[formatDataForTxt] Could not stringify textContentItem for message ${index}:`, e);
        }

        if (textContentItem && typeof textContentItem.text === 'string') {
          text = textContentItem.text;
        } else if (textContentItem && textContentItem.text !== undefined) {
          console.warn(`[formatDataForTxt] Message ${index} - textContentItem.text is not a string:`, textContentItem.text, "(type:", typeof textContentItem.text + ")");
          text = String(textContentItem.text); // Attempt to convert to string
        } else if (textContentItem) {
          console.warn(`[formatDataForTxt] Message ${index} - textContentItem found, but 'text' property is missing or undefined:`, textContentItem);
        } else {
          console.warn(`[formatDataForTxt] Message ${index} - No 'input_text' or 'output_text' found in content:`, msg.content);
        }
      } else {
        console.warn(`[formatDataForTxt] Message ${index} - msg.content is null or not an array.`);
      }
      console.log(`[formatDataForTxt] Message ${index} - Extracted text: "${text}"`);
      return `${who}: ${text}`;
    });

  let surveyText = "";
  const surveyHeader = newline + newline + "--- Survey Answers ---" + newline;

  if (surveyAnswers && Object.keys(surveyAnswers).length > 0) {
    const surveyEntries = Object.entries(surveyAnswers)
      .map(([key, value]) => `${key}: ${value}`)
      .join(newline); // Use explicit newline character
    surveyText = surveyHeader + surveyEntries + newline;
  } else {
    surveyText = surveyHeader + "No survey answers provided." + newline;
    console.log("[formatDataForTxt] No survey answers were provided or surveyAnswers object was empty.");
  }

  const result = lines.join(newline) + surveyText; // Use explicit newline character

  // Log with JSON.stringify to see \n explicitly if they are still there, or if they are true newlines
  console.log("[formatDataForTxt] Final formatted content for Blob (inspect newlines here):", JSON.stringify(result)); 
  return result;
}

// Funktion zum Herunterladen einer Textdatei
export function downloadTxtFile(content: string, filename: string): void {
  if (!content) {
    console.warn("Kein Inhalt zum Herunterladen für die Datei:", filename);
    return;
  }
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Die alte Funktion kann entfernt oder umbenannt werden, wenn sie nicht mehr direkt genutzt wird.
// export function exportChatAsTxt() { ... }

// Neue Hilfsfunktion: Exportiere aktuellen Chat als TXT ohne Survey-Antworten
export function exportChatAsTxt(): void {
  try {
    const currentTranscript = useConversationStore.getState().chatMessages as ChatItem[];
    if (!currentTranscript || currentTranscript.length === 0) {
      console.warn("Kein Chatverlauf zum Exportieren vorhanden.");
      return;
    }

    const formattedContent = formatDataForTxt(currentTranscript, null);

    const now = new Date();
    const swissTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Europe/Zurich" })
    );
    const year = swissTime.getFullYear();
    const month = (swissTime.getMonth() + 1).toString().padStart(2, "0");
    const day = swissTime.getDate().toString().padStart(2, "0");
    const hours = swissTime.getHours().toString().padStart(2, "0");
    const minutes = swissTime.getMinutes().toString().padStart(2, "0");
    const filename = `Transcript_ManualExport_${year}${month}${day}_${hours}${minutes}.txt`;

    downloadTxtFile(formattedContent, filename);
  } catch (e) {
    console.error("Fehler beim Export des Chatverlaufs als TXT:", e);
  }
}
