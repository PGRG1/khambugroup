# Diagnosis: two-way voice "couldn't really talk" on phone

Diagnosis only. No app code changes. The end-to-end browser test below has not run yet. Approving this plan lets me run it and report what actually happens. Code-review findings are already listed. They are suspected failure points until the test confirms them.

## Step 1 - End-to-end headless test (read-only)
1. Use `bani-tts` to generate "How were sales at Assembly last week?", convert it to a 16-bit PCM WAV (48 kHz mono) with ffmpeg, and add 1.5 s of silence at the end. Files go in /tmp/browser/voice.
2. Launch Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`. Restore the minted session. If it lands in platform admin, enter the KHAMBU client (tenant ...beef) first, then open /assistant.
3. Instrument the run:
   - Track the voice state from the caption text and the orb mode, with timestamps.
   - Log network calls to bani-stt, chat-assistant and bani-tts with status codes and durations.
   - Capture console errors and warnings.
   - Take one screenshot per state.
   - Record whether the silence detector ends the turn, or whether the 8 s idle or 30 s max limit ends it instead.
4. Run at desktop size and at phone size (390x844).

## Step 2 - Suspected phone failure points (from code review)
All references are to `src/hooks/useVoiceConversation.ts`.

1. **Loop can silently freeze (line 403, high).** `tick` exits when `stateRef.current !== "listening"`. But `stateRef` only updates on re-render (line 59), and the first frame is scheduled right after `setState("listening")` (lines 390, 442). If that frame runs before React commits, the check fails once and is never retried. Silence, idle and max-turn detection all stop, and the mic keeps recording forever. To the user it looks like "listening, but nothing happens".
2. **The mic is re-requested outside the tap on every turn (lines 343-348, high on iOS).** `startListening` calls `stopMic()`, which stops the stream tracks. It then calls `getUserMedia` again after Bani speaks. Only the first call is inside the tap. Later calls on iOS Safari and in webviews can re-prompt, fail or return a muted track. A failure ends voice mode with the permission toast.
3. **Calibration is too fragile (lines 407-411, medium).** The threshold is 2.5x the level of the first 300 ms. If the user starts talking straight away, or the phone's noise suppression and auto-gain change levels, speech is either never detected (the 8 s "Tap the orb" hint appears) or detected from noise (the turn ends after 1.2 s of quiet).
4. **The 8 s idle limit counts from mic open (line 418, low-medium).** The permission prompt and any hesitation eat into it.
5. **Bani's playback goes to the earpiece and the mic stays live (medium on iOS).** The mic tracks stay open while Bani speaks; they are only stopped at the next `startListening`. iOS stays in call audio mode, so the reply plays quietly through the earpiece. The level meter isn't used while speaking, so there is no self-pickup loop, but the volume sounds broken.
6. **Playback at 24 kHz (lines 186, 452, medium).** `new AudioContext({sampleRate:24000})` throws or resamples on some iOS versions. If it throws inside `start()` the error is swallowed. A later throw inside `speak` falls back to browser speech, which iOS often blocks outside a gesture. Then only the caption shows.
7. **Recording format (lines 372-377, low).** iOS gives audio/mp4. `bani-stt` maps MIME type to extension, so this is fine if mp4 maps to `.mp4`/`.m4a`. I'll check this in the test logs.
8. **Small recordings restart without a message (line 385).** Under 800 bytes it restarts with no feedback. The same happens for an empty transcript (line 291).
9. **Browser-speech fallback uses a stale language (line 249).** Cosmetic.

## Step 3 - Lovable mobile app preview
The preview runs in an embedded view (iframe/webview). Microphone access there needs the app's own permission plus `allow="microphone"` on the frame. That is very likely blocked or unreliable. I'll check what I can, but I can't test inside the Lovable app. Recommendation: test on the published URL in Safari or Chrome directly.

## Proposed minimal fixes (not applied)
- In `tick`, check the local `gen` only, or set `stateRef.current = "listening"` right away before the first frame.
- Keep one mic stream for the whole session. Pause or stop only the recorder between turns, and release the stream in `end()` only.
- Recalibrate the noise floor continuously from the quiet frames. Start the 8 s idle timer after the mic is actually live.
- Create the playback AudioContext without a fixed sample rate (the 24 kHz buffers resample automatically).
- Show a caption when a recording or transcript is empty.

## Deliverable
A report covering what happened in the headless loop (states, timings, status codes, screenshots), which suspected points it confirmed, and the fix list above, ranked. No code changes.
