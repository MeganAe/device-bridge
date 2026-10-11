# Third-party components

Builds bundle the official Android SDK Platform-Tools 37.0.1 package for the target operating system so Device Bridge can use ADB for device discovery, pairing, file operations and companion-app installation. The upstream archive is downloaded over HTTPS from `https://dl.google.com/android/repository/` and checked against the SHA-1 value published in Google's Android SDK repository metadata before extraction. The package's upstream notices are retained in the bundled resources.

- **Android SDK Platform-Tools / ADB:** Android Open Source Project and Google. See the official [Platform-Tools release notes](https://developer.android.com/tools/releases/platform-tools) and the notices/license files shipped with the package.

The project does not bundle a third-party screen-mirroring executable. The MIT license applies only to original Device Bridge code and does not replace the licenses or terms accompanying Android Platform-Tools.
