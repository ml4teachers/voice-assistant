import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("DISCORD_WEBHOOK_URL nicht gesetzt!");
    return NextResponse.json({ error: "Webhook-URL nicht konfiguriert." }, { status: 500 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch (e) {
    // Ignoriere, falls kein Body gesendet wurde
  }

  // Baue die Nachricht
  let content = "Hilfe von einem Studienteilnehmer angefordert!";
  if (body && (body.participantId || body.sessionId)) {
    content = `Hilfe von ${body.participantId ?? "unbekannt"}${body.sessionId ? ` (Session: ${body.sessionId})` : ""} angefordert!`;
  } else if (body && body.message) {
    content = body.message;
  }

  const payload = { content };

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Fehler beim Senden an Discord:", text);
      return NextResponse.json({ error: "Fehler beim Senden an Discord." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Netzwerkfehler beim Senden an Discord:", error);
    return NextResponse.json({ error: "Netzwerkfehler beim Senden an Discord." }, { status: 500 });
  }
}
