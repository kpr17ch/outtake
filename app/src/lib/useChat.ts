"use client";

import { useState, useRef, useCallback } from "react";
import type { ChatMessage, ToolCall } from "./types";

export interface EditorContext {
  activeVideo?: string;
  activeVideoPath?: string;
  selection?: { inSeconds: number; outSeconds: number };
  duration?: number;
  fps?: number;
  referencedFiles?: string[];
}

interface UseChatOptions {
  activeSessionId: string | null;
  onClaudeSessionId?: (claudeSessionId: string) => void;
  editorContext?: EditorContext;
}

export function useChat({ activeSessionId, onClaudeSessionId, editorContext }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback(
    (msg: Record<string, unknown>, assistantId: string) => {
      // Capture Claude session ID and save it back to the session
      if (msg.type === "system" && msg.subtype === "init") {
        const claudeSessionId = msg.session_id as string;
        if (claudeSessionId && activeSessionId) {
          onClaudeSessionId?.(claudeSessionId);
        }
        return;
      }

      // Assistant message — extract tool calls only (text comes from result)
      if (msg.type === "assistant") {
        const apiMsg = msg.message as Record<string, unknown>;
        const content = apiMsg?.content as Array<Record<string, unknown>>;
        if (!content) return;

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const toolCalls = [...(m.toolCalls || [])];

            for (const block of content) {
              if (block.type === "tool_use") {
                const existing = toolCalls.findIndex((t) => t.id === block.id);
                const tc: ToolCall = {
                  id: block.id as string,
                  name: block.name as string,
                  input: JSON.stringify(block.input, null, 2),
                  state: "running",
                };
                if (existing >= 0) toolCalls[existing] = tc;
                else toolCalls.push(tc);
              }
            }

            return { ...m, toolCalls };
          })
        );
        return;
      }

      // Tool result — mark tool as done
      if (msg.type === "user" && msg.tool_use_result !== undefined) {
        const result = msg.tool_use_result;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const toolCalls = (m.toolCalls || []).map((t) =>
              t.state === "running"
                ? {
                    ...t,
                    result:
                      typeof result === "string"
                        ? result
                        : JSON.stringify(result, null, 2),
                    state: "done" as const,
                  }
                : t
            );
            return { ...m, toolCalls };
          })
        );
        return;
      }

      // Final result — set content all at once, stop thinking
      if (msg.type === "result") {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const toolCalls = (m.toolCalls || []).map((t) =>
              t.state === "running" ? { ...t, state: "done" as const } : t
            );
            return {
              ...m,
              content: (msg.result as string) || m.content || "",
              toolCalls,
              isThinking: false,
            };
          })
        );
      }
    },
    [activeSessionId, onClaudeSessionId]
  );

  const send = useCallback(
    async (input: string) => {
      if (!input.trim() || isStreaming) return;

      const ts = new Date().toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input.trim(),
        timestamp: ts,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        timestamp: ts,
        isThinking: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input.trim(),
            sessionId: activeSessionId,
            editorContext,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const msg = JSON.parse(jsonStr);
              handleEvent(msg, assistantId);
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
                  isThinking: false,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isThinking: false } : m
          )
        );
      }
    },
    [activeSessionId, handleEvent, isStreaming]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, send, stop, reset };
}
