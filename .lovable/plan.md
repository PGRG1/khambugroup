# Bani AI two-way voice conversation

## Experience
- Keep the current text chat and tenant data access unchanged; voice turns use the same send path and appear in session history.
- Extend the existing gradient voice panel with listening, thinking, speaking, interruption, Show chat, and automatic return to listening.
- Stop recognition during speech, suspend voice when hidden, and clean up on exit, new chat, workspace changes, and navigation.
- Stop silent listening after eight seconds; send speech after recognition ends or about 1.2 seconds without new words.

## Spoken output
- Emit one category-specific filler at the first tool step and at most one follow-up after eight seconds.
- Emit a short grounded spoken summary before answer content, without changing existing analysis models, tools, or prompts.
- Add authenticated ElevenLabs audio streaming with a 600-character limit; use George as the default premade voice. Queue speech in order, replace queued fillers with the summary, and fall back to browser speech when ElevenLabs is unavailable.
- Limit speech requests to three per turn and unlock the shared audio player from the mic tap.

## Decisions needed
- The authenticated catalog still lists the requested Gemini 2.5 Flash, but marks it deprecated with a retirement date of **20 October 2026** (already past today). Its availability is therefore inconsistent and cannot be relied on for a new call. Choose a current replacement for the new summary call only; Gemini 3.8 Flash is the proposed alternative, subject to an authenticated availability check. Existing chat model routing stays untouched.
- ElevenLabs API key is not currently set. Check an accessible ElevenLabs connection first; if none exists, the owner can add their own key securely in Project Settings → Secrets. Browser speech remains available without it.

## Technical details
- Add `useVoiceConversation` to own speech state, timers, audio queue, analyser, cancellation, and lifecycle cleanup; reuse `useSpeechInput` without changing its behavior.
- Extend only the voice request/event contract in `chat-assistant`; add `bani-tts` using shared authentication, POST validation, SDK CORS, and server-only credentials.
- Add focused tests for auto-send timing, silence timeout, queue replacement, limits, cleanup, and voice-only events.
- Deploy changed functions, check the automatic preview build, and verify a signed-in full loop plus desktop/phone presentation where possible. Report unverified microphone/iOS behavior honestly. Do not publish.