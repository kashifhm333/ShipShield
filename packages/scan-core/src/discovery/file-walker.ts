import fs from 'node:fs';
import path from 'node:path';
import { ScannerId } from '@shipshield/contracts';

export interface DiscoveredFiles {
  allFiles: string[];
  applicableScanners: Record<ScannerId, boolean>;
}

export class FileWalker {
  private static readonly DEPENDENCY_MANIFEST_NAMES = new Set([
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'requirements.txt',
    'poetry.lock',
    'Pipfile.lock',
    'go.mod',
    'go.sum',
    'Cargo.lock',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
  ]);

  /**
   * Matches a POSIX relative path against simple glob pattern (e.g., node_modules/**, dist/**, *.tf).
   */
  private static matchesPattern(relPath: string, pattern: string): boolean {
    const cleanPattern = pattern.replace(/^\.\//, '');
    if (cleanPattern.endsWith('/**')) {
      const prefix = cleanPattern.slice(0, -3);
      return relPath === prefix || relPath.startsWith(prefix + '/');
    }
    if (cleanPattern.startsWith('*.')) {
      const ext = cleanPattern.slice(1);
      return relPath.endsWith(ext);
    }
    return relPath === cleanPattern;
  }

  /**
   * Walks the workspace directory recursively, skipping symlinks and excluded paths.
   */
  public static walk(rootDir: string, excludePatterns: string[] = []): DiscoveredFiles {
    const allFiles: string[] = [];
    let hasDependencies = false;
    let hasContainers = false;
    let hasIac = false;

    const traverse = (currentDir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');

        // Skip symlinks
        try {
          const lstat = fs.lstatSync(fullPath);
          if (lstat.isSymbolicLink()) {
            continue;
          }
        } catch {
          continue;
        }

        // Check exclusions
        const isExcluded = excludePatterns.some((pattern) =>
          this.matchesPattern(relPath, pattern)
        );
        if (isExcluded) {
          continue;
        }

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          allFiles.push(relPath);
          const fileName = entry.name;
          const lowerName = fileName.toLowerCase();

          // Check dependency manifests
          if (this.DEPENDENCY_MANIFEST_NAMES.has(fileName)) {
            hasDependencies = true;
          }

          // Check container files
          if (
            lowerName === 'dockerfile' ||
            lowerName.endsWith('.dockerfile') ||
            lowerName === 'containerfile' ||
            lowerName.endsWith('.containerfile')
          ) {
            hasContainers = true;
          }

          // Check IaC (Terraform)
          if (lowerName.endsWith('.tf') || lowerName.endsWith('.tf.json')) {
            hasIac = true;
          }
        }
      }
    };

    traverse(rootDir);

    return {
      allFiles,
      applicableScanners: {
        secrets: allFiles.length > 0,
        dependencies: hasDependencies,
        containers: hasContainers,
        iac: hasIac,
      },
    };
  }
}
