# Real-Time Socratic Voice Assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![NextJS](https://img.shields.io/badge/Built_with-Next.js-blue)
![OpenAI](https://img.shields.io/badge/Powered_by-OpenAI_Realtime_API-orange)
![TypeScript](https://img.shields.io/badge/Code-TypeScript-blue)
![Shadcn UI](https://img.shields.io/badge/UI-shadcn/ui-black)

## Description

This project is a research platform exploring human-AI interaction through voice, specifically focusing on creating a **real-time, voice-based Socratic learning partner**. It utilizes the OpenAI Realtime API for low-latency speech-to-text (STT) and text-to-speech (TTS) capabilities, enabling natural spoken dialogue.

The assistant can leverage various tools, including:
* **Custom Functions:** Defined backend logic triggered by the assistant (e.g., fetching weather).
* **File Search (Retrieval):** Searching through user-uploaded documents via Vector Stores (used internally for Socratic context and potentially via wrapper function).
* **Web Search:** Searching the web for up-to-date information (implementation via wrapper function).

A core feature is the implementation of a **Socratic tutoring mode**, inspired by the "Socratic Playground for Learning" described by Hu et al. (2025), adapted for voice interaction and **dynamically informed by user-provided documents via the File Search functionality**.

The project is built using Next.js, TypeScript, Zustand for state management, and shadcn/ui with Tailwind CSS for the user interface.

## Current Features

* Real-time voice chat interface using OpenAI Realtime API.
* Low-latency STT and TTS.
* Client-side handling of Realtime API events (WebRTC/DataChannel).
* Function Calling: Assistant can trigger predefined backend functions.
* File Search: Assistant can retrieve information from user-provided vector stores (via Responses API wrapper or internally for Socratic Mode).
* Web Search: Assistant can search the web (via Responses API wrapper).
* Configurable Tools Panel (File Search setup, Web Search config, Function overview) using shadcn/ui components.
* **Socratic Tutoring Mode:** Assistant can engage in Socratic dialogues (**Assessment** or **Tutoring** modes) on a user-specified topic, dynamically generating instructions based on context retrieved from the linked Vector Store.

## Planned Features

* Enhanced UI/UX refinement.
* More sophisticated Socratic dialogue strategies (e.g., explicit misconception handling, learner modeling based on Hu et al.).
* Scoring and feedback mechanisms for Assessment mode.

## Tech Stack

* **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
* **State Management:** Zustand
* **Real-time Communication:** WebRTC (via browser APIs), OpenAI Realtime API (WebSocket/DataChannel conceptual layer)
* **AI/LLM:** OpenAI (Realtime API for interaction, **Responses API for Vector Store context retrieval**, Chat Completions API for Socratic prompt generation)
* **Backend:** Next.js API Routes (for function execution, token generation, wrapper logic, Socratic prompt preparation)

## Setup

1.  **OpenAI API Key:**
    * Sign up at [OpenAI Platform](https://platform.openai.com/signup).
    * Get your API key from the [API Keys page](https://platform.openai.com/api-keys).
    * Create a `.env.local` file in the project root.
    * Add your key: `OPENAI_API_KEY=sk-YourSecretKey`

2.  **Dependencies:**
    ```bash
    npm install
    # or pnpm install / yarn install
    ```

3.  **Run Development Server:**
    ```bash
    npm run dev
    # or pnpm dev / yarn dev
    ```
    The app will be available at `http://localhost:3000`.

## Configuration

* **Tools Panel:** Use the side panel (accessible via the button top-left) to:
    * Enable/Disable File Search and link/unlink Vector Stores. **(Required for Socratic Mode context)**
    * Enable/Disable Web Search and configure user location.
    * Enable/Disable custom Functions.
    * Configure and activate Socratic Mode: Click "Configure Socratic Tutor", select a mode (Assessment/Tutoring), enter a topic focus, and click "Prepare Socratic Session". The system will retrieve relevant context from the linked Vector Store and generate specific instructions for the AI tutor. Deactivate the mode via the panel when done.
* **Constants:** Adjust the base model (`MODEL`) or the default developer prompt (`DEVELOPER_PROMPT`) in `config/constants.ts`.
* **Functions:** Add or modify custom functions in `config/tools-list.ts` and implement their backend logic in `/app/api/functions/`. File/Web Search use wrapper functions.
* **Socratic Prompts:** The base template (`SOCRATIC_BASE_PROMPT`) and the meta-prompt for dynamic generation are in `config/socratic-prompt.ts`. The backend route `/api/socratic/prepare` handles the generation.

## License

This project is licensed under the MIT License. See the LICENSE file for details. (Note: Includes OFL for Geist fonts).

## Research Context

This application serves as a platform for PhD research focusing on conversational interactions with AI voice models in educational settings. **The system dynamically adapts the Socratic dialogue based on user-provided knowledge materials.** Inspired by Hu et al. (2025). Generative AI in Education: From Foundational Insights to the Socratic Playground for Learning. arXiv:2501.06682.