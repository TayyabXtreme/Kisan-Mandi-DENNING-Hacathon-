import assert from "node:assert/strict";
import { test } from "node:test";
import { transcribeAudio, TranscriptionError } from "../convex/lib/transcription.ts";

const audio = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]).buffer;
const input = { audio, mimeType: "audio/mp4", apiKey: "test-only" };

test("uploads the original bytes with a matching filename and normalizes locale hints", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal(options.headers.Authorization, "Bearer test-only");
    assert.equal(options.headers["Content-Type"], undefined); // fetch supplies the multipart boundary
    const file = options.body.get("file");
    assert.equal(file.name, "recording.m4a");
    assert.equal(file.type, "audio/mp4");
    assert.deepEqual(await file.arrayBuffer(), audio);
    assert.equal(options.body.get("language"), "ur");
    assert.equal(options.body.get("model"), "whisper-large-v3-turbo");
    return Response.json({ text: "  wheat prices  " });
  });
  assert.equal(await transcribeAudio({ ...input, mimeType: " Audio/MP4; codecs=aac ", language: "ur-PK" }), "wheat prices");
});

test("retries a rejected language hint once using the same WebM audio and automatic detection", async (t) => {
  const forms = [];
  t.mock.method(globalThis, "fetch", async (_, options) => {
    forms.push(options.body);
    return forms.length === 1
      ? Response.json({ error: { message: "Unsupported language: sd" } }, { status: 400 })
      : Response.json({ text: "recognized speech" });
  });
  assert.equal(await transcribeAudio({ ...input, mimeType: "audio/webm;codecs=opus", language: "sd" }), "recognized speech");
  assert.equal(forms.length, 2);
  assert.equal(forms[0].get("language"), "sd");
  assert.equal(forms[1].get("language"), null);
  for (const form of forms) {
    assert.equal(form.get("file").name, "recording.webm");
    assert.deepEqual(await form.get("file").arrayBuffer(), audio);
  }
});

test("corrupt recordings return an actionable error without retrying unrelated HTTP 400s", async (t) => {
  t.mock.method(console, "error", () => {});
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { message: "Invalid audio file" } }, { status: 400 }));
  await assert.rejects(transcribeAudio({ ...input, language: "ur" }),
    (e) => e instanceof TranscriptionError && e.code === "INVALID_RECORDING" && /Hold the mic/.test(e.message));
  assert.equal(fetch.mock.callCount(), 1);
});

test("rate limits and service failures have different recoverable messages", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [status, code] of [[429, "RATE_LIMITED"], [401, "TRANSCRIPTION_CONFIG"], [503, "TRANSCRIPTION_UNAVAILABLE"]]) {
    t.mock.method(globalThis, "fetch", async () => new Response("provider error", { status }));
    await assert.rejects(transcribeAudio(input), (e) => e.code === code);
  }
});

test("empty, oversized, and unsupported recordings never reach the provider", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("must not be called"); });
  for (const args of [
    { ...input, audio: new ArrayBuffer(0) },
    { ...input, audio: new ArrayBuffer(15 * 1024 * 1024 + 1) },
    { ...input, mimeType: "application/octet-stream" },
  ]) await assert.rejects(transcribeAudio(args), TranscriptionError);
  assert.equal(fetch.mock.callCount(), 0);
});

test("silence stays empty and malformed successful responses do not become silence", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ text: "   " }));
  assert.equal(await transcribeAudio(input), "");
  t.mock.method(globalThis, "fetch", async () => Response.json({ unexpected: true }));
  await assert.rejects(transcribeAudio(input), (e) => e.code === "TRANSCRIPTION_RESPONSE");
});

test("network failures are recoverable without leaking provider internals", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("private provider detail"); });
  await assert.rejects(transcribeAudio(input), (e) =>
    e.code === "TRANSCRIPTION_UNAVAILABLE" && !e.message.includes("private provider detail"));
});
