# Groq AI, Whisper speech-to-text, and text-to-speech

Groq runs open models on custom chips, so replies come back much faster than on most providers (tens to hundreds of ms). This app uses it for **chat** (`api.ai.chat`, `provider: "groq"`) and **speech-to-text** with Whisper (`api.ai.transcribe`). Speaking text aloud uses **`expo-speech`** on the device.

## How a request flows
```
Chat:   screen ─useAction(api.ai.chat)─▶ Convex action (convex/ai.ts) ─AI SDK @ai-sdk/groq─▶ api.groq.com ─▶ text
Voice:  🎤 expo-audio records .m4a (phone) / .webm (web) ─▶ useVoiceInput().stop()
        ─▶ api.ai.transcribe({audio bytes, mimeType}) ─▶ POST api.groq.com/openai/v1/audio/transcriptions ─▶ text
Speak:  Speech.speak(text) (expo-speech, on-device, offline, free)
```
The Groq key lives **only** in Convex. Both actions require a signed-in user.

## Configure
```bash
npx convex env set GROQ_API_KEY gsk_...
npx convex env set GROQ_MODEL openai/gpt-oss-120b                # optional chat model
npx convex env set GROQ_WHISPER_MODEL whisper-large-v3-turbo     # optional STT model
npx convex env list
```
Changes apply to the next call; no redeploy needed. To see the models your key can use: `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`.

## Models tested with this key (2026-10-21)
| Model | Type | Result | Use for |
|---|---|---|---|
| `openai/gpt-oss-120b` (**default**) | Chat | ✅ ~0.8 s | Best quality on Groq: reasoning, JSON, tools |
| `openai/gpt-oss-20b` | Chat | ✅ ~0.35 s | Faster and cheaper; simple tasks |
| `qwen/qwen3.8-27b` | Chat | ✅ ~0.1 s | Extremely fast replies, multilingual |
| `allam-2-7b` | Chat | ✅ ~0.1 s | Arabic-focused small model |
| `whisper-large-v3-turbo` (**default**) | Speech→text | ✅ ~0.5 s | Fast transcription, good accuracy |
| `whisper-large-v3` | Speech→text | ✅ ~0.25 s | Most accurate; better for accents/noise |
| `canopylabs/orpheus-v1-english`, `…orpheus-arabic-saudi` | Text→speech | ⚠️ needs terms | Cloud voices. An org admin must accept the terms at console.groq.com/playground first |
| `meta-llama/llama-prompt-guard-2-*`, `openai/gpt-oss-safeguard-20b` | Safety | — | Classify prompts as unsafe/injection |

`llama-3.3-70b-versatile` no longer exists for this key; don't use it. Times are for one-word replies and a 4-second clip.

## Use: chat
```tsx
const chat = useAction(api.ai.chat);
const { isAuthenticated } = useConvexAuth(); // call only when true
const reply = await chat({
  provider: "groq",
  system: "Answer in 2 sentences.",
  messages: [{ role: "user", content: "What is Expo?" }], // send full history for multi-turn
});
```
Structured JSON, per-action models and saving results work the same as for Bedrock (see `docs/ai-bedrock.md`); swap in `createGroq({ apiKey: env.GROQ_API_KEY })("<model>")`.

## Use: speech-to-text (Whisper)
```tsx
import { useVoiceInput } from "@/hooks/use-voice-input";

const voice = useVoiceInput(); // { start, stop, isRecording, isTranscribing, durationMillis }
const onMicPress = async () => {
  if (!voice.isRecording) return voice.start();   // asks mic permission the first time
  const text = await voice.stop("en");            // optional ISO language hint, e.g. "ur", "ar"
  setInput(text);
};
```
- Recording uses `RecordingPresets.HIGH_QUALITY` (AAC `.m4a` on iOS/Android, `.webm` on web). The hook reads the file (`expo-file-system` `File.arrayBuffer()` on native, `fetch(blobUrl)` on web) and sends the bytes to Convex.
- `api.ai.transcribe` args: `{ audio: ArrayBuffer, mimeType: string, language?: string }`. Max 15 MB (~10 min). Returns the trimmed text.
- Supported formats: m4a/mp4, webm, ogg, mp3, wav, flac. The action maps MIME type → file extension so Groq decodes it correctly.
- The assistant discards mic holds shorter than 600 ms before uploading. Wait for the recording indicator, speak while holding, then release. Releasing during microphone setup discards that attempt too.
- Rejected language hints retry once with automatic detection using the same audio. The server returns structured errors for unreadable audio, provider configuration, rate limits and service outages; the hook displays their messages without the Convex stack trace.
- Recording setup, stopping and transcription are serialized. Temporary recordings are removed after each attempt. If sending a recognized question fails, its transcript stays in the composer for editing/retry.
- Microphone permission text is set in `app.json` (`expo-audio` plugin). It needs a dev build, not Expo Go.
- Server-side (no app needed): call `api.ai.transcribe` from another action with audio bytes, e.g. from a file in Convex storage.

## Use: text-to-speech
**On-device (already installed, free, offline):**
```tsx
import * as Speech from "expo-speech";
Speech.speak(reply, { language: "en-US", rate: 1.0, pitch: 1.0, onDone: () => setSpeaking(false) });
await Speech.stop();                              // also pause(), resume(), isSpeakingAsync()
const voices = await Speech.getAvailableVoicesAsync(); // pass { voice: voices[i].identifier }
```
Voice quality depends on the phone; on Android the user may need TTS voices installed.

**Cloud voice (Groq Orpheus, optional):** accept the model terms in the Groq console, then add an action that POSTs `{ model: "canopylabs/orpheus-v1-english", input, voice, response_format: "wav" }` to `https://api.groq.com/openai/v1/audio/speech`. Return the audio bytes (or save them to Convex storage and return a URL), then play it with `expo-audio` `useAudioPlayer(url)`. An invalid voice returns the list of valid voices in the error message.

## Voice assistant recipe
🎤 `voice.stop()` → text → `chat({ provider: "groq", messages })` → `Speech.speak(reply)`. With Groq this round trip is usually around 1–2 s.

## Test & troubleshoot
```bash
npx convex run ai:chat '{"provider":"groq","messages":[{"role":"user","content":"hi"}]}' \
  --identity '{"subject":"<authUserId>","issuer":"https://<dep>.convex.site","sessionId":"<sessionId>"}'
npx convex logs   # A(ai:chat) / A(ai:transcribe); failed transcriptions log the Groq HTTP status
```
| Error | Fix |
|---|---|
| `Sign in to use AI.` / `…voice input.` | Wait for `useConvexAuth().isAuthenticated` before calling |
| `Set GROQ_API_KEY in Convex.` | `npx convex env set GROQ_API_KEY …` on this deployment |
| `model … does not exist or you do not have access` | Pick a model from the table or the `/models` list |
| `That recording couldn't be read` | Hold until the recording indicator appears, speak, then release. Check `npx convex logs` for the provider HTTP status/code and recording format/size |
| `Voice transcription isn't configured` / `model is unavailable` | Check `GROQ_API_KEY` / `GROQ_WHISPER_MODEL` in the configured Convex deployment |
| `Microphone permission was denied.` | Enable it in phone Settings → app → Permissions |
| `model_terms_required` (Orpheus) | Accept the terms in the Groq console playground |
| HTTP 429 | Free-tier rate limit; wait, or use a smaller model |

**Security:** rotate the Groq key after the hackathon (console.groq.com → API Keys). Never put it in `app.json` or app code.
