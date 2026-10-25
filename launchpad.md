# ShipShield — Ubuntu Launchpad PPA Release Guide

A complete, production-grade, step-by-step operational handbook for uploading **ShipShield** to **Ubuntu Launchpad** ([launchpad.net](https://launchpad.net)).

---

## Table of Contents

1. [Understanding the Launchpad Ingestion Model](#1-understanding-the-launchpad-ingestion-model)
2. [Release Coordinates & Package Information](#2-release-coordinates--package-information)
3. [Phase 1: Account, GPG Key & System Prerequisites](#phase-1-account-gpg-key--system-prerequisites)
   - [1.1 Install Packaging & Upload Utilities](#11-install-packaging--upload-utilities)
   - [1.2 Create a Launchpad Account](#12-create-a-launchpad-account)
   - [1.3 Create Your Personal Package Archive (PPA)](#13-create-your-personal-package-archive-ppa)
   - [1.4 Generate or Locate Your GPG Secret Key](#14-generate-or-locate-your-gpg-secret-key)
   - [1.5 Export Your Public Key to Ubuntu Keyserver](#15-export-your-public-key-to-ubuntu-keyserver)
   - [1.6 Register and Confirm Your GPG Key on Launchpad](#16-register-and-confirm-your-gpg-key-on-launchpad)
4. [Phase 2: Generating the Production Release Artifacts](#phase-2-generating-the-production-release-artifacts)
   - [2.1 Verify Test Suite Health](#21-verify-test-suite-health)
   - [2.2 Execute the Packaging Pipeline](#22-execute-the-packaging-pipeline)
   - [2.3 Inspect Generated Artifacts](#23-inspect-generated-artifacts)
5. [Phase 3: Cryptographic Signing with GPG (`debsign`)](#phase-3-cryptographic-signing-with-gpg-debsign)
   - [3.1 Set Environment Variables](#31-set-environment-variables)
   - [3.2 Sign the Source Package](#32-sign-the-source-package)
   - [3.3 Validate the GPG Signature](#33-validate-the-gpg-signature)
6. [Phase 4: Uploading to Launchpad PPA (`dput`)](#phase-4-uploading-to-launchpad-ppa-dput)
   - [4.1 Configure `dput`](#41-configure-dput)
   - [4.2 Upload the Source Package](#42-upload-the-source-package)
7. [Phase 5: Monitoring the Build & Package Publication](#phase-5-monitoring-the-build--package-publication)
   - [5.1 Review the Acceptance Email](#51-review-the-acceptance-email)
   - [5.2 Monitor the Build Status on Launchpad](#52-monitor-the-build-status-on-launchpad)
8. [Phase 6: Verifying User Installation via APT](#phase-6-verifying-user-installation-via-apt)
9. [Phase 7: Critical Versioning Rule for Subsequent Uploads](#phase-7-critical-versioning-rule-for-subsequent-uploads)

---

## 1. Understanding the Launchpad Ingestion Model

Before starting, it is vital to understand how Ubuntu Launchpad works:

- **Launchpad NEVER accepts pre-compiled `.deb` binary packages from users.**
- Launchpad strictly accepts **Debian Source Packages** (composed of `.dsc`, `.orig.tar.gz`, `.debian.tar.xz`, and `_source.changes`).
- Once received, Launchpad's automated build farm allocates an isolated, network-disconnected builder environment (chroot/LXD container), extracts the source, installs declared `Build-Depends`, and compiles the `.deb` binary package itself.
- For this reason, ShipShield's packaging pipeline bundles the pre-compiled code and production runtime dependencies into the upstream source archive (`.orig.tar.gz`), allowing Launchpad to build the package 100% offline without needing internet access.

---

## 2. Release Coordinates & Package Information

| Property | Value |
| :--- | :--- |
| **Package Name** | `shipshield` |
| **Target Ubuntu Series** | `noble` (Ubuntu 24.04 LTS) |
| **Target Architecture** | `all` (portable JavaScript bytecode / Node.js runtime) |
| **Initial Release Version** | `1.0.0-1~ubuntu24.04.1` |
| **Upstream Version** | `1.0.0` |
| **Package License** | Apache-2.0 |
| **Maintainer Identity** | `Kashif Memon <Kashifjaanmemon786110@gmail.com>` |

---

## Phase 1: Account, GPG Key & System Prerequisites

### 1.1 Install Packaging & Upload Utilities

On your Ubuntu workstation, ensure all necessary Debian packaging tools are installed:

```bash
sudo apt update
sudo apt install -y devscripts dput debhelper dpkg-dev gnupg
```

---

### 1.2 Create a Launchpad Account

1. Open your browser and navigate to: **[https://launchpad.net/+login](https://launchpad.net/+login)**
2. Log in using your **Ubuntu One** single sign-on (SSO) account. If you don't have one, create a free account.
3. Note your **Launchpad Username** (e.g., `kashifhm333`).

---

### 1.3 Create Your Personal Package Archive (PPA)

1. Navigate to your user profile page on Launchpad:
   ```
   https://launchpad.net/~<YOUR_LAUNCHPAD_USERNAME>
   ```
2. Click on **Create a new PPA** (or navigate to `https://launchpad.net/~<YOUR_LAUNCHPAD_USERNAME>/+newppa`).
3. Fill in the details:
   - **PPA Name**: `shipshield` (or your preferred name)
   - **Display name**: `ShipShield Security Gate PPA`
   - **Description**: `Official Ubuntu PPA for ShipShield local-first DevSecOps security gate platform.`
4. Click **Activate**.
5. Your PPA target identifier is now:
   ```
   ppa:<YOUR_LAUNCHPAD_USERNAME>/shipshield
   ```
   *(e.g., `ppa:kashifhm333/shipshield`)*

---

### 1.4 Generate or Locate Your GPG Secret Key

Launchpad requires uploaded source packages to be digitally signed by a GPG private key registered to your account.

#### Option A: If you already have a GPG key
List your secret keys:
```bash
gpg --list-secret-keys --keyid-format long
```

Look for output similar to:
```
sec   rsa4096/8A7B6C5D4E3F2A10 2026-01-01 [SC]
      E2B04B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A
uid                 [ultimate] Kashif Memon <Kashifjaanmemon786110@gmail.com>
ssb   rsa4096/1A2B3C4D5E6F7A8B 2026-01-01 [E]
```
- In this example, your **Key ID** is: `8A7B6C5D4E3F2A10`
- Your **Fingerprint** is: `E2B04B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A`

#### Option B: If you need to create a new GPG key
Run:
```bash
gpg --full-generate-key
```
Select:
1. Kind of key: `(1) RSA and RSA`
2. Keysize: `4096`
3. Expiration: `0` (does not expire) or your preference
4. Real name: `Kashif Memon`
5. Email address: `Kashifjaanmemon786110@gmail.com` *(must match your Launchpad email!)*
6. Set a secure passphrase when prompted.

---

### 1.5 Export Your Public Key to Ubuntu Keyserver

Launchpad retrieves your public key from the Ubuntu keyserver to verify package signatures:

```bash
gpg --keyserver keyserver.ubuntu.com --send-keys <YOUR_GPG_KEY_ID>
```
*(e.g., `gpg --keyserver keyserver.ubuntu.com --send-keys 8A7B6C5D4E3F2A10`)*

> **Note**: It may take 5–15 minutes for the keyserver to sync globally.

---

### 1.6 Register and Confirm Your GPG Key on Launchpad

1. Open: **[https://launchpad.net/~/+editpgpkeys](https://launchpad.net/~/+editpgpkeys)**
2. Copy your 40-character GPG fingerprint:
   ```bash
   gpg --fingerprint <YOUR_EMAIL>
   ```
3. Paste the fingerprint into the **Fingerprint** field and click **Import Key**.
4. Launchpad will fetch your key from `keyserver.ubuntu.com` and generate an encrypted validation token.
5. Launchpad will send an **encrypted email** to your registered email address with subject:
   `Confirm OpenPGP key on launchpad.net`
6. Check your email. Save the email text or pipe it to `gpg --decrypt`:
   ```bash
   # Copy the PGP MESSAGE block into a file token.asc and run:
   gpg --decrypt token.asc
   ```
7. Inside the decrypted text, find the confirmation link (e.g., `https://launchpad.net/token/...`).
8. Open the confirmation link in your browser to finalize key registration.

---

## Phase 2: Generating the Production Release Artifacts

### 2.1 Verify Test Suite Health

Before building the release package, verify that all 137 unit and integration tests pass:

```bash
npm run typecheck
npm run lint
npm test
```
All 15 test files should report **PASS**.

---

### 2.2 Execute the Packaging Pipeline

Run the automated packaging script from the repository root:

```bash
./packaging/build-deb.sh
```

This single command will automatically:
1. Reconcile versions across `package.json`, `@shipshield/contracts`, and `debian/changelog`.
2. Compile all TypeScript monorepo packages.
3. Build the local test `.deb` binary package (`dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb`).
4. Assemble the clean upstream source archive with bundled dependencies (`dist-deb/shipshield_1.0.0.orig.tar.gz`).
5. Build the Debian source package (`dist-deb/shipshield_1.0.0-1~ubuntu24.04.1.dsc` and `dist-deb/shipshield_1.0.0-1~ubuntu24.04.1.debian.tar.xz`).
6. Generate the Launchpad upload changes file (`dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes`).
7. Generate cryptographic SHA-256 checksums (`dist-deb/SHA256SUMS`).

---

### 2.3 Inspect Generated Artifacts

Verify that all 5 release files are present in `dist-deb/`:

```bash
ls -lh dist-deb/
```

Expected output:
```
-rw-rw-r-- 1 user user  532 B dist-deb/SHA256SUMS
-rw-r--r-- 1 user user 545K   dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb
-rw-rw-r-- 1 user user 4.8K   dist-deb/shipshield_1.0.0-1~ubuntu24.04.1.debian.tar.xz
-rw-rw-r-- 1 user user 1.0K   dist-deb/shipshield_1.0.0-1~ubuntu24.04.1.dsc
-rw-rw-r-- 1 user user 1.8K   dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes
-rw-rw-r-- 1 user user 1.6M   dist-deb/shipshield_1.0.0.orig.tar.gz
```

Verify cryptographic checksums:
```bash
cd dist-deb && sha256sum -c SHA256SUMS && cd ..
```
All files must report `OK`.

---

## Phase 3: Cryptographic Signing with GPG (`debsign`)

Launchpad strictly rejects any upload whose `.dsc` and `_source.changes` files are not signed by a registered GPG key.

### 3.1 Set Environment Variables

Set your maintainer identity in your current shell session:

```bash
export DEBFULLNAME="Kashif Memon"
export DEBEMAIL="Kashifjaanmemon786110@gmail.com"
```

---

### 3.2 Sign the Source Package

Sign both the `.dsc` and `.changes` file with your GPG key ID:

```bash
debsign -k <YOUR_GPG_KEY_ID> dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes
```
*(e.g., `debsign -k 8A7B6C5D4E3F2A10 dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes`)*

Enter your GPG passphrase when prompted.

---

### 3.3 Validate the GPG Signature

Confirm that the cryptographic signature is valid:

```bash
dscverify dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes
```

Expected output confirms:
```
Validation FAILED: ... (None)
Signature is valid.
```

---

## Phase 4: Uploading to Launchpad PPA (`dput`)

### 4.1 Configure `dput`

`dput` uses standard settings built into Ubuntu. To ensure clean defaults, verify or create `~/.dput.cf`:

```ini
[DEFAULT]
default_host_main = ppa

[ppa]
fqdn = ppa.launchpad.net
method = ftp
incoming = ~%(ppa)s/ubuntu
login = anonymous
```

---

### 4.2 Upload the Source Package

Upload the **signed `_source.changes` file** (not the `.deb` file!) using `dput`:

```bash
dput ppa:<YOUR_LAUNCHPAD_USERNAME>/shipshield dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes
```

*Example command:*
```bash
dput ppa:kashifhm333/shipshield dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes
```

Expected output:
```
Checking signature on .changes
gpg: Good signature from "Kashif Memon <Kashifjaanmemon786110@gmail.com>"
Good signature on /path/to/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_source.changes.
Checking signature on .dsc
gpg: Good signature from "Kashif Memon <Kashifjaanmemon786110@gmail.com>"
Good signature on /path/to/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1.dsc.
Uploading to ppa (via ftp to ppa.launchpad.net):
  Uploading shipshield_1.0.0-1~ubuntu24.04.1.dsc: done.
  Uploading shipshield_1.0.0.orig.tar.gz: done.
  Uploading shipshield_1.0.0-1~ubuntu24.04.1.debian.tar.xz: done.
  Uploading shipshield_1.0.0-1~ubuntu24.04.1_source.changes: done.
Successfully uploaded packages.
```

---

## Phase 5: Monitoring the Build & Package Publication

### 5.1 Review the Acceptance Email

Within 2–5 minutes of upload, Launchpad sends an automated notification email with the subject:
```
[PPA <username>/shipshield] shipshield 1.0.0-1~ubuntu24.04.1_source.changes ACCEPTED
```
If you receive a rejection email instead, read the error message carefully (most rejections are due to key mismatch or version reuse; see Phase 7).

---

### 5.2 Monitor the Build Status on Launchpad

1. Open your PPA page:
   ```
   https://launchpad.net/~<YOUR_LAUNCHPAD_USERNAME>/+archive/ubuntu/shipshield
   ```
2. Click on **View package details** and expand `shipshield`.
3. Click on the build status link under the **Builds** column.
4. Launchpad will display:
   - **Status**: `Needs building` ➔ `Building` ➔ `Successfully built`
   - **Architecture**: `all` (built on amd64 chroot)
   - **Build log**: Live terminal output of `debian/rules binary`
5. Once complete, Launchpad changes status to **Published**.

---

## Phase 6: Verifying User Installation via APT

Once the package status is **Published**, test installation on any clean Ubuntu 24.04 LTS system:

### 1. Add PPA & Update APT
```bash
sudo add-apt-repository ppa:<YOUR_LAUNCHPAD_USERNAME>/shipshield
sudo apt update
```

### 2. Install ShipShield
```bash
sudo apt install -y shipshield
```

### 3. Verify System Operation
```bash
# Verify version output
shipshield --version

# Run diagnostic check
shipshield doctor

# View manpage
man shipshield

# Run local scan
shipshield scan .
```

---

## Phase 7: Critical Versioning Rule for Subsequent Uploads

> ⚠️ **MANDATORY LAUNCHPAD IMMUTABILITY RULE**:
> Launchpad PPA will **NEVER** overwrite or accept a package version that has previously been accepted by the archive. If you re-upload `1.0.0-1~ubuntu24.04.1`, Launchpad will immediately reject it with:
> `Rejected: File ... already exists in PPA`.

### How to Increment Versions for Subsequent Updates:

Whenever you modify code or packaging and need to upload a new release candidate:

1. **Packaging Fix (same upstream code, packaging iteration)**:
   Increment the Debian revision in `debian/changelog`:
   `1.0.0-1~ubuntu24.04.1` ➔ `1.0.0-1~ubuntu24.04.2`

   Using `dch` (Debian Change Log helper):
   ```bash
   dch -v 1.0.0-1~ubuntu24.04.2 -D noble "Packaging fix: updated launcher and rules."
   ```

2. **New Upstream Version (new features, new code)**:
   Update version in `package.json` and `packages/contracts/src/version.ts` (e.g., `1.0.1`):
   ```bash
   dch -v 1.0.1-1~ubuntu24.04.1 -D noble "New upstream release 1.0.1."
   ```

3. **Re-run the Packaging Pipeline**:
   ```bash
   ./packaging/build-deb.sh
   ```

4. **Re-sign and Upload**:
   ```bash
   debsign -k <YOUR_GPG_KEY_ID> dist-deb/shipshield_<NEW_VERSION>_source.changes
   dput ppa:<YOUR_LAUNCHPAD_USERNAME>/shipshield dist-deb/shipshield_<NEW_VERSION>_source.changes
   ```
