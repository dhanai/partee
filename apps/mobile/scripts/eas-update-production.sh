#!/usr/bin/env bash
# Publish EAS Update to production for iOS and Android only (default `eas update`
# bundles web too, which fails on react-native-google-mobile-ads).
set -euo pipefail
cd "$(dirname "$0")/.."
MSG="${1:-Production OTA}"
npx eas-cli update --channel production --message "$MSG" --platform ios --non-interactive
npx eas-cli update --channel production --message "$MSG" --platform android --non-interactive
