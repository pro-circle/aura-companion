# Aura Companion

DEVELOPMENT ABSTRACT

Title

AURA – Adaptive Unified Responsive AI Avatar: An Environment-Aware Multimodal Artificial Intelligence Web Application

Abstract

The proposed project, AURA (Adaptive Unified Responsive AI Avatar), is an intelligent, interactive web-based virtual avatar designed to provide a natural and context-aware human–computer interaction experience. Unlike conventional chatbot systems that primarily respond to user-provided text or voice commands, AURA integrates conversational artificial intelligence, computer vision, speech processing, environmental context awareness, emotion-driven avatar animation, and real-time interaction within a single web application.

The system is designed to operate initially on a localhost environment, enabling development and testing without requiring a dedicated cloud infrastructure. Users can interact with the avatar through text, voice, and camera input. The microphone enables speech recognition and conversion of spoken input into text, while a camera module allows the system to perceive selected aspects of the surrounding environment. Computer vision techniques can be used to identify the presence of people, approximate the number of users, detect basic scene characteristics, and derive contextual information without necessarily transmitting raw camera data to external services.

A central Context Awareness Engine combines information obtained from multiple sources, including the current time, date, day of the week, day/night conditions, user presence, camera observations, conversation history, and optionally external environmental information such as weather. This contextual information is supplied to the AI reasoning layer along with the user's query. Consequently, the avatar can produce responses that are not only linguistically relevant but also appropriate to the user's current situation and environment.

The conversational intelligence layer is implemented using a Large Language Model (LLM), which acts as the primary reasoning component of the system. The model interprets user input, environmental context, and relevant conversation history to generate an appropriate response. Instead of producing only plain text, the AI can return structured information such as the response message, emotional state, animation state, speech requirement, and interaction priority. This enables the frontend to coordinate the avatar's facial expressions, gestures, speaking state, and other visual behaviors with the generated response.

The speech interaction pipeline consists of Speech-to-Text (STT) and Text-to-Speech (TTS) components. User speech is converted into text, processed by the AI system, and subsequently converted back into natural-sounding speech. The avatar therefore provides a conversational experience in which the user can speak naturally rather than relying entirely on keyboard input. The system also incorporates real-time interaction states such as idle, listening, thinking, speaking, happy, surprised, confused, and alert, allowing the avatar's visual behavior to correspond with the current stage of interaction.

The proposed architecture follows a modular design consisting of a React-based frontend, FastAPI backend, WebSocket-based real-time communication layer, AI/LLM service, computer vision module, speech processing module, environment/context engine, avatar animation system, and SQLite-based memory layer. Technologies such as Three.js or React Three Fiber can be used to develop an interactive 3D avatar, while MediaPipe, ONNX Runtime, or other computer vision frameworks can support local visual perception. An open-source LLM can be deployed locally through an inference framework such as Ollama, enabling the system to operate with greater privacy and reduced dependency on external APIs.

A major design consideration of AURA is privacy-aware processing. Since the system may access sensitive input sources such as a camera and microphone, the application is designed to provide explicit controls for camera access, microphone access, AI memory, and external environmental services. Where technically feasible, visual and speech processing can be performed locally so that raw camera and audio data need not be continuously transmitted to external servers.

The development will follow an incremental approach beginning with a basic conversational avatar and progressively integrating voice interaction, computer vision, environmental context, real-time avatar animation, memory, and proactive interaction. The final system aims to demonstrate how multiple AI modalities can be combined to create a more natural and responsive human–computer interface.

The proposed AURA system can serve as a foundation for applications in virtual assistants, smart workspaces, education, digital reception, accessibility, interactive kiosks, personal productivity, customer support, and intelligent human–computer interaction. The project ultimately aims to move beyond conventional command-based AI systems toward an environment-aware, multimodal, interactive digital companion capable of understanding not only what the user says, but also relevant aspects of the situation in which the interaction occurs.

Deliverables:
- gimme the models and the tech stacks to be used.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0f484c8d-f52b-4bd0-a976-a78ea471a657).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
