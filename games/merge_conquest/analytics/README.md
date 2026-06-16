# GameAnalytics

This folder contains the local GameAnalytics JavaScript SDK and per-game config.

To activate tracking, set `enabled: true`, `gameKey`, and `gameSecret` in
`gameanalytics-config.js`. Keep Battle Merge and Merge Guns as separate
GameAnalytics games so their funnels do not mix.

The SDK file is vendored from `gameanalytics@4.4.7` and has SDK logging calls
redirected to no-op functions to keep Yandex production builds free of debug
output.
