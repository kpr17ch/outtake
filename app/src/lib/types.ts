export type MessageRole = "user" | "assistant";

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  result?: string;
  state: "running" | "done" | "error";
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  timestamp: string;
  isThinking?: boolean;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agentSessionId?: string;
  workspacePath: string;
}
