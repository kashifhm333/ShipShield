import { PolicyDefinition, PolicyFindingResult, PolicyExecutionContext } from './native-policy.types.js';
import { RedactionEngine } from '../security/redaction-engine.js';

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

function getSnippet(content: string, lineNum: number): string {
  const lines = content.split('\n');
  const line = lines[lineNum - 1];
  return line ? line.trim() : '';
}

export const NATIVE_POLICIES: PolicyDefinition[] = [
  // ==========================================
  // Category A: Secrets & Credentials
  // ==========================================
  {
    id: 'SS-SECRET-001',
    title: 'Hardcoded Private Cryptographic Key',
    description: 'A private key block (RSA, DSA, EC, OPENSSH, PGP) was detected hardcoded in the codebase.',
    category: 'secrets',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Remove the private key from the repository immediately. Rotate the compromised key and use an environment variable or secrets manager.',
    standards: ['CWE-798', 'OWASP-A02:2021', 'NIST-SP-800-53'],
    version: '1.0.0',
    filePatterns: ['**/*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const regex = /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(ctx.content)) !== null) {
        const line = getLineNumber(ctx.content, match.index);
        results.push({
          rule_id: 'SS-SECRET-001',
          category: 'secrets',
          severity: 'critical',
          confidence: 'high',
          title: 'Hardcoded Private Cryptographic Key',
          description: 'A private key was found in source files. Storing private keys in version control leads to unauthorized access.',
          remediation: 'Remove and revoke this private key immediately. Store keys in a secure secret manager or inject via environment.',
          file_path: ctx.relativePath,
          line_start: line,
          line_snippet: RedactionEngine.redact(getSnippet(ctx.content, line)),
          standards: ['CWE-798', 'OWASP-A02:2021'],
        });
      }
      return results;
    },
  },
  {
    id: 'SS-SECRET-002',
    title: 'Exposed Cloud Provider Credentials',
    description: 'Hardcoded AWS access key, GCP Service Account token, or Azure credentials were detected.',
    category: 'secrets',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Immediately rotate the cloud credential in your cloud console and use IAM roles, workload identity, or environment variables.',
    standards: ['CWE-798', 'CIS-AWS-1.3', 'OWASP-A02:2021'],
    version: '1.0.0',
    filePatterns: ['**/*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const awsRegex = /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g;
      let match: RegExpExecArray | null;
      while ((match = awsRegex.exec(ctx.content)) !== null) {
        const line = getLineNumber(ctx.content, match.index);
        results.push({
          rule_id: 'SS-SECRET-002',
          category: 'secrets',
          severity: 'critical',
          confidence: 'high',
          title: 'Exposed Cloud Provider Credentials (AWS Access Key)',
          description: 'An AWS access key ID was detected in source files. Hardcoded cloud keys can allow full cloud account takeover.',
          remediation: 'Rotate this AWS access key in AWS IAM and use AWS IAM Roles or AWS Secrets Manager.',
          file_path: ctx.relativePath,
          line_start: line,
          line_snippet: RedactionEngine.redact(getSnippet(ctx.content, line)),
          standards: ['CWE-798', 'CIS-AWS-1.3'],
        });
      }
      return results;
    },
  },
  {
    id: 'SS-SECRET-003',
    title: 'Exposed SaaS & Developer Platform Token',
    description: 'Hardcoded API tokens for GitHub, Slack, Stripe, or standard JWT secret keys were detected.',
    category: 'secrets',
    severity: 'high',
    confidence: 'high',
    remediation: 'Revoke the platform token and inject it securely via environment variables or secret vaults.',
    standards: ['CWE-798', 'OWASP-A02:2021'],
    version: '1.0.0',
    filePatterns: ['**/*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const tokenRegex = /(gh[pousr]_[A-Za-z0-9_]{36,255}|xox[baprs]-[0-9a-zA-Z-]{10,48}|sk_live_[0-9a-zA-Z]{24,})/g;
      let match: RegExpExecArray | null;
      while ((match = tokenRegex.exec(ctx.content)) !== null) {
        const line = getLineNumber(ctx.content, match.index);
        results.push({
          rule_id: 'SS-SECRET-003',
          category: 'secrets',
          severity: 'high',
          confidence: 'high',
          title: 'Exposed SaaS & Developer Platform Token',
          description: 'A developer token (GitHub, Slack, or Stripe) was found in plaintext in the repository.',
          remediation: 'Revoke the token immediately from the vendor dashboard and configure it as a secret environment variable.',
          file_path: ctx.relativePath,
          line_start: line,
          line_snippet: RedactionEngine.redact(getSnippet(ctx.content, line)),
          standards: ['CWE-798'],
        });
      }
      return results;
    },
  },
  {
    id: 'SS-SECRET-004',
    title: 'Database Connection String with Plaintext Password',
    description: 'Database URL URI containing embedded plaintext password credentials.',
    category: 'secrets',
    severity: 'high',
    confidence: 'medium',
    remediation: 'Do not commit connection strings with embedded passwords. Use environment variables like DATABASE_URL loaded at runtime.',
    standards: ['CWE-256', 'OWASP-A02:2021'],
    version: '1.0.0',
    filePatterns: ['**/*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      // Ignore sample or test fixture files explicitly mentioning test/sample
      if (ctx.relativePath.includes('example') || ctx.relativePath.includes('sample')) {
        return results;
      }
      const dbUriRegex = /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[a-zA-Z0-9_]+:([^@\s'"]+)@[a-zA-Z0-9.-]+/gi;
      let match: RegExpExecArray | null;
      while ((match = dbUriRegex.exec(ctx.content)) !== null) {
        const password = match[1];
        if (password && !['password', 'pass', 'test', 'admin', 'root'].includes(password.toLowerCase())) {
          const line = getLineNumber(ctx.content, match.index);
          results.push({
            rule_id: 'SS-SECRET-004',
            category: 'secrets',
            severity: 'high',
            confidence: 'medium',
            title: 'Database Connection String with Plaintext Password',
            description: 'A database connection string with embedded authentication password was found.',
            remediation: 'Extract credentials into runtime environment variables and do not commit connection passwords.',
            file_path: ctx.relativePath,
            line_start: line,
            line_snippet: RedactionEngine.redact(getSnippet(ctx.content, line)),
            standards: ['CWE-256', 'OWASP-A02:2021'],
          });
        }
      }
      return results;
    },
  },

  // ==========================================
  // Category B: Containers & Docker
  // ==========================================
  {
    id: 'SS-DOCKER-001',
    title: 'Container Running as Root User',
    description: 'Dockerfile does not specify a non-root USER instruction, defaulting to execution as root inside container.',
    category: 'containers',
    severity: 'high',
    confidence: 'high',
    remediation: 'Create a dedicated non-root user and add USER <username> before the CMD or ENTRYPOINT instruction in your Dockerfile.',
    standards: ['CIS-Docker-4.1', 'CWE-250', 'NIST-SP-800-190'],
    version: '1.0.0',
    filePatterns: ['**/Dockerfile*', '**/Containerfile*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      // Must have FROM and cannot have USER
      if (/^FROM\s+/im.test(ctx.content)) {
        const hasUser = /^USER\s+[a-zA-Z0-9_-]+/im.test(ctx.content);
        if (!hasUser) {
          const lines = ctx.content.split('\n');
          let lastFromLine = 1;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line && /^FROM\s+/i.test(line)) {
              lastFromLine = i + 1;
            }
          }
          return [
            {
              rule_id: 'SS-DOCKER-001',
              category: 'containers',
              severity: 'high',
              confidence: 'high',
              title: 'Container Running as Root User',
              description: 'The Dockerfile does not specify a non-root USER instruction. Running containers as root increases container breakout severity.',
              remediation: 'Define a dedicated group and user (e.g. USER appuser) prior to runtime execution.',
              file_path: ctx.relativePath,
              line_start: lastFromLine,
              line_snippet: getSnippet(ctx.content, lastFromLine),
              standards: ['CIS-Docker-4.1', 'CWE-250'],
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: 'SS-DOCKER-002',
    title: 'Mutable or Unpinned Base Image Tag',
    description: 'Dockerfile uses the mutable ":latest" tag or omits the tag entirely for a base image.',
    category: 'containers',
    severity: 'medium',
    confidence: 'high',
    remediation: 'Pin the base image to a specific immutable semantic version or digest SHA256.',
    standards: ['CIS-Docker-4.2', 'OWASP-A06:2021'],
    version: '1.0.0',
    filePatterns: ['**/Dockerfile*', '**/Containerfile*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const match = line.match(/^FROM\s+([^\s]+)/i);
        const image = match ? match[1] : undefined;
        if (image && image !== 'scratch' && (!image.includes(':') || image.endsWith(':latest'))) {
            results.push({
              rule_id: 'SS-DOCKER-002',
              category: 'containers',
              severity: 'medium',
              confidence: 'high',
              title: 'Mutable or Unpinned Base Image Tag',
              description: `The base image "${image}" is unpinned or uses :latest. Mutable tags cause non-deterministic builds and supply-chain vulnerabilities.`,
              remediation: 'Specify an explicit, immutable tag (e.g. node:20.11.0-alpine or @sha256:...).',
              file_path: ctx.relativePath,
              line_start: i + 1,
              line_snippet: line.trim(),
              standards: ['CIS-Docker-4.2'],
            });
          }
        }
        return results;
      },
    },
  {
    id: 'SS-DOCKER-003',
    title: 'Sensitive Credential File Copied into Container Image',
    description: 'Dockerfile COPY or ADD directive copies sensitive credentials, keys, or environment files into the built container image.',
    category: 'containers',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Remove sensitive files from COPY/ADD instructions and add them to .dockerignore.',
    standards: ['CWE-798', 'CIS-Docker-4.3'],
    version: '1.0.0',
    filePatterns: ['**/Dockerfile*', '**/Containerfile*'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      const sensitiveFilesRegex = /(?:\.env|\.npmrc|id_rsa|\.pem|\.key|secrets\.json)/i;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (/^(?:COPY|ADD)\s+/i.test(line) && sensitiveFilesRegex.test(line)) {
          results.push({
            rule_id: 'SS-DOCKER-003',
            category: 'containers',
            severity: 'critical',
            confidence: 'high',
            title: 'Sensitive Credential File Copied into Container Image',
            description: `The instruction "${line.trim()}" appears to copy sensitive secrets or keys directly into the image layers.`,
            remediation: 'Exclude credentials from image builds using .dockerignore and supply secrets at runtime.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CWE-798', 'CIS-Docker-4.3'],
          });
        }
      }
      return results;
    },
  },
  {
    id: 'SS-DOCKER-004',
    title: 'Docker Daemon Socket Mounted Inside Container',
    description: 'docker-compose or container configuration mounts /var/run/docker.sock into a container, granting root host access.',
    category: 'containers',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Do not expose the Docker socket inside containers. Use isolated Docker-in-Docker or rootless container tooling.',
    standards: ['CWE-250', 'CIS-Docker-2.1'],
    version: '1.0.0',
    filePatterns: ['**/docker-compose*.yml', '**/docker-compose*.yaml'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      if (ctx.content.includes('/var/run/docker.sock')) {
        const lines = ctx.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && line.includes('/var/run/docker.sock')) {
            results.push({
              rule_id: 'SS-DOCKER-004',
              category: 'containers',
              severity: 'critical',
              confidence: 'high',
              title: 'Docker Daemon Socket Mounted Inside Container',
              description: 'Mounting /var/run/docker.sock grants root privileges over the host system, allowing trivial container breakout.',
              remediation: 'Remove the docker.sock volume mount from your service configuration.',
              file_path: ctx.relativePath,
              line_start: i + 1,
              line_snippet: line.trim(),
              standards: ['CWE-250', 'CIS-Docker-2.1'],
            });
          }
        }
      }
      return results;
    },
  },

  // ==========================================
  // Category C: Infrastructure as Code & Kubernetes
  // ==========================================
  {
    id: 'SS-IAC-001',
    title: 'Publicly Accessible Cloud Storage Bucket',
    description: 'Terraform S3 bucket or cloud storage configured with public-read or public-read-write ACL.',
    category: 'iac',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Configure bucket ACL to private and enable public access blocks.',
    standards: ['CIS-AWS-2.1.5', 'CWE-284', 'OWASP-A01:2021'],
    version: '1.0.0',
    filePatterns: ['**/*.tf'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (/acl\s*=\s*["']public-read(?:-write)?["']/i.test(line)) {
          results.push({
            rule_id: 'SS-IAC-001',
            category: 'iac',
            severity: 'critical',
            confidence: 'high',
            title: 'Publicly Accessible Cloud Storage Bucket',
            description: 'Cloud storage bucket configured with public-read or public-read-write ACL, exposing all stored data to the Internet.',
            remediation: 'Set acl = "private" and enable aws_s3_bucket_public_access_block.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CIS-AWS-2.1.5', 'CWE-284'],
          });
        }
      }
      return results;
    },
  },
  {
    id: 'SS-IAC-002',
    title: 'Overly Permissive Ingress Security Group (0.0.0.0/0 on Admin Port)',
    description: 'Security group rule allows inbound traffic from 0.0.0.0/0 on administrative ports (SSH 22, RDP 3389, DB 5432/3306).',
    category: 'iac',
    severity: 'high',
    confidence: 'high',
    remediation: 'Restrict CIDR blocks to specific trusted corporate subnets or bastion host security groups.',
    standards: ['CIS-AWS-4.1', 'CWE-284'],
    version: '1.0.0',
    filePatterns: ['**/*.tf'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (
          /cidr_blocks\s*=\s*\[\s*["']0\.0\.0\.0\/0["']\s*\]/i.test(line) &&
          ctx.content.includes('22')
        ) {
          results.push({
            rule_id: 'SS-IAC-002',
            category: 'iac',
            severity: 'high',
            confidence: 'high',
            title: 'Overly Permissive Ingress Security Group',
            description: 'Inbound CIDR block 0.0.0.0/0 is configured for sensitive administrative ports, enabling port scanning and brute-force attacks.',
            remediation: 'Restrict ingress cidr_blocks to specific trusted administrative IP addresses.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CIS-AWS-4.1'],
          });
          break;
        }
      }
      return results;
    },
  },
  {
    id: 'SS-K8S-001',
    title: 'Kubernetes Container Running with Privileged SecurityContext',
    description: 'Kubernetes pod or container spec has privileged: true, granting container root host access.',
    category: 'kubernetes',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Set securityContext.privileged: false and drop unnecessary Linux capabilities.',
    standards: ['CIS-K8s-5.2.1', 'CWE-250'],
    version: '1.0.0',
    filePatterns: ['**/*.yaml', '**/*.yml'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      if (ctx.content.includes('privileged: true') && (ctx.content.includes('apiVersion:') || ctx.content.includes('kind: Pod') || ctx.content.includes('kind: Deployment'))) {
        const lines = ctx.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && /privileged:\s*true/i.test(line)) {
            results.push({
              rule_id: 'SS-K8S-001',
              category: 'kubernetes',
              severity: 'critical',
              confidence: 'high',
              title: 'Kubernetes Container Running with Privileged SecurityContext',
              description: 'Privileged containers in Kubernetes disable all security controls and can compromise the underlying node.',
              remediation: 'Remove privileged: true and run containers as unprivileged users.',
              file_path: ctx.relativePath,
              line_start: i + 1,
              line_snippet: line.trim(),
              standards: ['CIS-K8s-5.2.1', 'CWE-250'],
            });
          }
        }
      }
      return results;
    },
  },

  // ==========================================
  // Category D: CI/CD & Repository Security
  // ==========================================
  {
    id: 'SS-CICD-001',
    title: 'Untrusted Pull Request Context in GitHub Actions Script',
    description: 'A GitHub Actions workflow script directly interpolates untrusted pull_request data inside run: commands, enabling code injection.',
    category: 'cicd',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Pass GitHub context variables via environment variables instead of direct inline template interpolation.',
    standards: ['CWE-78', 'OWASP-CICD-SEC-01'],
    version: '1.0.0',
    filePatterns: ['**/.github/workflows/*.yml', '**/.github/workflows/*.yaml'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      const untrustedContextRegex = /\$\{\{\s*github\.event\.(?:pull_request|issue)\.(?:title|body|head\.ref)\s*\}\}/i;
      let insideRun = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (/^\s*run:\s*/.test(line)) {
          insideRun = true;
        } else if (/^\s*[a-zA-Z0-9_-]+:/.test(line) && !/^\s*run:/.test(line)) {
          insideRun = false;
        }

        if (untrustedContextRegex.test(line)) {
          results.push({
            rule_id: 'SS-CICD-001',
            category: 'cicd',
            severity: 'critical',
            confidence: 'high',
            title: 'Untrusted Pull Request Context in GitHub Actions Script',
            description: 'Direct interpolation of pull_request or issue titles/bodies into shell scripts allows pull request authors to execute arbitrary commands.',
            remediation: 'Assign ${{ github.event.pull_request.title }} to an env: variable and reference it as $VAR in your shell script.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CWE-78', 'OWASP-CICD-SEC-01'],
          });
        }
      }
      return results;
    },
  },
  {
    id: 'SS-CICD-002',
    title: 'Overly Permissive Workflow Permissions (write-all)',
    description: 'GitHub Actions workflow specifies permissions: write-all at top level, violating principle of least privilege.',
    category: 'cicd',
    severity: 'high',
    confidence: 'high',
    remediation: 'Set explicit, minimal permissions per job (e.g. contents: read, id-token: write) or set top-level permissions: read-all.',
    standards: ['CWE-250', 'OWASP-CICD-SEC-04'],
    version: '1.0.0',
    filePatterns: ['**/.github/workflows/*.yml', '**/.github/workflows/*.yaml'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && /permissions:\s*write-all/i.test(line)) {
          results.push({
            rule_id: 'SS-CICD-002',
            category: 'cicd',
            severity: 'high',
            confidence: 'high',
            title: 'Overly Permissive Workflow Permissions (write-all)',
            description: 'Granting write-all permissions exposes the workflow token to compromise, allowing malicious tampering with code or packages.',
            remediation: 'Configure granular, read-only permissions by default.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CWE-250'],
          });
        }
      }
      return results;
    },
  },

  // ==========================================
  // Category E: Supply Chain & Dependency Security
  // ==========================================
  {
    id: 'SS-SUPPLY-001',
    title: 'Insecure Plaintext HTTP Package Registry Configured',
    description: 'Package registry URL configured using plaintext http:// instead of secure https://, exposing package downloads to MITM.',
    category: 'supply-chain',
    severity: 'high',
    confidence: 'high',
    remediation: 'Always use secure https:// URLs for package registries in .npmrc, yarnrc, or lockfiles.',
    standards: ['CWE-319', 'OWASP-A02:2021'],
    version: '1.0.0',
    filePatterns: ['**/.npmrc', '**/.yarnrc', '**/package-lock.json', '**/yarn.lock'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && /(?:registry|resolved)\s*[:=]\s*["']?http:\/\//i.test(line)) {
          results.push({
            rule_id: 'SS-SUPPLY-001',
            category: 'supply-chain',
            severity: 'high',
            confidence: 'high',
            title: 'Insecure Plaintext HTTP Package Registry Configured',
            description: 'Package downloads over unencrypted HTTP are vulnerable to man-in-the-middle code execution and package tampering.',
            remediation: 'Replace all http:// repository endpoints with https://.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CWE-319'],
          });
        }
      }
      return results;
    },
  },
  {
    id: 'SS-SUPPLY-002',
    title: 'Dangerous Remote Shell Execution in Package Lifecycle Script',
    description: 'package.json preinstall or postinstall script executes unverified remote code via curl | sh or wget | bash.',
    category: 'supply-chain',
    severity: 'critical',
    confidence: 'high',
    remediation: 'Remove remote curl | bash execution from package lifecycle hooks. Bundle dependencies or build binaries locally.',
    standards: ['CWE-78', 'OWASP-A08:2021'],
    version: '1.0.0',
    filePatterns: ['**/package.json'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const dangerousScriptRegex = /(?:curl|wget)\s+[^|&;]+?\|\s*(?:ba|z)?sh/i;
      if (dangerousScriptRegex.test(ctx.content)) {
        const lines = ctx.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && dangerousScriptRegex.test(line)) {
            results.push({
              rule_id: 'SS-SUPPLY-002',
              category: 'supply-chain',
              severity: 'critical',
              confidence: 'high',
              title: 'Dangerous Remote Shell Execution in Package Lifecycle Script',
              description: 'Executing unverified scripts downloaded over the network inside npm lifecycle hooks presents acute supply-chain compromise risk.',
              remediation: 'Do not pipe remote network payloads into shell interpreters in lifecycle scripts.',
              file_path: ctx.relativePath,
              line_start: i + 1,
              line_snippet: line.trim(),
              standards: ['CWE-78'],
            });
          }
        }
      }
      return results;
    },
  },

  // ==========================================
  // Category F: Application & Code Security
  // ==========================================
  {
    id: 'SS-APP-001',
    title: 'TLS Certificate Verification Disabled',
    description: 'Code explicitly disables TLS/SSL certificate verification (e.g. rejectUnauthorized: false, verify=False, InsecureSkipVerify: true).',
    category: 'general',
    severity: 'high',
    confidence: 'high',
    remediation: 'Enable TLS certificate validation. If self-signed certificates are required, add custom CA root certificates rather than disabling verification.',
    standards: ['CWE-295', 'OWASP-A02:2021'],
    version: '1.0.0',
    filePatterns: ['**/*.js', '**/*.ts', '**/*.py', '**/*.go', '**/*.java'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      const lines = ctx.content.split('\n');
      const insecureTlsRegex = /(rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true)/i;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && insecureTlsRegex.test(line)) {
          results.push({
            rule_id: 'SS-APP-001',
            category: 'general',
            severity: 'high',
            confidence: 'high',
            title: 'TLS Certificate Verification Disabled',
            description: 'Disabling TLS certificate verification renders HTTPS connections vulnerable to eavesdropping and credential theft.',
            remediation: 'Ensure rejectUnauthorized: true or verify=True is enabled.',
            file_path: ctx.relativePath,
            line_start: i + 1,
            line_snippet: line.trim(),
            standards: ['CWE-295', 'OWASP-A02:2021'],
          });
        }
      }
      return results;
    },
  },
  {
    id: 'SS-APP-002',
    title: 'Wildcard CORS Header with Credential Sharing Allowed',
    description: 'Application configures Access-Control-Allow-Origin: * alongside Access-Control-Allow-Credentials: true, exposing user sessions.',
    category: 'general',
    severity: 'medium',
    confidence: 'medium',
    remediation: 'Do not use wildcard origin (*) when credentials mode is enabled. Explicitly validate and whitelist allowed client origins.',
    standards: ['CWE-346', 'OWASP-A07:2021'],
    version: '1.0.0',
    filePatterns: ['**/*.js', '**/*.ts', '**/*.py', '**/*.json', '**/*.yaml'],
    check(ctx: PolicyExecutionContext): PolicyFindingResult[] {
      const results: PolicyFindingResult[] = [];
      if (
        (ctx.content.includes("origin: '*'") || ctx.content.includes('origin: "*"') || ctx.content.includes("'Access-Control-Allow-Origin', '*'")) &&
        (ctx.content.includes('credentials: true') || ctx.content.includes("'Access-Control-Allow-Credentials', 'true'"))
      ) {
        const lines = ctx.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && line.includes('*') && line.toLowerCase().includes('origin')) {
            results.push({
              rule_id: 'SS-APP-002',
              category: 'general',
              severity: 'medium',
              confidence: 'medium',
              title: 'Wildcard CORS Header with Credential Sharing Allowed',
              description: 'Configuring wildcard CORS alongside allowed credentials allows arbitrary websites to access sensitive user sessions.',
              remediation: 'Whitelist trusted domains explicitly instead of using wildcard (*).',
              file_path: ctx.relativePath,
              line_start: i + 1,
              line_snippet: line.trim(),
              standards: ['CWE-346'],
            });
            break;
          }
        }
      }
      return results;
    },
  },
];
