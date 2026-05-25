/**
 * Robustly extract JSON from LLM text output.
 * Handles: thinking tags, markdown code blocks, preamble text, trailing text.
 */
export function extractJsonFromText(raw: string): string {
  let text = raw;

  // Strip <think>...</think> blocks (Gemini thinking tokens)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Strip markdown code blocks: ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1];
  }

  // Try parsing the cleaned text directly
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Try with trailing-comma repair before bracket matching
    try {
      const repaired = repairJson(trimmed);
      JSON.parse(repaired);
      return repaired;
    } catch {
      // continue to find JSON within text
    }
  }

  // Find first { or [ and match to the last } or ]
  const objStart = trimmed.indexOf("{");
  const arrStart = trimmed.indexOf("[");

  let start: number;
  let closeChar: string;
  if (objStart === -1 && arrStart === -1) {
    throw new Error("No JSON object or array found in text");
  } else if (objStart === -1) {
    start = arrStart;
    closeChar = "]";
  } else if (arrStart === -1) {
    start = objStart;
    closeChar = "}";
  } else {
    start = Math.min(objStart, arrStart);
    closeChar = start === objStart ? "}" : "]";
  }

  // Find matching close bracket from the end
  const lastClose = trimmed.lastIndexOf(closeChar);
  if (lastClose <= start) {
    throw new Error(`No matching ${closeChar} found after position ${start}`);
  }

  const extracted = trimmed.slice(start, lastClose + 1);
  // Validate it parses — try raw first, then with trailing-comma repair
  try {
    JSON.parse(extracted);
    return extracted;
  } catch {
    const repaired = repairJson(extracted);
    JSON.parse(repaired); // will throw if still invalid
    return repaired;
  }
}

/**
 * Attempt to fix common LLM JSON issues:
 * - Trailing commas before } or ]
 * - Truncated JSON (unclosed brackets/braces)
 * - Unescaped newlines inside strings
 */
function repairJson(json: string): string {
  // Remove trailing commas: ,\s*} or ,\s*]
  let repaired = json.replace(/,\s*([}\]])/g, "$1");

  // Attempt to close truncated JSON:
  // Count unclosed brackets and braces
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    // Try closing unclosed brackets/braces
    repaired = closeTruncatedJson(repaired);
  }

  return repaired;
}

/**
 * Close truncated JSON by removing the last incomplete element
 * and appending missing closing brackets.
 */
function closeTruncatedJson(json: string): string {
  // Track bracket/brace depth (ignore chars inside strings)
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}") { if (stack.length && stack[stack.length - 1] === "{") stack.pop(); }
    if (ch === "]") { if (stack.length && stack[stack.length - 1] === "[") stack.pop(); }
  }

  if (stack.length === 0) return json; // balanced already

  // Try to find the last complete element and truncate after it
  // Look for the last valid comma or opening bracket at the same depth
  let truncated = json.trimEnd();

  // If we're mid-string, close the string
  if (inString) truncated += '"';

  // Remove trailing incomplete element (anything after last comma at array/object level)
  // Find last comma that's not inside a deeper structure
  let depth = 0;
  let lastSafeComma = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < truncated.length; i++) {
    const c = truncated[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") depth--;
    if (c === "," && depth === 1) lastSafeComma = i;
  }

  if (lastSafeComma > 0) {
    truncated = truncated.slice(0, lastSafeComma);
  }

  // Append closing brackets in reverse order
  // Re-scan the truncated string to find what needs closing
  const closeStack: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < truncated.length; i++) {
    const ch = truncated[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") closeStack.push("}");
    if (ch === "[") closeStack.push("]");
    if (ch === "}" || ch === "]") closeStack.pop();
  }

  truncated += closeStack.reverse().join("");
  return truncated;
}
