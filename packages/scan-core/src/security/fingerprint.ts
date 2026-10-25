import crypto from 'node:crypto';
import path from 'node:path';
import { ScannerId } from '@shipshield/contracts';
import { RedactionEngine } from './redaction-engine.js';

export interface SecretFingerprintInput {
  category: 'secrets';
  ruleId: string;
  relativePath: string;
  structuralContext?: string;
  secretValue?: string;
  hmacKey?: string;
}

export interface DependencyFingerprintInput {
  category: 'dependencies';
  ruleId: string;
  relativePath: string;
  packageName: string;
  installedVersion: string;
}

export interface ContainerFingerprintInput {
  category: 'containers';
  ruleId: string;
  relativePath: string;
  normalizedInstruction: string;
}

export interface IacFingerprintInput {
  category: 'iac';
  ruleId: string;
  relativePath: string;
  resourceAddress: string;
}

export type FingerprintInput =
  | SecretFingerprintInput
  | DependencyFingerprintInput
  | ContainerFingerprintInput
  | IacFingerprintInput;

export class FingerprintGenerator {
  private static readonly DEFAULT_LOCAL_HMAC_KEY = 'shipshield-local-canonical-hmac-key-v1';

  /**
   * Normalizes relative paths to POSIX format with no leading slashes or dots.
   */
  public static normalizePath(relPath: string): string {
    const posix = relPath.split(path.sep).join('/');
    const normalized = path.posix.normalize(posix);
    return normalized.replace(/^\.\//, '').replace(/^\/+/, '');
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for a security finding.
   */
  public static generateFingerprint(input: FingerprintInput): string {
    const normalizedPath = this.normalizePath(input.relativePath);
    let canonicalString = '';

    switch (input.category) {
      case 'secrets': {
        const key = input.hmacKey || this.DEFAULT_LOCAL_HMAC_KEY;
        // Invariant: Finding fingerprints MUST NEVER be computed over raw unredacted secret values.
        // We compute keyed HMAC over the normalized structural context omitting raw secret literals.
        const context = input.structuralContext
          ? input.structuralContext
          : input.secretValue
            ? RedactionEngine.redact(input.secretValue)
            : 'redacted-context';
        const contextHmac = crypto.createHmac('sha256', key).update(context).digest('hex');
        canonicalString = `secret:${input.ruleId}:${normalizedPath}:${contextHmac}`;
        break;
      }
      case 'dependencies': {
        canonicalString = `dependency:${normalizedPath}:${input.packageName}:${input.installedVersion}:${input.ruleId}`;
        break;
      }
      case 'containers': {
        canonicalString = `container:${normalizedPath}:${input.normalizedInstruction}:${input.ruleId}`;
        break;
      }
      case 'iac': {
        canonicalString = `iac:${normalizedPath}:${input.resourceAddress}:${input.ruleId}`;
        break;
      }
    }

    const sha256Hex = crypto.createHash('sha256').update(canonicalString).digest('hex');
    return `sha256:${sha256Hex}`;
  }

  /**
   * Generates a deterministic short public finding ID from category and fingerprint.
   * Format: SS-${CATEGORY_PREFIX}-${fingerprint.slice(7, 13).toUpperCase()}
   * Example: SS-SEC-A1B2C3
   */
  public static generatePublicId(category: ScannerId, fingerprint: string): string {
    const prefixMap: Record<ScannerId, string> = {
      secrets: 'SEC',
      dependencies: 'DEP',
      containers: 'CON',
      iac: 'IAC',
    };
    const prefix = prefixMap[category];
    // fingerprint format: "sha256:0123456789..."
    // slice(7, 13) takes 6 hex chars after "sha256:"
    const suffix = fingerprint.slice(7, 15).toUpperCase();
    return `SS-${prefix}-${suffix}`;
  }
}
