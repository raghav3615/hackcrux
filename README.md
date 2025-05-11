# Project Serenity - Your Personalized AI Twin

Project of Team Serenity built during Hackcrux 2025.

## Overview

This project is a personalized AI assistant, designed to act as your "digital twin." It can help you with a variety of tasks by learning your communication style and preferences. The assistant integrates with services like Google Calendar and email, and can perform research on demand.

## Features

*   **Personalized Chat:** Engages in natural conversation, adapting to your style.
*   **Smart Scheduling:** Integrates with Google Calendar to help you schedule meetings and manage events. ([services/calendar.js](services/calendar.js))
*   **AI-Powered Email Drafting:** Assists in composing emails, learning your tone and common contacts. ([services/emailService.js](services/emailService.js))
*   **In-depth Research:** Can perform research on various topics, summarizing information from multiple sources. ([services/research.js](services/research.js))
*   **Intent Recognition:** Understands user intent to provide relevant actions (e.g., scheduling, emailing, research). ([services/chat.js](services/chat.js) - `classifyIntent` function)
*   **Contextual Understanding:** Maintains conversation history to provide context-aware responses. ([services/chat.js](services/chat.js) - `conversationHistory`)
*   **User Authentication:** Securely connects to Google services. ([services/auth/googleAuth.js](services/auth/googleAuth.js))
*   **Web Interface:** A user-friendly chat interface to interact with the AI assistant. ([frontend/src/App.jsx](frontend/src/App.jsx))

## Tech Stack

*   **Backend:** Node.js, Express.js ([server.js](server.js), [package.json](package.json))
*   **Frontend:** React, Vite ([frontend/src/App.jsx](frontend/src/App.jsx), [frontend/package.json](frontend/package.json))
*   **AI/NLP:** Google Gemini API ([services/chat.js](services/chat.js), [services/emailService.js](services/emailService.js), etc.)
*   **Database:** MongoDB (Mongoose) ([db/connection.js](db/connection.js), [models/User.js](models/User.js), [models/Chat.js](models/Chat.js), [models/Message.js](models/Message.js))
*   **Google Services Integration:** Google Calendar API, Gmail API (via `googleapis`)

## Setup and Installation

1.  **Clone the repository:**
    ```sh
    git clone <your-repository-url>
    cd <your-repository-directory>
    ```
2.  **Install backend dependencies:**
    ```sh
    npm install
    ```
3.  **Install frontend dependencies:**
    ```sh
    cd frontend
    npm install
    cd ..
    ```
4.  **Set up environment variables:**
    Create a `.env` file in the root directory and add necessary API keys and configuration (e.g., `GEMINI_API_KEY`, `MONGO_URI`, Google Cloud credentials path). Refer to `.env.example` if available.
    Your `credentials.json` and `google_token.json` will be used for Google API authentication.
5.  **Run the application:**
    ```sh
    npm start
    ```
    This will typically start the backend server. The frontend might need to be started separately from the `frontend` directory (e.g., `npm run dev`).

## Usage

Once the application is running:

1.  Open your web browser and navigate to the frontend URL (usually `http://localhost:5173` or as specified by Vite).
2.  If it's your first time using features that require Google integration (like calendar or email), you might be prompted to authenticate with your Google account.
3.  Interact with your AI twin through the chat interface. You can ask it to:
    *   "Schedule a meeting with John for tomorrow at 10 am about our project."
    *   "Draft an email to Jane about the latest updates."
    *   "Do some research on the future of AI."
    *   Or just have a general conversation!

---
