"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  mimeType?: string;
  children?: FileEntry[];
}

export interface GroupedFiles {
  raw: FileEntry[];
  output: FileEntry[];
  workspace: FileEntry[];
  assets: FileEntry[];
  transcripts: FileEntry[];
  plans: FileEntry[];
  other: FileEntry[];
}

const KNOWN_DIRS = ["raw", "output", "workspace", "assets", "transcripts", "plans"];

function flattenFiles(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      result.push(entry);
    }
    if (entry.children) {
      result.push(...flattenFiles(entry.children));
    }
  }
  return result;
}

function groupByDir(tree: FileEntry[]): GroupedFiles {
  const groups: GroupedFiles = {
    raw: [],
    output: [],
    workspace: [],
    assets: [],
    transcripts: [],
    plans: [],
    other: [],
  };

  for (const entry of tree) {
    if (entry.type === "dir" && KNOWN_DIRS.includes(entry.name)) {
      const key = entry.name as keyof GroupedFiles;
      groups[key] = entry.children || [];
    } else {
      groups.other.push(entry);
    }
  }

  return groups;
}

export function useWorkspace(activeSessionId: string | null, pollInterval = 3000) {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const prevOutputRef = useRef<string[]>([]);

  const fetchTree = useCallback(async () => {
    if (!activeSessionId) {
      setTree([]);
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("sessionId", activeSessionId);

      const res = await fetch(`/api/workspace/tree?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setTree(data.tree || []);
    } catch {
      // silently ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    setTree([]);
    setIsLoading(true);
    prevOutputRef.current = [];
  }, [activeSessionId]);

  // Initial fetch
  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Poll for changes
  useEffect(() => {
    const interval = setInterval(fetchTree, pollInterval);
    return () => clearInterval(interval);
  }, [fetchTree, pollInterval]);

  const grouped = groupByDir(tree);
  const allFiles = flattenFiles(tree);

  // Detect new files in output/
  const outputFiles = flattenFiles(grouped.output);
  const outputPaths = outputFiles.map((f) => f.path);
  const newOutputFiles = outputPaths.filter(
    (p) => !prevOutputRef.current.includes(p)
  );

  // Update previous output ref
  useEffect(() => {
    prevOutputRef.current = outputPaths;
  }, [outputPaths]);

  return {
    tree,
    files: allFiles,
    grouped,
    isLoading,
    refresh: fetchTree,
    newOutputFiles,
  };
}
