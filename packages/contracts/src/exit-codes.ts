export const EXIT_CODES = {
  PASSED: 0,
  POLICY_FAILED: 1,
  USAGE_ERROR: 2,
  CONFIGURATION_ERROR: 3,
  INCOMPLETE: 4,
  REPORT_ERROR: 5,
  FIX_ERROR: 6,
  INTERNAL_ERROR: 10,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type CanonicalOutcome =
  | 'passed'
  | 'policy_failed'
  | 'incomplete'
  | 'configuration_error'
  | 'usage_error'
  | 'report_error'
  | 'fix_error'
  | 'internal_error';

export function outcomeToExitCode(outcome: CanonicalOutcome): ExitCode {
  switch (outcome) {
    case 'passed':
      return EXIT_CODES.PASSED;
    case 'policy_failed':
      return EXIT_CODES.POLICY_FAILED;
    case 'usage_error':
      return EXIT_CODES.USAGE_ERROR;
    case 'configuration_error':
      return EXIT_CODES.CONFIGURATION_ERROR;
    case 'incomplete':
      return EXIT_CODES.INCOMPLETE;
    case 'report_error':
      return EXIT_CODES.REPORT_ERROR;
    case 'fix_error':
      return EXIT_CODES.FIX_ERROR;
    case 'internal_error':
      return EXIT_CODES.INTERNAL_ERROR;
  }
}
