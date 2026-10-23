import { Platform } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import { File } from "expo-file-system";
import { api as rest, ApiError } from "@/lib/api/client";
import type { SendMessageBody } from "@/lib/api/types";
import { api } from "../../../../convex/_generated/api";

/**
 * Chat reads use reactive Convex queries (documented exception to REST-only,
 * docs/plan.md §7); they wait until the Convex socket is logged in.
 */
export function useChatReady() {
  return useConvexAuth().isAuthenticated;
}

/** Unread messages across all my chats, for the Chats tab badge. */
export function useUnreadChats() {
  const ready = useChatReady();
  return useQuery(api.conversations.unreadTotal, ready ? {} : "skip") ?? 0;
}

export const sendMessage = (conversationId: string, body: SendMessageBody) =>
  rest.post<{ id: string }>(`/conversations/${conversationId}/messages`, body);

export const markChatRead = (conversationId: string) =>
  rest.post<{ ok: true }>(`/conversations/${conversationId}/read`, {});

/** Find or create my chat about a listing; returns its id. */
export async function openChatFor(listingId: string) {
  const res = await rest.post<{ id: string; created: boolean }>("/conversations", { listingId });
  return res.id;
}

async function readFile(uri: string, fallbackType: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return { data: blob as Blob | ArrayBuffer, type: blob.type || fallbackType };
  }
  return { data: await new File(uri).arrayBuffer(), type: fallbackType };
}

/** Uploads a local photo / recording to Convex storage; returns the storageId. */
export async function uploadChatFile(uri: string, mimeType: string) {
  const { uploadUrl } = await rest.post<{ uploadUrl: string }>("/chat/upload-url", {});
  const file = await readFile(uri, mimeType);
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file.data,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't upload. Check your internet and try again.");
  }
  const json = (await response.json().catch(() => null)) as { storageId?: string } | null;
  if (!response.ok || !json?.storageId)
    throw new ApiError(response.status, "UPLOAD_FAILED", "The upload failed. Please try again.");
  return json.storageId;
}

export const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong. Please try again.";
