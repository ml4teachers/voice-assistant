import { NextResponse } from "next/server";
// No need for the full OpenAI client if we just use fetch for this specific endpoint
// import OpenAI from "openai";

// This route handles the creation of an ephemeral OpenAI API key for the Realtime API session
export async function POST(request: Request) {
  const { model = "gpt-4o-mini-realtime-preview" } = await request.json().catch(() => ({}));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is not set.");
    return NextResponse.json(
      { error: "Server configuration error: Missing API key." },
      { status: 500 }
    );
  }

  try {
    console.log(`Requesting ephemeral token via fetch for model: ${model}`);
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error(`Error from OpenAI API (${response.status}):`, data);
        // Try to forward the error message from OpenAI if available
        const errorMessage = data?.error?.message || `HTTP error ${response.status}`;
        return NextResponse.json(
            { error: `Failed to create Realtime session: ${errorMessage}` },
            { status: response.status } // Use OpenAI's status code if available
        );
    }

    console.log("Ephemeral token created successfully via fetch.");
    // Send back the JSON received from the OpenAI REST API
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error fetching ephemeral token:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error during fetch";
    return NextResponse.json(
      { error: `Failed to create Realtime session: ${errorMessage}` },
      { status: 500 }
    );
  }
}
