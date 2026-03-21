"use client";

import { useState, useRef, useEffect, useCallback, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ToolCall } from "@/lib/types";

// --- Markdown components ---

const mdComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-base font-semibold mt-5 mb-2 first:mt-0" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-sm font-semibold mt-4 mb-2" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-sm font-semibold mt-3 mb-1.5" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="text-sm leading-relaxed mb-3 last:mb-0" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="text-sm leading-relaxed mb-3 ml-4 list-disc" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="text-sm leading-relaxed mb-3 ml-4 list-decimal" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => <li className="mb-1" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold" style={{ color: "var(--text-primary)" }} {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="underline underline-offset-2" style={{ color: "var(--accent)" }} {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="pl-3 my-3 text-sm"
      style={{ borderLeft: "2px solid var(--border-default)", color: "var(--text-secondary)" }}
      {...props}
    />
  ),
  code: ({ className, children, ...rest }: ComponentPropsWithoutRef<"code"> & { className?: string }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code
          className={`block text-xs font-mono p-3 rounded-md my-3 overflow-x-auto ${className || ""}`}
          style={{
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
          }}
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="text-xs font-mono px-1 py-0.5 rounded"
        style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...rest }: ComponentPropsWithoutRef<"pre">) => (
    <pre className="my-0" {...rest}>{children}</pre>
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="overflow-x-auto my-3">
      <table className="text-xs w-full" style={{ borderCollapse: "collapse" }} {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<"thead">) => (
    <thead style={{ borderBottom: "1px solid var(--border-default)" }} {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-secondary)" }} {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="px-3 py-2" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} {...props} />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-4" style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} {...props} />
  ),
};

// --- Tool Call (single line, like Cursor) ---

function ToolCallLine({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-0.5">
      <button
        className="flex items-center gap-1.5 text-sm cursor-pointer"
        style={{ color: "var(--text-secondary)" }}
        onClick={() => setOpen(!open)}
      >
        <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{tool.name}</span>
        {tool.state === "running" && (
          <span
            className="w-1 h-1 rounded-full flex-shrink-0"
            style={{ background: "var(--accent)", animation: "pulse-dot 1.5s ease-in-out infinite" }}
          />
        )}
      </button>
      {open && (tool.input || tool.result) && (
        <div className="ml-0 mt-1 mb-2 text-xs font-mono max-h-32 overflow-y-auto" style={{ color: "var(--text-tertiary)" }}>
          {tool.input && <pre className="whitespace-pre-wrap">{tool.input}</pre>}
          {tool.result && (
            <pre className="whitespace-pre-wrap mt-1" style={{ color: "var(--success)" }}>{tool.result}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// --- Message ---

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="animate-fade-in-up mb-5">
        <div
          className="inline-block text-sm leading-relaxed px-4 py-2.5 rounded-lg"
          style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.toolCalls && message.toolCalls.length > 0;
  const hasContent = message.content && message.content.trim();

  return (
    <div className="animate-fade-in-up mb-5">
      {/* Thinking — just text, no background, like Cursor */}
      {message.isThinking && !hasContent && !hasTools && (
        <p className="text-sm" style={{ color: "var(--text-tertiary)", animation: "pulse-soft 2s ease-in-out infinite" }}>
          Thinking...
        </p>
      )}

      {/* Tool calls — one line each */}
      {hasTools && (
        <div className="mb-2">
          {message.toolCalls!.map((tool) => (
            <ToolCallLine key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {/* Still thinking after tools */}
      {message.isThinking && hasTools && !hasContent && (
        <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)", animation: "pulse-soft 2s ease-in-out infinite" }}>
          Thinking...
        </p>
      )}

      {/* Final markdown response */}
      {hasContent && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {message.content}
        </ReactMarkdown>
      )}
    </div>
  );
}

// --- Chat Panel ---

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (input: string) => void;
  onStop: () => void;
}

export default function ChatPanel({ messages, isStreaming, onSend, onStop }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
  }, [input, isStreaming, onSend]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFiles = e.dataTransfer.files;
      if (!droppedFiles.length) return;

      const formData = new FormData();
      const names: string[] = [];
      for (const file of Array.from(droppedFiles)) {
        formData.append("files", file);
        names.push(file.name);
      }

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          const uploaded = (data.files || [])
            .filter((f: { error?: string }) => !f.error)
            .map((f: { filename: string }) => f.filename);

          if (uploaded.length > 0 && !isStreaming) {
            const fileList = uploaded.join(", ");
            const msg =
              uploaded.length === 1
                ? `I uploaded ${fileList} to the workspace`
                : `I uploaded ${uploaded.length} files to the workspace: ${fileList}`;
            onSend(msg);
          }
        }
      } catch (err) {
        console.error("[chat drop] upload error:", err);
      }
    },
    [isStreaming, onSend]
  );

  return (
    <div
      className="flex flex-col h-full flex-1 min-w-0 relative"
      style={{ background: "var(--bg-base)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: "rgba(10, 10, 10, 0.85)",
            border: "2px dashed var(--accent)",
            borderRadius: 8,
            margin: 4,
          }}
        >
          <div className="text-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              className="mx-auto mb-2"
              style={{ color: "var(--accent)" }}
            >
              <path
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Drop to upload & notify agent
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
              Files will be uploaded to workspace/raw/
            </p>
          </div>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <div className="max-w-2xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
              <div className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                Outtake
              </div>
              <p className="text-xs text-center max-w-sm" style={{ color: "var(--text-tertiary)" }}>
                AI video editing agent. Describe what you want to edit.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}
        </div>
      </div>

      <div className="px-6 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="max-w-2xl mx-auto">
          <div
            className="flex items-end rounded-lg overflow-hidden"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Describe what you want to edit..."
              className="flex-1 bg-transparent px-4 py-3 text-sm resize-none outline-none placeholder:text-[var(--text-tertiary)]"
              style={{ color: "var(--text-primary)", minHeight: 44, maxHeight: 160 }}
              rows={1}
            />
            {isStreaming ? (
              <button onClick={onStop} className="px-4 py-3 cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                className="px-4 py-3 cursor-pointer transition-colors"
                style={{ color: input.trim() ? "var(--accent)" : "var(--text-tertiary)" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
