import os, json, hashlib, subprocess, re

files = subprocess.check_output(['git', 'ls-files']).decode().strip().split('\n')

# Get git repo identity
commit_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
commit_msg = subprocess.check_output(['git', 'log', '-1', '--pretty=%B']).decode().strip()
commit_date = subprocess.check_output(['git', 'log', '-1', '--pretty=%cd', '--date=iso']).decode().strip()
author_name = subprocess.check_output(['git', 'log', '-1', '--pretty=%an']).decode().strip()
author_email = subprocess.check_output(['git', 'log', '-1', '--pretty=%ae']).decode().strip()
remote_url = subprocess.check_output(['git', 'remote', 'get-url', 'origin']).decode().strip()
branch = subprocess.check_output(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).decode().strip()

print(f"Auditing commit: {commit_sha}")
print(f"Date: {commit_date}")
print(f"Files: {len(files)}")
