import fs from 'node:fs';
import path from 'node:path';

export class ConfigurationError extends Error {
  public readonly code: string;
  public readonly exitCode = 3;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = code;
  }
}

export class ProjectRootResolver {
  /**
   * Resolves the canonical project root directory.
   * If explicitDir is provided, validates that it exists and is a directory.
   * Otherwise, traverses up from cwd looking for .shipshield.yaml, .shipshield.yml, or .git.
   * Fails if both .shipshield.yaml and .shipshield.yml exist in the resolved root.
   */
  public static resolve(explicitDir?: string, cwd = process.cwd()): string {
    let resolvedRoot: string;

    if (explicitDir) {
      const resolved = path.resolve(cwd, explicitDir);
      if (!fs.existsSync(resolved)) {
        throw new ConfigurationError(
          'SS-CFG-NOT-FOUND',
          `Specified project directory does not exist: ${explicitDir}`
        );
      }
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        throw new ConfigurationError(
          'SS-CFG-NOT-DIR',
          `Specified project path is not a directory: ${explicitDir}`
        );
      }
      resolvedRoot = fs.realpathSync.native(resolved);
    } else {
      let current = path.resolve(cwd);
      let found: string | null = null;

      while (true) {
        const yamlConfig = path.join(current, '.shipshield.yaml');
        const ymlConfig = path.join(current, '.shipshield.yml');
        const gitDir = path.join(current, '.git');

        if (fs.existsSync(yamlConfig) || fs.existsSync(ymlConfig) || fs.existsSync(gitDir)) {
          found = current;
          break;
        }

        const parent = path.dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }

      resolvedRoot = found ? fs.realpathSync.native(found) : fs.realpathSync.native(cwd);
    }

    // Check for ambiguous configuration files (.shipshield.yaml AND .shipshield.yml)
    const hasYaml = fs.existsSync(path.join(resolvedRoot, '.shipshield.yaml'));
    const hasYml = fs.existsSync(path.join(resolvedRoot, '.shipshield.yml'));

    if (hasYaml && hasYml) {
      throw new ConfigurationError(
        'SS-CFG-AMBIGUOUS',
        `Ambiguous configuration: both .shipshield.yaml and .shipshield.yml exist in ${resolvedRoot}`
      );
    }

    return resolvedRoot;
  }
}
