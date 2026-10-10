# Third-party components

Release builds fetch the official, version-pinned scrcpy archive for the target operating system and preserve its files—including its bundled `adb` executable, server, libraries and upstream license file—in the application resources.

- **scrcpy:** Genymobile / Romain Vimont, Apache License 2.0. Official source and release packages: <https://github.com/Genymobile/scrcpy>.
- **ADB:** the executable is supplied inside the official scrcpy release bundle. ADB is an Android Open Source Project component; consult the notices and license terms accompanying the bundled upstream package and the relevant AOSP sources.

The build script verifies the archive against the release’s `SHA256SUMS.txt` before extraction. It does not modify the extracted binaries. Review all third-party licenses and notices for each upstream version before publishing a release; the project’s MIT license applies only to original Device Bridge code and does not replace upstream terms.
