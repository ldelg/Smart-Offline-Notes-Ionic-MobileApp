# Smart Offline Notes

Offline speech-to-notes mobile app built with Ionic, Angular, and Capacitor.

## Download APK

Installable Android APK files are published in the GitHub Releases page for this repository.

Do not download app binaries from the repository contents. The repository stores source code; release builds are attached to GitHub Releases.

Release assets should include a signed APK file such as `app-release-signed.apk`.

## Local Development

From `frontend/`:

```powershell
npm run build
npx cap sync android
```

Then open `frontend/android` in Android Studio and run the app on a device or emulator.
