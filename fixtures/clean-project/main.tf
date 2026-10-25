resource "aws_s3_bucket" "clean_bucket" {
  bucket = "acme-clean-storage"
}

resource "aws_s3_bucket_public_access_block" "clean_bucket_pab" {
  bucket = aws_s3_bucket.clean_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
