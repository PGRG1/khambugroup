# Assistant voice architecture

Apply these rules to assistant voice capture, dictation, playback and server voice integration changes.

- Voice routing uses the existing reasoning turn and full conversation, and acknowledgements originate only from confirmed tool work; bounded non-confidential session clips share one cancellable media element. Final speech extracts complete prose without a second model request, keeping text independent of audio.
- Voice capture has one mobile microphone owner (MediaRecorder); wall-clock capture deadlines and abortable stage deadlines must remain independent of analyser levels and recorder start events, with an explicit orb send and recoverable notices instead of discarding quiet recordings.
- Composer dictation uses MediaRecorder + bani-stt (never Web Speech) and only fills the editable draft; the orb has a constant ambient grain/swirl but its level-driven scale and glow come solely from real signals (mic analyser, or PCM envelope at the `<audio>` currentTime), and playback must never be routed through WebAudio.
