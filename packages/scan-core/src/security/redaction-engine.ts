export class RedactionEngine {
  private static readonly AWS_KEY_REGEX =
    /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g;

  private static readonly GITHUB_TOKEN_REGEX = /gh[pousr]_[A-Za-z0-9_]{36,255}/g;

  private static readonly GITLAB_TOKEN_REGEX = /glpat-[A-Za-z0-9\-=_]{20,}/g;

  private static readonly SLACK_TOKEN_REGEX = /xox[baprs]-[0-9a-zA-Z-]{10,48}/g;

  private static readonly PRIVATE_KEY_REGEX =
    /-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+ PRIVATE KEY-----/g;

  private static readonly JWT_REGEX =
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

  private static readonly ASSIGNMENT_REGEX =
    /(password|secret|token|api_key|apikey|private_key|client_secret)\s*[:=]\s*['"]?([^\s'"]{6,})['"]?/gi;

  /**
   * Calculates the Shannon Entropy of a given string.
   */
  public static calculateEntropy(str: string): number {
    if (!str || str.length === 0) return 0;

    const charFrequencies = new Map<string, number>();
    for (const char of str) {
      charFrequencies.set(char, (charFrequencies.get(char) || 0) + 1);
    }

    let entropy = 0;
    const len = str.length;
    for (const count of charFrequencies.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Redacts sensitive secrets, credentials, tokens, and high-entropy strings from an input string.
   */
  public static redact(input: string, rawSecretMatch?: string | null): string {
    if (!input) return '';

    let result = input;

    // 1. Literal raw secret match if known
    if (rawSecretMatch && rawSecretMatch.trim().length > 0) {
      const escaped = rawSecretMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), '****');
    }

    // 2. Private Key Blocks
    result = result.replace(this.PRIVATE_KEY_REGEX, '-----BEGIN PRIVATE KEY-----\n[REDACTED PRIVATE KEY]\n-----END PRIVATE KEY-----');

    // 3. AWS Keys
    result = result.replace(this.AWS_KEY_REGEX, 'AKIA****');

    // 4. GitHub Tokens
    result = result.replace(this.GITHUB_TOKEN_REGEX, (match) => {
      const prefix = match.slice(0, 4);
      return `${prefix}****`;
    });

    // 5. GitLab Tokens
    result = result.replace(this.GITLAB_TOKEN_REGEX, 'glpat-****');

    // 6. Slack Tokens
    result = result.replace(this.SLACK_TOKEN_REGEX, 'xox****');

    // 7. JWT Tokens
    result = result.replace(this.JWT_REGEX, 'eyJ****.[REDACTED_JWT].****');

    // 8. Key-Value Credential assignments (preserve key name, redact value)
    result = result.replace(this.ASSIGNMENT_REGEX, (_match, key, _val) => {
      return `${key}="****"`;
    });

    // 9. Shannon Entropy filter for high-entropy tokens (Base64/Hex candidates >= 20 chars)
    // Match contiguous alphanumeric plus common b64 chars (+, /, _, -, =)
    result = result.replace(/[A-Za-z0-9+/_\-=]{20,}/g, (token) => {
      // Avoid already redacted strings
      if (token.includes('****') || token.includes('[REDACTED')) {
        return token;
      }
      const entropy = this.calculateEntropy(token);
      if (entropy > 4.5) {
        return '****************';
      }
      return token;
    });

    return result;
  }
}
