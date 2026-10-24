# Bani AI voice using only Lovable's built-in AI: research findings (no build)

Research only. No code, secrets or settings change. The authenticated model list (checked 24 Oct 2026) confirmed everything below unless it is marked **inferred**.

## 1. Speech to text: available
- Dedicated transcription models (`/v1/audio/transcriptions`, multipart file upload, streaming text):
  - `openai/gpt-transcribe`: current, zero data retention. Recommended.
  - `google/gemini-3.5-transcribe`: current, zero retention.
  - `openai/gpt-4o-transcribe` and `gpt-4o-mini-transcribe`: deprecated.
- General Gemini chat models also accept audio input (for example `gemini-3.8-flash` and `gemini-4-argon`). This would allow one step that both understands and answers spoken questions.
- Formats: the endpoint limit is 25 MB per file. Gemini transcription is capped at 14 MB and needs browser recordings labelled `audio/webm`. Exact formats per model come from the provider, not the gateway (**inferred**: webm/opus, mp3 and wav are all standard). A 10-second clip is well under these limits.
- Latency was not measured. **Inferred**: about 1–2 seconds for a short clip.

## 2. Languages (inferred, not tested)
- Language is auto-detected; Gemini transcription accepts a list of expected languages.
- English, Hindi and Indonesian: strong. Tagalog: good. Nepali: fair. Cantonese: usable, but may come out as Mandarin-style written Chinese.
- Mixed speech (Taglish, Hinglish) with English item names: generally fine. Short or noisy clips and unusual item names need a vocabulary hint. A real test with staff voices is needed before relying on it.

## 3. Text to speech: available
- `/v1/audio/speech` with streaming audio:
  - `google/gemini-3.1-flash-tts-preview`: the workspace default, current, zero retention.
  - `google/gemini-2.5-flash-tts` and `gemini-2.5-pro-tts`: current.
  - `openai/gpt-4o-mini-tts`: deprecated.
- Voices: Gemini named voices (for example Kore); tone is steered by the text itself. The OpenAI voices start from `alloy`.
- Language coverage (**inferred** from provider documentation, not tested): English, Hindi and Indonesian are covered. Tagalog, Nepali and Cantonese are uncertain or weaker.
- `openai/gpt-live-1` does real-time two-way voice. It requires migrating this project to TanStack Start, so it is not usable here as-is.

## 4. Pricing (taken from the listing; amounts are Lovable credits, not dollars)
- `gpt-transcribe`: 0.0003 credits per second, so a 10-second question costs about **0.003 credits**.
- `gemini-3.1-flash-tts-preview` speaking a 2-sentence reply of about 6 seconds: about **0.01–0.015 credits**. The rate is 0.00008 per audio output token. **Inferred**: about 25 tokens per second of audio.
- Plain text costs, such as a short summary call, come on top but are smaller.
- **Inferred** total per voice turn, excluding the existing chat answer: about 0.015–0.02 credits.

## 5. Current chat models
- `google/gemini-2.5-pro` and `google/gemini-2.5-flash` are both marked **deprecated** with an expiry of **20 Oct 2026**, which has already passed. They are still listed, but they should not be relied on.
- Current replacements from the listing:
  - Pro role: `google/gemini-4-argon` (zero retention) or `google/gemini-3.1-pro-preview`.
  - Flash role: `google/gemini-3.8-flash`.
  - The workspace default for new chat calls is `openai/gpt-6-astra`.
- Retention note: `gemini-3.8-flash` and `gemini-3.1-pro-preview` keep data at the provider. Only Anthropic models are allowed under this workspace's retention policy, so these two would be blocked unless an admin enables extended retention. Use `gemini-4-argon` or `gpt-6-astra` instead.

## Not done
No live audio calls, no latency or language tests, no changes. If the owner wants to go ahead, the next step is a separate plan for a small, measured trial.
