# Release Checklist

TASK desktop releases are built by `.github/workflows/app-release.yml` when a `v*` tag is pushed or the workflow is run manually.

## Required GitHub Secrets

These secrets are required before publishing a release:

- `TAURI_SIGNING_PRIVATE_KEY`: Tauri updater private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password for the Tauri updater private key, if one was configured.
- `APPLE_CERTIFICATE`: Base64 encoded `.p12` certificate containing a Developer ID Application certificate.
- `APPLE_CERTIFICATE_PASSWORD`: Password for the `.p12` certificate.
- `KEYCHAIN_PASSWORD`: Temporary CI keychain password.
- `APPLE_ID`: Apple Developer account email used for notarization.
- `APPLE_PASSWORD`: App-specific password for the Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

## macOS Notes

GitHub-downloaded macOS apps must be signed with a Developer ID Application certificate and notarized by Apple. If the release is unsigned or not notarized, Gatekeeper can show the app as damaged and refuse to open it.

The release workflow now fails the macOS release job when signing or notarization secrets are missing, so a broken DMG is not published accidentally.
