import { z } from 'zod';
import { SeveritySchema } from './enums.js';

export const ProjectConfigSchema = z
  .object({
    schema_version: z.literal(1).default(1),
    project: z
      .object({
        name: z.string().min(1).max(128).default('auto'),
        root: z.string().min(1).default('.'),
      })
      .strict()
      .default({ name: 'auto', root: '.' }),
    reports: z
      .object({
        directory: z.string().min(1).default('.shipshield/reports'),
        formats: z.array(z.enum(['json', 'markdown'])).min(1).default(['json', 'markdown']),
        retain: z.number().int().min(1).max(500).default(20),
      })
      .strict()
      .default({
        directory: '.shipshield/reports',
        formats: ['json', 'markdown'],
        retain: 20,
      }),
    scan: z
      .object({
        secrets: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
        dependencies: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
        containers: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
        iac: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
      })
      .strict()
      .default({
        secrets: { enabled: true },
        dependencies: { enabled: true },
        containers: { enabled: true },
        iac: { enabled: true },
      }),
    policy: z
      .object({
        fail_on: z.array(SeveritySchema).default(['critical', 'high']),
        fail_on_incomplete: z.boolean().default(true),
      })
      .strict()
      .default({
        fail_on: ['critical', 'high'],
        fail_on_incomplete: true,
      }),
    execution: z
      .object({
        timeout_seconds: z.number().int().min(5).max(3600).default(600),
        max_parallel_scanners: z.number().int().min(1).max(16).default(4),
        network: z.enum(['allow', 'deny']).default('allow'),
        exclude: z
          .array(z.string())
          .default(['.git/**', 'node_modules/**', 'vendor/**', 'dist/**', '.shipshield/**']),
      })
      .strict()
      .default({
        timeout_seconds: 600,
        max_parallel_scanners: 4,
        network: 'allow',
        exclude: ['.git/**', 'node_modules/**', 'vendor/**', 'dist/**', '.shipshield/**'],
      }),
  })
  .strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
