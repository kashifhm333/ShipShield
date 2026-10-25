import { createTwoFilesPatch } from 'diff';
import { NormalizedFinding } from '@shipshield/contracts';
import { FixHandler, FixProposal } from '../fix-registry.js';

export class TerraformS3PublicAccessHandler implements FixHandler {
  public readonly strategyId = 'terraform-s3-public-access';
  public readonly supportedRuleIds = ['CKV_AWS_20', 'CKV_AWS_53'];
  public readonly category = 'iac' as const;

  public async planFix(
    finding: NormalizedFinding,
    fileContent: string,
    fileSha256: string
  ): Promise<FixProposal | null> {
    const resourceAddr = finding.location.resource_address || '';
    // resource address format usually: aws_s3_bucket.example
    const parts = resourceAddr.split('.');
    const bucketResourceName = parts.length > 1 ? parts[1] : 'this';

    const publicAccessBlock = [
      '',
      `# Added by ShipShield automated security remediation: block public access for S3 bucket`,
      `resource "aws_s3_bucket_public_access_block" "${bucketResourceName}_public_access_block" {`,
      `  bucket = ${resourceAddr ? resourceAddr + '.id' : 'aws_s3_bucket.this.id'}`,
      '',
      `  block_public_acls       = true`,
      `  block_public_policy     = true`,
      `  ignore_public_acls      = true`,
      `  restrict_public_buckets = true`,
      `}`,
      '',
    ].join('\n');

    const patchedContent = fileContent.trimEnd() + '\n' + publicAccessBlock;
    const unifiedDiff = createTwoFilesPatch(
      finding.location.path,
      finding.location.path,
      fileContent,
      patchedContent,
      'original',
      'shipshield-fix'
    );

    return {
      findingId: finding.id,
      fingerprint: finding.fingerprint,
      targetRelativePath: finding.location.path,
      originalFileSha256: fileSha256,
      originalContent: fileContent,
      patchedContent,
      unifiedDiff,
      description: `Attach aws_s3_bucket_public_access_block to enforce public access block on ${resourceAddr || 'bucket'}.`,
    };
  }
}
