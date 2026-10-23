import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api as rest, ApiError } from "@/lib/api/client";
import { api } from "../../convex/_generated/api";

export type AssistantError = { code: string; message: string };

type ThreadsResponse = { items: { id: string; title: string; createdAt: number }[] };

/**
 * Kisan Dost conversation: finds (or creates) the user's thread over REST,
 * sends through REST, and watches the thread live with a Convex query
 * (`assistant.listThreadMessages`, streamed word by word).
 *
 * `fresh` starts a new conversation instead of resuming the latest one.
 */
export function useAssistant({ fresh = false }: { fresh?: boolean } = {}) {
  const { isAuthenticated } = useConvexAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<AssistantError | null>(null);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(true);
  const startedFresh = useRef(fresh);

  const fail = (e: unknown) =>
    setError(
      e instanceof ApiError
        ? { code: e.code, message: e.message }
        : { code: "UNKNOWN", message: "Something went wrong. Try again." },
    );

  const createThread = useCallback(async () => {
    const { threadId: id } = await rest.post<{ threadId: string }>("/assistant/threads", {});
    return id;
  }, []);

  /** Latest thread id (or a new one); sets no state, so effects may call it. */
  const findThread = useCallback(async () => {
    if (!startedFresh.current) {
      const threads = await rest.get<ThreadsResponse>("/assistant/threads");
      if (threads.items[0]) return threads.items[0].id;
    }
    return await createThread();
  }, [createThread]);

  const settle = useCallback((p: Promise<string>) => {
    let alive = true;
    p.then(
      (id) => alive && setThreadId(id),
      (e: unknown) => alive && fail(e),
    ).finally(() => alive && setStarting(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => settle(findThread()), [settle, findThread]);

  const start = useCallback(() => {
    setStarting(true);
    setError(null);
    settle(findThread());
  }, [settle, findThread]);

  const messages = useUIMessages(
    api.assistant.listThreadMessages,
    threadId && isAuthenticated ? { threadId } : "skip",
    { initialNumItems: 40, stream: true },
  );

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || !threadId) return false;
      setSending(true);
      setError(null);
      try {
        await rest.post("/assistant/messages", { threadId, text: body });
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setSending(false);
      }
    },
    [threadId],
  );

  /** Confirm / Cancel on a write-tool card. */
  const respond = useCallback(
    async (approvalId: string, approved: boolean) => {
      if (!threadId) return false;
      setError(null);
      try {
        await rest.post("/assistant/confirm", { threadId, approvalId, approved });
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [threadId],
  );

  const newChat = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      setThreadId(await createThread());
    } catch (e) {
      fail(e);
    } finally {
      setStarting(false);
    }
  }, [createThread]);

  const results = messages.results;
  const last = results.at(-1);
  // Waiting for a reply: the last message is ours, or the reply is still streaming.
  const thinking =
    sending ||
    (!!last &&
      (last.role === "user"
        ? last.status !== "failed"
        : last.status === "pending" || last.status === "streaming"));

  return {
    threadId,
    messages: results,
    loading: starting || (!!threadId && messages.status === "LoadingFirstPage"),
    canLoadMore: messages.status === "CanLoadMore",
    loadMore: () => messages.loadMore(20),
    thinking,
    sending,
    error,
    clearError: () => setError(null),
    setVoiceError: (message: string) => setError({ code: "VOICE", message }),
    retryStart: start,
    send,
    respond,
    newChat,
  };
}
