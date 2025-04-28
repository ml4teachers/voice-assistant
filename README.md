# Real-Time Socratic Voice Assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![NextJS](https://img.shields.io/badge/Built_with-Next.js_15-blue)
![OpenAI](https://img.shields.io/badge/AI-OpenAI_Realtime_&_API-orange)
![TypeScript](https://img.shields.io/badge/Code-TypeScript-blue)
![Shadcn UI](https://img.shields.io/badge/UI-shadcn/ui-black)
![Zustand](https://img.shields.io/badge/State-Zustand-lightblue)
![WebRTC](https://img.shields.io/badge/Transport-WebRTC-red)

## Description

This project serves as a **research platform** for investigating human-AI interaction through voice. It implements a **real-time, voice-based Socratic learning partner** designed primarily for educational research settings, specifically for exam preparation dialogues.

Utilizing the **OpenAI Realtime API (Beta)** via WebRTC, it enables low-latency, natural-sounding spoken conversations with advanced Speech-to-Text (STT) and Text-to-Speech (TTS).

A key feature is the **Socratic Tutoring/Assessment Mode**. This mode leverages:
* **Dynamic Prompt Generation:** A backend process (`/api/socratic/prepare`) uses context retrieved from **OpenAI Vector Stores** (via the Responses API) and a meta-prompt processed by **GPT-4o-mini** to generate tailored instructions for the AI tutor, focusing on natural, concise, and mode-appropriate (Tutoring vs. Assessment) dialogue.
* **Pre-Generated Prompts:** For efficiency during research with fixed topics, the system can load pre-generated prompts from local files, bypassing runtime AI generation costs.
* **Custom Topic Input:** Users can still provide their own topics for dynamic prompt generation.

The assistant can also utilize standard tools via function calling, implemented through backend API routes:
* **Custom Functions:** E.g., fetching weather (`get_weather`), telling jokes (`get_joke`).
* **File Search (Wrapper):** Searches linked Vector Stores using the OpenAI Responses API via a backend wrapper function (`file_search_wrapper`).
* **Web Search (Wrapper):** Searches the web using the OpenAI Responses API (including location awareness) via a backend wrapper function (`web_search_wrapper`).

The project is built with **Next.js (App Router)**, TypeScript, **Zustand** for state management, and **shadcn/ui** with Tailwind CSS for the interface. It includes features specifically designed for research data collection.

## Current Features

* Real-time voice chat interface (OpenAI Realtime API via WebRTC).
* Low-latency STT and TTS.
* Client-side WebRTC connection management, including **STUN/TURN integration** (e.g., via Twilio NTS) for reliable connectivity on restricted networks.
* Switchable UI View:
    * **Transcript View:** Shows the conversation log with user/assistant messages and tool calls.
    * **Voice-Only View:** Minimalist interface focusing on audio visualization (using Web Audio API `AnalyserNode`) for both user and assistant, hiding the transcript for more natural interaction studies.
* **Socratic Mode (Tutoring & Assessment):**
    * Dynamically generated instructions based on Vector Store context OR loading of pre-generated prompts.
    * Focus on natural, concise interaction style guided by meta-prompting.
    * Mode selection (Tutoring/Assessment) influencing AI behavior.
* **Tool Usage:** Custom Functions, File Search (via Vector Store & Responses API wrapper), Web Search (via Responses API wrapper).
* **Research Study Features:**
    * **Developer/Research Mode Switch:** Toggles between direct session start (Dev) and participant onboarding flow (Research).
    * **Participant Onboarding:** Multi-step dialog (`OnboardingDialog`) for instructions, consent confirmation (linking to physical form via ID code), topic/mode selection (predefined or custom).
    * **Multi-Source Recording (`MediaRecorder` API):** In Research Mode, automatically records:
        * Combined Video/Audio: Camera + Screen + Mic + System Audio (e.g., `video/webm`).
        * Separate High-Quality Mic Audio: For Conversation Analysis (e.g., `audio/webm` or `audio/wav`).
    * **Screen Share Request:** Integrated into the onboarding flow.
    * **Help Button:** Sends notification to researcher (e.g., via Discord Webhook).
    * **Data Download:** Recorded media files are offered for local download at the end of a session.
    * **Logging Placeholders:** Console logs structured for Session Metadata and Interaction Logs (intended for later integration with e.g., Supabase).
* **Configuration Sidebar (`Sheet`):**
    * Password-protected access (for researcher).
    * Organized into categories (`Accordion`): Assistant Behavior (Mode, Voice), Interface (View Mode, Dark Mode), Permissions (Status, Request Buttons), Tools (File Search, Web Search, Functions), Data (Clear Chat).

## Tech Stack

* **Frontend:** Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui (`Sheet`, `Dialog`, `Accordion`, `Select`, `Input`, `Button`, `Checkbox`, `ToggleGroup`, etc.), Framer Motion (potentially for animations).
* **State Management:** Zustand (`useConversationStore`, `useToolsStore`, `useSocraticStore`, `useInterfaceStore`, `useSessionControlStore`, `useMediaStore`).
* **Real-time Communication:** Browser WebRTC APIs, OpenAI Realtime API (Beta), **Requires external STUN/TURN Service** (e.g., Twilio NTS) configured via backend API route (`/api/turn-credentials`).
* **AI/LLM:** OpenAI (Realtime API, Responses API, Chat Completions API - e.g., `gpt-4o-mini` for meta-prompting).
* **Backend:** Next.js API Routes (for session tokens, TURN credentials, tool function execution, Socratic prompt preparation/loading, help notifications).
* **Recording:** Browser `MediaRecorder` API.
* **Data Storage (Study):** Local Download (via Browser APIs) for recorded media. Logging via `console.log` (structured for potential DB import). (Supabase DB intended for logs/metadata).

## Setup

1.  **OpenAI API Key:**
    * Get from [OpenAI Platform](https://platform.openai.com/api-keys).
    * Add to `.env.local`: `OPENAI_API_KEY=sk-YourSecretKey`
2.  **Twilio Account (for TURN):**
    * Sign up at [Twilio](https://www.twilio.com/try-twilio).
    * Find your Account SID and Auth Token in the Twilio Console.
    * Add to `.env.local`:
        ```dotenv
        TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        TWILIO_AUTH_TOKEN=your_auth_token_xxxxxxxxxxxxx
        ```
3.  **Discord Webhook URL (Optional, for Help Button):**
    * Create an Incoming Webhook in your Discord Server Settings -> Integrations.
    * Add to `.env.local`: `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy`
4.  **Settings Panel Password (Optional):**
    * Add a password for accessing the settings panel in the UI.
    * Add to `.env.local`: `SETTINGS_PASSWORD=your_secret_password`
5.  **Dependencies:**
    ```bash
    pnpm install
    # or npm install / yarn install
    ```
6.  **Run Development Server:**
    ```bash
    pnpm dev
    # or npm run dev / yarn dev
    ```
    The app will be available at `http://localhost:3000`.

## Configuration & Usage

* **App Modes:** Use the toggle in the Settings Sidebar (`App Mode` or similar section) to switch between:
    * **Developer Mode:** Allows direct session start, potentially skips recording. Ideal for testing features.
    * **Research Mode:** Triggers the multi-step onboarding dialog for participants. Automatically enables recording.
* **Settings Sidebar:** Access via the `<PanelLeft />` button (top-left). Requires password if `SETTINGS_PASSWORD` is set in `.env.local`. Contains structured settings:
    * **Assistant Behavior:** Select General/Socratic Mode, Configure Socratic Tutor (opens dialog if Socratic selected), Select Voice.
    * **Interface Settings:** Toggle View Mode (Transcript/Voice-Only), Toggle Dark Mode.
    * **Permissions:** View Mic/Camera status, Request permissions.
    * **Tools & Capabilities:** Enable/disable File Search (configure Vector Store), Web Search (configure location), Custom Functions.
    * **Data Management:** Clear Conversation History.
* **Onboarding (Research Mode):** Guides participants through Intro -> Consent/ID -> Topic/Mode Selection (Predefined or Custom) -> Preparation -> Final Start Button (triggers screen share prompt).
* **Pre-Generated Prompts:** For efficiency in Research Mode with predefined topics, place generated prompt JSON files (containing `{ "socraticPrompt": "..." }`) in `config/preGeneratedSocraticPrompts/`. Name them according to the keys defined in `components/OnboardingDialog.tsx` (e.g., `tutoring_wwi.json`). The `/api/socratic/prepare` route will load these if a `predefinedKey` is provided by the frontend.
* **Custom Topics:** If "Eigenes Thema..." is selected in onboarding, the `/api/socratic/prepare` route dynamically generates the prompt using OpenAI (requires Vector Store context).
* **Constants:** `config/constants.ts` holds default model names, `DEVELOPER_PROMPT`.
* **Functions:** `config/tools-list.ts` defines tool schemas. Implement logic in `/app/api/functions/`.

## License

This project is licensed under the MIT License. See the LICENSE file for details. (Note: Includes OFL for Geist fonts).

## Research Context

This application serves as a platform for PhD research (Thomas Zurfluh, PH Zug / UZH) focusing on the **sequential and multimodal organization of conversation** (Conversation Analysis) between students and AI voice models (KKAMs) in educational settings (exam preparation). It specifically investigates interactions within **dynamically generated or pre-loaded Socratic dialogues** based on user-provided knowledge materials (Vector Stores). The system includes features for **multi-source data recording** (video, audio, screen) to facilitate detailed interaction analysis. Inspired by work on Socratic ITS (e.g., Hu et al., 2025) but adapted for real-time voice and CA research questions.