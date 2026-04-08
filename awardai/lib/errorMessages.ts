/**
 * Shortlist error code system
 *
 * Format: [FUNCTION]-[REASON]
 *   Functions : DIR, DRAFT, EVAL, SCRIPT
 *   Reasons   : AI-529, AI-429, AI-500, AI-XXX, PARSE, RATE, AUTH, DATA, NET
 *
 * Codes appear in the UI as small gray monospace text so every screenshot
 * sent to support immediately identifies the failure type.
 *
 * User-facing messages are deliberately vague about infrastructure details
 * (no mention of "Claude", "Anthropic", "Supabase") but specific enough to
 * tell the user what to do next.
 */

export interface AppError {
  /** Human-readable message shown prominently to the user */
  message: string
  /** Whether a simple retry is likely to succeed */
  retryable: boolean
  /** Short code shown in small text for support diagnosis */
  code: string
}

// ── Message catalogue ────────────────────────────────────────────────────────

const AI_BUSY =
  'The AI is temporarily busy — this usually clears in seconds. Try again.'
const AI_LIMIT =
  'AI request limit reached. Please wait a minute before trying again.'
const AI_ERROR =
  'The AI service returned an error. Please try again.'
const PARSE_MSG =
  'Got an unexpected response from the AI. Please try again.'
const RATE_MSG =
  "You've reached your hourly usage limit. Please wait a few minutes before trying again."
const AUTH_MSG =
  'Your session has expired. Please refresh the page and try again.'
const DATA_MSG =
  'Not enough campaign content to work with. Add a brief or upload materials first.'
const NET_MSG =
  'Network error — check your connection and try again.'
const GENERIC_MSG =
  'Something went wrong. Please try again.'

// Maps the REASON portion of a code (e.g. "AI-529", "PARSE") to a message + retryable flag
const REASON_MAP: Record<string, { message: string; retryable: boolean }> = {
  'AI-529': { message: AI_BUSY,    retryable: true  },
  'AI-500': { message: AI_ERROR,   retryable: true  },
  'AI-429': { message: AI_LIMIT,   retryable: true  },
  'AI-408': { message: AI_BUSY,    retryable: true  },
  'AI-502': { message: AI_BUSY,    retryable: true  },
  'AI-503': { message: AI_BUSY,    retryable: true  },
  'PARSE':  { message: PARSE_MSG,  retryable: true  },
  'RATE':   { message: RATE_MSG,   retryable: false },
  'AUTH':   { message: AUTH_MSG,   retryable: false },
  'DATA':   { message: DATA_MSG,   retryable: false },
  'NET':    { message: NET_MSG,    retryable: true  },
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Build a structured AppError from a code returned by an edge function.
 * Falls back gracefully for unknown codes.
 *
 * @example
 * const err = appErrorFromCode('DIR-AI-529')
 * // { message: 'The AI is temporarily busy…', retryable: true, code: 'DIR-AI-529' }
 */
export function appErrorFromCode(code: string): AppError {
  // Strip the function prefix (first segment) and look up the rest
  const parts = code.split('-')
  // Try longest suffix first: e.g. "AI-529", then "529", then exact match
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join('-')
    if (REASON_MAP[suffix]) {
      return { ...REASON_MAP[suffix], code }
    }
  }
  // Unknown code — generic fallback
  return { message: GENERIC_MSG, retryable: true, code }
}

/**
 * Build a structured AppError from a raw edge function response object.
 * Reads `data.code` if present, otherwise falls back to `data.error` string.
 */
export function appErrorFromResponse(
  data: { error?: string; code?: string; status?: number },
  httpStatus: number,
  functionPrefix: string
): AppError {
  if (data.code) {
    return appErrorFromCode(data.code)
  }
  // No structured code — try to infer from HTTP status
  const inferredCode = `${functionPrefix}-AI-${data.status ?? httpStatus}`
  const byStatus = REASON_MAP[`AI-${data.status ?? httpStatus}`]
  if (byStatus) {
    return { ...byStatus, code: inferredCode }
  }
  // Fall back to raw error message with a generic code
  return {
    message: data.error || GENERIC_MSG,
    retryable: true,
    code: `${functionPrefix}-${httpStatus}`,
  }
}

/**
 * Format an AppError for storage in a plain string state variable.
 * Pattern: "User message [CODE]"
 * The ErrorBanner component splits on this pattern for display.
 */
export function formatError(err: AppError): string {
  return `${err.message} [${err.code}]`
}

/**
 * Parse a formatted error string back into message and code parts.
 * Handles both "[CODE]" suffixed strings and plain strings gracefully.
 */
export function parseErrorString(raw: string): { message: string; code: string; retryable: boolean } {
  const match = raw.match(/^([\s\S]+?)\s*\[([A-Z0-9-]+)\]$/)
  if (match) {
    const code = match[2]
    const lookup = appErrorFromCode(code)
    return { message: match[1], code, retryable: lookup.retryable }
  }
  return { message: raw, code: '', retryable: true }
}
