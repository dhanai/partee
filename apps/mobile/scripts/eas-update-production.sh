#!/usr/bin/env bash
# Publish EAS Update to production for iOS and Android only (default `eas update`
# bundles web too, which fails on react-native-google-mobile-ads).
set -euo pipefail
cd "$(dirname "$0")/.."
# Expo CLI expects CI=1 for non-interactive mode (replaces deprecated --non-interactive).
export CI=1
MSG="${1:-Production OTA}"
npx eas-cli update --channel production --message "$MSG" --platform ios
npx eas-cli update --channel production --message "$MSG" --platform android
