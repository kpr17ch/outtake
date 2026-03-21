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

// --- Tool Call (compact, smart formatting) ---

const TOOL_ICONS: Record<string, string> = {
  "mcp__ffmpeg__probe_media": "🔍",
  "mcp__ffmpeg__cut_clip": "✂️",
  "mcp__ffmpeg__concat_clips": "🔗",
  "mcp__ffmpeg__transcode": "🔄",
  "mcp__ffmpeg__scan_scenes": "📊",
  "mcp__ffmpeg__check_frame": "🖼",
  "mcp__ffmpeg__extract_audio": "🎵",
  "mcp__ffmpeg__add_subtitles": "📝",
  "mcp__ffmpeg__extract_thumbnail": "📸",
  "mcp__ffmpeg__cleanup_frames": "🗑",
  Bash: "⌘",
  Read: "📄",
  Write: "✏️",
  Edit: "✏️",
  Glob: "🔎",
  Grep: "🔎",
};

function formatToolSummary(tool: ToolCall): string {
  const name = tool.name;
  try {
    const input = JSON.parse(tool.input || "{}");

    if (name === "mcp__ffmpeg__cut_clip") {
      const file = (input.input_file || "").split("/").pop();
      return `Cut ${file} [${input.start}s → ${input.end}s]`;
    }
    if (name === "mcp__ffmpeg__concat_clips") {
      const count = (input.input_files || []).length;
      return `Concat ${count} clips`;
    }
    if (name === "mcp__ffmpeg__probe_media") {
      return `Probe ${(input.input_file || "").split("/").pop()}`;
    }
    if (name === "mcp__ffmpeg__scan_scenes") {
      return `Scan scenes (threshold: ${input.threshold || 0.3})`;
    }
    if (name === "mcp__ffmpeg__check_frame") {
      return `Check frame at ${input.time}s`;
    }
    if (name === "mcp__ffmpeg__transcode") {
      return `Transcode → ${input.preset}`;
    }
    if (name === "Bash") {
      const cmd = (input.command || "").slice(0, 60);
      return cmd + (input.command?.length > 60 ? "…" : "");
    }
    if (name === "Read" || name === "Glob" || name === "Grep") {
      const path = (input.file_path || input.path || input.pattern || "").split("/").pop();
      return path || name;
    }
  } catch { /* ignore */ }

  return name.replace("mcp__ffmpeg__", "");
}

function ToolCallLine({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const icon = TOOL_ICONS[tool.name] || "⚙";
  const summary = formatToolSummary(tool);
  const isDone = tool.state === "done";
  const isRunning = tool.state === "running";

  return (
    <div className="mb-px">
      <button
        className="flex items-center gap-1.5 text-[12px] cursor-pointer py-0.5 w-full text-left"
        style={{ color: "var(--text-tertiary)" }}
        onClick={() => setOpen(!open)}
      >
        <span className="shrink-0 w-4 text-center">{icon}</span>
        <span className="truncate flex-1" style={{ color: isDone ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
          {summary}
        </span>
        {isRunning && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)", animation: "pulse-dot 1.5s ease-in-out infinite" }} />
        )}
        {isDone && (
          <span className="text-[10px] shrink-0" style={{ color: "var(--success)" }}>✓</span>
        )}
      </button>
      {open && (tool.input || tool.result) && (
        <div className="ml-5 mt-0.5 mb-1.5 text-[11px] font-mono max-h-24 overflow-y-auto rounded px-2 py-1" style={{ background: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
          {tool.input && <pre className="whitespace-pre-wrap">{tool.input}</pre>}
          {tool.result && <pre className="whitespace-pre-wrap mt-1" style={{ color: "var(--text-secondary)" }}>{tool.result.slice(0, 500)}{tool.result.length > 500 ? "…" : ""}</pre>}
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

      {/* Tool calls — compact */}
      {hasTools && (
        <div className="mb-2 py-1 px-2 rounded" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
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

interface MentionableFile {
  name: string;
  path: string;
}

interface ChatPanelProps {
  activeSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (input: string, referencedFiles?: string[]) => void;
  onStop: () => void;
  selection?: { inSeconds: number; outSeconds: number } | null;
  mediaFiles?: MentionableFile[];
}

export default function ChatPanel({
  activeSessionId,
  messages,
  isStreaming,
  onSend,
  onStop,
  selection,
  mediaFiles = [],
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input, referencedFiles.length > 0 ? referencedFiles : undefined);
    setInput("");
    setReferencedFiles([]);
  }, [input, isStreaming, onSend, referencedFiles]);

  // @ mention filtering
  const filteredFiles = mediaFiles.filter((f) =>
    f.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@([^\s]*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  }, []);

  const insertMention = useCallback((file: MentionableFile) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const atStart = textBefore.lastIndexOf("@");
    const newText = textBefore.slice(0, atStart) + `@${file.name} ` + textAfter;
    setInput(newText);
    setShowMentions(false);
    if (!referencedFiles.includes(file.path)) {
      setReferencedFiles((prev) => [...prev, file.path]);
    }
    inputRef.current?.focus();
  }, [input, referencedFiles]);

  const removeMention = useCallback((path: string) => {
    setReferencedFiles((prev) => prev.filter((p) => p !== path));
  }, []);

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
      if (!activeSessionId) return;

      const formData = new FormData();
      const names: string[] = [];
      for (const file of Array.from(droppedFiles)) {
        formData.append("files", file);
        names.push(file.name);
      }
      formData.append("sessionId", activeSessionId);

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
    [activeSessionId, isStreaming, onSend]
  );

  return (
    <div
      className="flex flex-col h-full flex-1 min-w-0 relative"
      style={{ background: "var(--bg-base)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(10,10,10,0.85)", border: "2px dashed var(--accent)", borderRadius: 8, margin: 4 }}>
          <p className="text-xs" style={{ color: "var(--accent)" }}>Drop to upload</p>
        </div>
      )}
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-3 pb-2">
        <div className="max-w-none">
          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 py-2 shrink-0">
        {/* Selection badge */}
        {selection && (
          <div
            className="flex items-center gap-2 mb-1.5 px-2 py-1 rounded text-[10px] font-mono"
            style={{ background: "var(--accent-surface)", color: "var(--accent)" }}
          >
            <span>▸ {selection.inSeconds.toFixed(1)}s → {selection.outSeconds.toFixed(1)}s</span>
            <span style={{ color: "var(--text-tertiary)" }}>({(selection.outSeconds - selection.inSeconds).toFixed(1)}s)</span>
          </div>
        )}
        {/* Referenced files tags */}
        {referencedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {referencedFiles.map((path) => {
              const name = path.split("/").pop() || path;
              return (
                <span key={path} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: "var(--accent-surface)", color: "var(--accent)" }}>
                  @{name}
                  <button onClick={() => removeMention(path)} className="cursor-pointer opacity-60 hover:opacity-100">✕</button>
                </span>
              );
            })}
          </div>
        )}
        <div
          className="relative flex items-end rounded-lg px-3"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        >
          {/* @ Mention dropdown */}
          {showMentions && filteredFiles.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden shadow-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", maxHeight: 200 }}>
              {filteredFiles.map((file, i) => (
                <button
                  key={file.path}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer"
                  style={{
                    background: i === mentionIndex ? "var(--bg-overlay)" : "transparent",
                    color: "var(--text-primary)",
                  }}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(file); }}
                >
                  <span style={{ color: "var(--accent)" }}>@</span>
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto text-[10px]" style={{ color: "var(--text-tertiary)" }}>{file.path.startsWith("output") ? "result" : "source"}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (showMentions && filteredFiles.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filteredFiles.length - 1)); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredFiles[mentionIndex]); return; }
                if (e.key === "Escape") { setShowMentions(false); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={messages.length === 0 ? "Ask the agent to edit, cut, analyze... (@ to reference files)" : "Follow up... (@ to reference files)"}
            className="flex-1 bg-transparent py-2.5 text-sm resize-none outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: "var(--text-primary)", minHeight: 36, maxHeight: 120 }}
            rows={1}
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="p-2 cursor-pointer rounded transition-colors shrink-0"
              style={{ color: "var(--text-tertiary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              className="p-2 cursor-pointer rounded transition-colors shrink-0"
              style={{ color: input.trim() ? "var(--text-secondary)" : "var(--text-tertiary)" }}
              onMouseEnter={(e) => { if (input.trim()) e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = input.trim() ? "var(--text-secondary)" : "var(--text-tertiary)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
