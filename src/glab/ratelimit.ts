export class RateLimitedError extends Error {
  constructor(message = "GitLab rate-limited this refresh (HTTP 429)") {
    super(message);
    this.name = "RateLimitedError";
  }
}

export function looksRateLimited(text: string): boolean {
  return /\b429\b/.test(text) || /too many requests/i.test(text) || /rate limit/i.test(text);
}

export function rateLimitedError(result: { stdout: string; stderr: string }): RateLimitedError {
  const output = result.stderr.trim() || result.stdout.trim();
  return new RateLimitedError(output || "GitLab rate-limited this refresh (HTTP 429)");
}
