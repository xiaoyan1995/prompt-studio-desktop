/**
 * Server-side storyboard table parser + duration-based segmenter.
 *
 * Parses the markdown table output from storyboard/generate into structured
 * shot data, then groups shots into ≤15s segments for per-segment prompt
 * generation.
 */

export interface ParsedShot {
  number: number;
  durationS: number;
  shotType: string;
  movement: string;
  visual: string;
  audio: string;
  dialogue: string;
  note: string;
  rawRow: string;
}

export interface SegmentPlan {
  index: number;
  totalSegments: number;
  shots: ParsedShot[];
  totalDurationS: number;
}

/**
 * Parse storyboard markdown table into shot array.
 * Matches the frontend parseStoryboardTable logic.
 */
export function parseStoryboardTable(markdown: string): {
  headerRow: string;
  separatorRow: string;
  shots: ParsedShot[];
} {
  const lines = markdown.split("\n");
  let headerRow = "";
  let separatorRow = "";
  const shots: ParsedShot[] = [];
  let foundSeparator = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    // Detect header row (contains 镜号/Shot/Visual etc.)
    if (
      !foundSeparator &&
      (trimmed.includes("镜号") || trimmed.includes("Shot") || trimmed.includes("Visual"))
    ) {
      headerRow = trimmed;
      continue;
    }

    // Detect separator row (contains ---)
    if (trimmed.includes("---")) {
      separatorRow = trimmed;
      foundSeparator = true;
      continue;
    }

    // Data rows (after separator)
    if (foundSeparator) {
      const rawCells = trimmed.split("|");
      if (rawCells[0]?.trim() === "") rawCells.shift();
      if (rawCells[rawCells.length - 1]?.trim() === "") rawCells.pop();
      const cells = rawCells.map((c) => c.trim());

      if (cells.length >= 7 && /\d/.test(cells[0])) {
        const num = parseInt(cells[0], 10);
        const dur = parseFloat(cells[1]) || 3;
        const has8Cols = cells.length >= 8;
        shots.push({
          number: num,
          durationS: dur,
          shotType: cells[2] || "",
          movement: cells[3] || "",
          visual: cells[4] || "",
          audio: cells[5] || "",
          dialogue: has8Cols ? (cells[6] || "") : "",
          note: has8Cols ? (cells[7] || "") : (cells[6] || ""),
          rawRow: trimmed,
        });
      }
    }
  }

  // Auto-renumber: detect if model reset numbering mid-output and fix
  if (shots.length > 1) {
    let needsRenumber = false;
    for (let i = 1; i < shots.length; i++) {
      if (shots[i].number < shots[i - 1].number) {
        needsRenumber = true;
        break;
      }
    }
    if (needsRenumber) {
      for (let i = 0; i < shots.length; i++) {
        shots[i].number = i + 1;
        // Also fix the rawRow's shot number for mini-table output
        shots[i].rawRow = shots[i].rawRow.replace(
          /^\|\s*\d+/,
          `| ${i + 1}`
        );
      }
    }
  }

  return { headerRow, separatorRow, shots };
}

/**
 * Group shots into segments with ≤maxDurationS per segment.
 * Ensures each segment has at least 1 shot.
 */
export function createSegments(
  shots: ParsedShot[],
  maxDurationS: number = 15,
): SegmentPlan[] {
  if (shots.length === 0) return [];

  const segments: SegmentPlan[] = [];
  let currentShots: ParsedShot[] = [];
  let currentDuration = 0;

  for (const shot of shots) {
    // Start new segment if adding this shot would exceed max duration
    // (but always include at least 1 shot per segment)
    if (
      currentDuration + shot.durationS > maxDurationS &&
      currentShots.length > 0
    ) {
      segments.push({
        index: segments.length + 1,
        totalSegments: 0,
        shots: currentShots,
        totalDurationS: Math.round(currentDuration * 10) / 10,
      });
      currentShots = [shot];
      currentDuration = shot.durationS;
    } else {
      currentShots.push(shot);
      currentDuration += shot.durationS;
    }
  }

  // Push final segment
  if (currentShots.length > 0) {
    segments.push({
      index: segments.length + 1,
      totalSegments: 0,
      shots: currentShots,
      totalDurationS: Math.round(currentDuration * 10) / 10,
    });
  }

  // Set totalSegments
  for (const seg of segments) {
    seg.totalSegments = segments.length;
  }

  return segments;
}

/**
 * Rebuild a mini markdown table for a subset of shots (used in per-segment prompts).
 */
export function buildMiniTable(
  headerRow: string,
  separatorRow: string,
  shots: ParsedShot[],
): string {
  const rows = shots.map((s) => s.rawRow);
  return [headerRow, separatorRow, ...rows].join("\n");
}
