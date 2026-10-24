"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { loadPipelineStages } from "@/lib/user-settings";
import type { PipelineStage } from "@/lib/user-settings";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/constants";

const LOCAL_STORAGE_KEY = "closr-pipeline-stages";

// ─── Hook ───────────────────────────────────────────────────────────

export function usePipelineStages() {
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_PIPELINE_STAGES);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try Supabase first
      try {
        const remote = await loadPipelineStages();
        if (!cancelled && remote) {
          setStages(remote);
          return;
        }
      } catch {
        // fall through to localStorage
      }

      // Fallback: localStorage (for logged-out users)
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PipelineStage[];
          if (!cancelled && Array.isArray(parsed) && parsed.length > 0) {
            setStages(parsed);
          }
        }
      } catch {
        // ignore
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const getStageLabel = useCallback(
    (key: string): string => {
      const stage = stages.find((s) => s.key === key);
      return stage?.label ?? key;
    },
    [stages],
  );

  const getStageColor = useCallback(
    (key: string): string => {
      const stage = stages.find((s) => s.key === key);
      return stage?.color ?? "#94a3b8";
    },
    [stages],
  );

  const getStageProbability = useCallback(
    (key: string): number => {
      const stage = stages.find((s) => s.key === key);
      return stage?.probability ?? 0;
    },
    [stages],
  );

  return useMemo(
    () => ({ stages, getStageLabel, getStageColor, getStageProbability }),
    [stages, getStageLabel, getStageColor, getStageProbability],
  );
}
