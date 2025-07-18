/**
 * A simple in-memory rate limiter.
 * NOTE: This is instance-specific. In a multi-instance environment, a shared store
 * like Redis would be required for a globally effective rate limit.
 */
export class RateLimiter {
  private attempts = new Map<string, number[]>();

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  /**
   * Checks if an identifier has exceeded the rate limit.
   * @param identifier A unique string for the user/IP to track.
   * @returns `true` if the request is allowed, `false` if it is blocked.
   */
  check(identifier: string): boolean {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    
    // Filter out attempts that are outside the time window
    const recentAttempts = userAttempts.filter(
      (time) => now - time < this.windowMs
    );

    if (recentAttempts.length >= this.maxAttempts) {
      // Too many attempts, request is blocked
      this.attempts.set(identifier, recentAttempts); // Update with the filtered list
      return false;
    }

    // Request is allowed, record the new attempt
    this.attempts.set(identifier, [...recentAttempts, now]);
    return true;
  }
}
