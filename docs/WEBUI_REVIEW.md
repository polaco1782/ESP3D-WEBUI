# (better) ESP3D: printer workspace review

## Findings and changes

| Problem | Change |
| --- | --- |
| Print action absent on ESP32 direct SD | Detect advertised direct SD without requiring the absent `Streaming` property. Show a labeled Print button for printable files. |
| Direct SD command incompatible with this ESP3D build | Use `[ESP700]/SD/<path>`; preserve HTTP `/sd` download URLs. |
| Pause/resume/cancel commands omit `action=` | Correct ESP701 controls and expose them beside current print status. |
| Printing relies on terminal status or optional polling | Poll ESP701 while the workspace is open, independent of temperature-polling preferences. |
| Icon-only upload controls hidden in a menu | Visible Upload G-code, Refresh, New folder, file search and readable storage labels. |
| Equal-sized unrelated panels bury job controls | Print, Prepare, Temperatures and Console tabs with a dedicated current-job card. |
| Flat purple styling obscures action priority | Teal primary actions, warm temperature accents, explicit red emergency action, status labels plus icons and responsive cards. |
| Idle and fault states can look identical | Validate status replies; disable print on missing status, active jobs and stream faults. Retain job details across string-only pause replies. |
| Queued commands confused with elapsed print time | Show acknowledged file progress; do not invent ETA or claim motion completion from file percentages. |

The visible name is **(better) ESP3D**. Firmware names, hostnames, endpoints and network identity are unchanged.

## Workflow

1. Open Print. The ESP32 SD card is selected automatically when advertised.
2. Upload G-code, or refresh after an Orca upload. Search or navigate folders.
3. Choose Print beside a file and confirm the named job.
4. Use Pause / Resume / Cancel in Current print. Start and file mutations are disabled while streaming.
5. Use Prepare for manual controls, Temperatures for charts and heater controls, Console for diagnostics. Manual preparation / heating controls are disabled during streams.

This workspace's job controls target **ESP32 direct SD streaming**. Other storage selections remain available for file management; printer-native SD jobs are not represented by ESP701. The pre-existing generic dashboard remains for non-Marlin targets.

Pause waits for accepted commands and leaves heaters on. Cancel drains accepted moves before the firmware's heater/fan shutdown. Emergency stop submits M112 at the front of the HTTP queue, without a confirmation delay; a failed HTTP link still requires physical intervention. It cannot guarantee delivery through an unresponsive network.

Temperature values are the latest received values. Idle M105 queries populate the summary even when optional polling is disabled. During streaming, live values depend on the printer's own temperature reports. The pre-existing 409 polling guard is preserved.

## Local development and verification

- `npm ci --no-audit --no-fund`
- `npm run dev-printer-marlin` — local mock ESP3D on port 8080, UI on 8088, mock WebSocket on 8089. Bound to loopback; no physical printer proxy.
- `npm run printer-marlin` — `dist/Printer3D/Marlin/index.html.gz` and `.br`.
- `node tools/check_print_workflow.mjs` — SD paths, invalid commands, progress, paused/transitional replies, faults and malformed responses.
- `node tools/check_stream_polling.mjs` — existing polling regression checks.

Browser verification with the mock: start confirmation, print/locking, pause, resume, cancellation, file search, temperature-tab navigation, emergency command dispatch and UI lockout. A 390-pixel iframe preview checks responsive layout. The mock supports multiple review tabs and mutable print status, instead of always claiming an arbitrary file is printing.

The initial development baseline already contained polling changes in httpAdapter, HttpQueueContext, useHttpQueue, useSettings, streamPollingGuard and check_stream_polling. These are retained. After the local review, the WebUI was deployed to an ESP32 on 2026-10-26. The served bundle was verified byte-for-byte and the browser showed the connected dashboard, real SD files, Print buttons and live temperatures. Existing preferences were preserved during deployment. No physical print was started to validate the redesigned controls; start/pause/resume/cancel were exercised against the local mock. See [installation and printing](BETTER_ESP3D.md).
