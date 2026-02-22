import Anthropic from '@anthropic-ai/sdk';

/**
 * Shared Anthropic client configured for Max plan usage.
 *
 * Prefers ANTHROPIC_AUTH_TOKEN (Max plan / OAuth) over ANTHROPIC_API_KEY (pay-per-token API).
 * If only ANTHROPIC_API_KEY is set, falls back to it.
 */
function createClient(): Anthropic {
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    return new Anthropic({ authToken: process.env.ANTHROPIC_AUTH_TOKEN });
  }

  return new Anthropic();
}

export const anthropic = createClient();
