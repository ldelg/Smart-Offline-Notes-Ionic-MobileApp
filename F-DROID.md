# F-Droid Submission

## Status

- Application ID: `io.ldelg.smartofflinenotes` (updated from `io.ionic.starter`)
- Metadata: `metadata.yml` configured
- License: MIT
- Repository: https://github.com/ldelg/Smart-Offline-Notes-Ionic-MobileApp

## Release Tag

F-Droid requires a git tag for the build. Create with:

```bash
git tag -a v1.0 -m "Release version 1.0"
git push origin v1.0
```

## Screenshots

Optional. Place in `fastlane/metadata/android/en-US/images/phoneScreenshots/`

- Format: PNG/JPEG
- Naming: `1.png`, `2.png`, etc.
- Resolution: 1080x1920 (portrait) or 1920x1080 (landscape)

## Build Configuration

Metadata configured for:

- Build system: Gradle
- Prebuild: `npm ci && npm run build && npx cap sync android`
- Build: `./gradlew assembleRelease`
- Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

## References

- F-Droid Docs: https://f-droid.org/en/docs/
- Metadata Reference: https://f-droid.org/en/docs/Build_Metadata_Reference/
