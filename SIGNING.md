# Code-signing ChurchOS (Windows)

> Owner: Platform / Release &nbsp;|&nbsp; Last reviewed: 2026-06-24

The installer is built by `npm run dist:win` (electron-builder → NSIS + portable).
Until it is **code-signed**, Windows SmartScreen shows non-technical parish staff a
scary *"Windows protected your PC — unknown publisher"* dialog on first launch. Signing
removes that. Nothing in the code needs to change — signing is driven entirely by two
environment variables that electron-builder reads automatically.

## What you need
A **Windows code-signing certificate** from a CA (e.g. Sectigo, DigiCert, SSL.com).
Two tiers:

| Tier | SmartScreen behaviour | Storage |
|------|-----------------------|---------|
| **OV** (Organization Validation) | Warning fades after the app builds download "reputation" | `.pfx` file + password |
| **EV** (Extended Validation) | **Trusted immediately** — no warning, no reputation wait | Hardware token / cloud HSM |

For a product you're selling to dioceses, **EV is worth it** — the very first install
on a parish PC is clean, which is exactly the moment that builds trust. (As of 2023 all
new OV/EV certs are issued on hardware tokens or via a cloud signing service; a plain
`.pfx` on disk only applies to older OV certs or your own test certs.)

## Signing with a `.pfx` (OV / test cert)
electron-builder auto-signs when these are set — no `package.json` change required:

```bash
# PowerShell
$env:CSC_LINK = "C:\path\to\churchos-cert.pfx"     # or a base64 string of the .pfx
$env:CSC_KEY_PASSWORD = "the-pfx-password"
npm run dist:win
```

The signed installer lands in `release/ChurchOS-Setup-<version>.exe`. electron-builder
RFC3161-timestamps it by default, so signatures stay valid after the cert expires.

## Signing with an EV cert (hardware token / cloud HSM)
The private key can't be exported, so you don't use `CSC_LINK`. Instead point
electron-builder at the token's signing tool. Add to `package.json` → `build.win`
**only when you have the token**:

```jsonc
"win": {
  "certificateSubjectName": "Your Parish Software Inc",   // exact CN on the EV cert
  "signingHashAlgorithms": ["sha256"]
}
```
Then `npm run dist:win` with the token plugged in (it prompts for the token PIN).
For a cloud signing service (Azure Trusted Signing, SSL.com eSigner), follow their
electron-builder integration — usually a custom `sign` hook or their CLI as the signtool.

## Verify a build is signed
```powershell
signtool verify /pa /v "release\ChurchOS-Setup-<version>.exe"
# or
Get-AuthenticodeSignature "release\ChurchOS-Setup-<version>.exe" | Format-List
```
A signed file shows `Status: Valid` and your organization as the signer.

## Why this matters for auto-update (later)
When ChurchOS gains auto-update (`electron-updater`), the updater **verifies the
signature of each downloaded update** before applying it. So:
- updates must be signed by the **same** certificate, and
- code-signing becomes a hard requirement, not just a nicety.
Sign first; wire auto-update second.

## Test-only self-signed cert (internal QA, NOT for parishes)
```powershell
$c = New-SelfSignedCertificate -Type CodeSigning -Subject "CN=ChurchOS Test" -CertStoreLocation Cert:\CurrentUser\My
$pw = ConvertTo-SecureString "test123" -AsPlainText -Force
Export-PfxCertificate -Cert $c -FilePath churchos-test.pfx -Password $pw
```
A self-signed cert silences nothing on other machines — it only proves the signing
pipeline works end to end before you buy the real cert.
