import { randomUUID } from "crypto";

/**
 * Normalizes agent CLI stream-json tool lifecycle events into the message
 * shapes used by the UI.
 */
function mapToolKeyToName(toolKey: string): string {
  switch (toolKey) {
    case "readToolCall":
      return "Read";
    case "writeToolCall":
      return "Write";
    case "editToolCall":
      return "Edit";
    case "globToolCall":
      return "Glob";
    case "grepToolCall":
      return "Grep";
    case "shellToolCall":
    case "runTerminalCmdToolCall":
      return "Bash";
    default:
      return toolKey.replace(/ToolCall$/, "") || "tool";
  }
}

function parseToolCallShape(toolCall: unknown): {
  name: string;
  input: Record<string, unknown>;
} {
  if (!toolCall || typeof toolCall !== "object") {
    return { name: "unknown", input: {} };
  }
  const o = toolCall as Record<string, unknown>;

  if ("function" in o && o.function && typeof o.function === "object") {
    const fn = o.function as { name?: string; arguments?: string };
    let input: Record<string, unknown> = {};
    if (fn.arguments) {
      try {
        input = JSON.parse(fn.arguments) as Record<string, unknown>;
      } catch {
        input = { _raw: fn.arguments };
      }
    }
    return { name: fn.name || "function", input };
  }

  for (const [key, val] of Object.entries(o)) {
    if (!key.endsWith("ToolCall") || !val || typeof val !== "object") continue;
    const sub = val as { args?: unknown };
    let input: Record<string, unknown> = {};
    if (sub.args && typeof sub.args === "object" && !Array.isArray(sub.args)) {
      input = { ...(sub.args as Record<string, unknown>) };
    } else if (sub.args !== undefined) {
      input = { value: sub.args as unknown };
    }
    return { name: mapToolKeyToName(key), input };
  }

  return { name: "unknown", input: { _raw: JSON.stringify(o) } };
}

function formatToolResult(toolCall: unknown): string {
  if (toolCall === undefined || toolCall === null) return "";
  if (typeof toolCall === "string") return toolCall;
  return JSON.stringify(toolCall, null, 2);
}

export function adaptAgentStreamLine(line: string): string[] {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }

  const t = ev.type;
  if (t === "tool_call") {
    const subtype = ev.subtype;
    const callId = (typeof ev.call_id === "string" && ev.call_id) || randomUUID();
    const toolCall = ev.tool_call;

    if (subtype === "started") {
      const { name, input } = parseToolCallShape(toolCall);
      return [
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "tool_use", id: callId, name, input }],
          },
        }),
      ];
    }

    if (subtype === "completed") {
      return [
        JSON.stringify({
          type: "user",
          tool_use_id: callId,
          tool_use_result: formatToolResult(toolCall),
        }),
      ];
    }

    return [];
  }

  if (t === "assistant") {
    const msg = ev.message as Record<string, unknown> | undefined;
    const content = msg?.content as Array<Record<string, unknown>> | undefined;
    const onlyText = content?.length && content.every((c) => c.type === "text");
    if (onlyText) return [];
  }

  if (t === "user") return [];
  return [line];
}
