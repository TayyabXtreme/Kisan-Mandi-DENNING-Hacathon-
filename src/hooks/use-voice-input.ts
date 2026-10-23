import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { api } from "../../convex/_generated/api";

async function readRecording(uri: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return { audio: await blob.arrayBuffer(), mimeType: blob.type || "audio/webm" };
  }
  // HIGH_QUALITY records AAC in an .m4a container on iOS and Android.
  return { audio: await new File(uri).arrayBuffer(), mimeType: "audio/mp4" };
}

type Phase = "idle" | "starting" | "recording" | "stopping" | "transcribing";

/**
 * Record speech and turn it into text with Groq Whisper.
 *
 * const voice = useVoiceInput();
 * voice.isRecording ? setText(await voice.stop()) : await voice.start();
 */
export function useVoiceInput() {
  const transcribe = useAction(api.ai.transcribe);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { durationMillis } = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>("idle");
  const current = useRef<Phase>("idle");
  const mounted = useRef(true);
  const changePhase = (next: Phase) => {
    current.current = next;
    if (mounted.current) setPhase(next);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // useAudioRecorder releases the recorder on unmount.
      if (current.current !== "idle")
        void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, []);

  const start = async () => {
    if (current.current !== "idle") throw new Error("Voice input is already in progress.");
    changePhase("starting");
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) throw new Error("Microphone permission was denied.");
      if (!mounted.current) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!mounted.current) {
        await setAudioModeAsync({ allowsRecording: false });
        return;
      }
      await recorder.prepareToRecordAsync();
      if (!mounted.current) return;
      recorder.record();
      changePhase("recording");
    } catch (error) {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      changePhase("idle");
      throw error;
    }
  };

  const finish = async (language?: string, discard = false): Promise<string> => {
    if (current.current !== "recording") return "";
    // Lock synchronously: React state and the recorder's polled status lag taps.
    changePhase("stopping");
    let uri: string | null = null;
    try {
      await recorder.stop(); // finalizes the m4a container / web Blob
      uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false });
      if (discard || !mounted.current) return "";
      if (!uri) throw new Error("Nothing was recorded. Hold the mic while you speak.");
      changePhase("transcribing");
      const { audio, mimeType } = await readRecording(uri);
      if (!audio.byteLength) throw new Error("Nothing was recorded. Hold the mic while you speak.");
      if (audio.byteLength > 15 * 1024 * 1024) throw new Error("Keep recordings under 15 MB.");
      const text = await transcribe({ audio, mimeType, language });
      return mounted.current ? text : "";
    } catch (error) {
      if (error instanceof ConvexError && error.data && typeof error.data === "object" && "message" in error.data && typeof error.data.message === "string")
        throw new Error(error.data.message);
      throw error;
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      if (uri) {
        // Each attempt owns a temporary recording; never accumulate audio files.
        try {
          if (Platform.OS === "web") URL.revokeObjectURL(uri);
          else new File(uri).delete();
        } catch {}
      }
      changePhase("idle");
    }
  };

  return {
    start,
    stop: (language?: string) => finish(language),
    cancel: () => finish(undefined, true),
    isRecording: phase === "recording",
    isStarting: phase === "starting",
    isTranscribing: phase === "stopping" || phase === "transcribing",
    isBusy: phase !== "idle",
    durationMillis,
  };
}
