const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

export class TranscriptionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Pure provider boundary, also used by the multipart/retry regression tests. */
export async function transcribeAudio({
  audio,
  mimeType: inputMimeType,
  language,
  apiKey,
  model = "whisper-large-v3-turbo",
}: {
  audio: ArrayBuffer;
  mimeType: string;
  language?: string;
  apiKey: string;
  model?: string;
}): Promise<string> {
  if (!audio.byteLength)
    throw new TranscriptionError("EMPTY_RECORDING", "Nothing was recorded. Hold the mic while you speak.");
  if (audio.byteLength > 15 * 1024 * 1024)
    throw new TranscriptionError("RECORDING_TOO_LARGE", "Keep recordings under 15 MB.");
  const mimeType = inputMimeType.split(";")[0].trim().toLowerCase();
  const extension = AUDIO_EXTENSIONS[mimeType];
  if (!extension)
    throw new TranscriptionError("AUDIO_FORMAT", "This recording format isn't supported. Try recording again.");

  // Accept locale hints as well as ISO-639-1 codes (e.g. ur-PK -> ur).
  const hint = language?.trim().toLowerCase().split(/[-_]/)[0];
  const send = async (languageHint?: string) => {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mimeType }), `recording.${extension}`);
    form.append("model", model);
    form.append("response_format", "json");
    if (languageHint) form.append("language", languageHint);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      return { response, body: await response.text() };
    } catch {
      throw new TranscriptionError("TRANSCRIPTION_UNAVAILABLE", "Voice transcription couldn't connect. Please try again.");
    }
  };

  let { response, body } = await send(hint);
  // Retry the same bytes with automatic detection only for rejected language
  // hints. Retrying corrupt audio or a bad model would just repeat the failure.
  if (response.status === 400 && hint && /language/i.test(body)) {
    ({ response, body } = await send());
  }
  if (!response.ok) {
    // Log the provider's error, never the uploaded audio or successful text.
    let providerCode: string | undefined;
    let providerMessage: string | undefined;
    try {
      const data = JSON.parse(body);
      if (typeof data?.error?.code === "string") providerCode = data.error.code;
      if (typeof data?.error?.message === "string") providerMessage = data.error.message.slice(0, 300);
    } catch {}
    console.error("Groq transcription failed", {
      status: response.status, mimeType, bytes: audio.byteLength, providerCode, providerMessage,
    });
    if (response.status === 429)
      throw new TranscriptionError("RATE_LIMITED", "Voice transcription is busy. Please try again in a little while.");
    if (response.status === 401 || response.status === 403)
      throw new TranscriptionError("TRANSCRIPTION_CONFIG", "Voice transcription isn't configured correctly. Please contact support.");
    if (response.status === 404 || /model/i.test(providerCode ?? "") || /model.*(not found|not exist|access|decommissioned)/i.test(body))
      throw new TranscriptionError("TRANSCRIPTION_CONFIG", "The voice transcription model is unavailable. Please contact support.");
    if (response.status === 400 || response.status === 413 || response.status === 422)
      throw new TranscriptionError("INVALID_RECORDING", "That recording couldn't be read. Hold the mic while speaking, then try again.");
    throw new TranscriptionError("TRANSCRIPTION_UNAVAILABLE", "Voice transcription is temporarily unavailable. Please try again.");
  }
  try {
    const result: unknown = JSON.parse(body);
    if (result && typeof result === "object" && "text" in result && typeof result.text === "string")
      return result.text.trim();
  } catch {}
  throw new TranscriptionError("TRANSCRIPTION_RESPONSE", "Voice transcription returned an invalid response. Please try again.");
}
