resource "aws_s3_bucket" "insecure_public_bucket" {
  bucket = "acme-insecure-public-data"
}
