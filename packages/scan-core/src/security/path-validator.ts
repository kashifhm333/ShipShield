import fs from 'node:fs';
import path from 'node:path';

export class SecurityBoundaryError extends Error {
  public readonly code = 'SS-SEC-PATH-001';

  constructor(message: string) {
    super(message);
    this.name = 'SecurityBoundaryError';
  }
}

export class PathValidator {
  /**
   * Sanitizes a path string by removing ANSI escape sequences and ASCII control characters.
   */
  public static sanitizePathString(rawPath: string): string {
    // Strip ANSI escape sequences (e.g., \x1b[31m) and ASCII control characters [\x00-\x1F\x7F-\x9F]
    // eslint-disable-next-line no-control-regex
    return rawPath.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  }

  /**
   * Resolves the canonical path of an existing or not-yet-existing target file/dir
   * by walking up until an existing ancestor directory is found.
   */
  private static resolveNearestCanonical(targetPath: string): string {
    const sanitized = this.sanitizePathString(targetPath);
    const absolute = path.resolve(sanitized);

    // If exists, realpath directly
    if (fs.existsSync(absolute)) {
      return fs.realpathSync.native(absolute);
    }

    // Walk up ancestors
    const segments: string[] = [];
    let current = absolute;

    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) {
        // Reached filesystem root without finding existing dir
        return absolute;
      }
      segments.unshift(path.basename(current));
      current = parent;
    }

    const canonicalExistingAncestor = fs.realpathSync.native(current);
    return path.join(canonicalExistingAncestor, ...segments);
  }

  /**
   * Validates that candidatePath is strictly contained inside rootDir.
   * Resolves symlinks and ensures no path traversal outside rootDir.
   * Returns the POSIX-style relative path inside the root.
   */
  public static validateContainment(rootDir: string, candidatePath: string): string {
    const sanitizedRoot = this.sanitizePathString(rootDir);
    const sanitizedCandidate = this.sanitizePathString(candidatePath);

    if (!fs.existsSync(sanitizedRoot)) {
      throw new SecurityBoundaryError(`Root directory does not exist: ${sanitizedRoot}`);
    }

    const canonicalRoot = fs.realpathSync.native(path.resolve(sanitizedRoot));
    const canonicalTarget = this.resolveNearestCanonical(sanitizedCandidate);

    const relative = path.relative(canonicalRoot, canonicalTarget);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new SecurityBoundaryError(
        `Path traversal detected: target "${sanitizedCandidate}" resolves outside root "${sanitizedRoot}"`
      );
    }

    // Check if the candidate itself is a symlink pointing outside (even if non-existent or existing)
    if (fs.existsSync(sanitizedCandidate)) {
      const stat = fs.lstatSync(sanitizedCandidate);
      if (stat.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(sanitizedCandidate);
        const resolvedLink = path.isAbsolute(linkTarget)
          ? path.resolve(linkTarget)
          : path.resolve(path.dirname(sanitizedCandidate), linkTarget);
        const canonicalLinkTarget = this.resolveNearestCanonical(resolvedLink);
        const relLink = path.relative(canonicalRoot, canonicalLinkTarget);
        if (relLink.startsWith('..') || path.isAbsolute(relLink)) {
          throw new SecurityBoundaryError(
            `Symlink escape detected: symlink "${sanitizedCandidate}" points to external target "${resolvedLink}"`
          );
        }
      }
    }

    // Return normalized POSIX relative path
    const posixRel = relative.split(path.sep).join('/');
    return posixRel === '' ? '.' : posixRel;
  }
}
