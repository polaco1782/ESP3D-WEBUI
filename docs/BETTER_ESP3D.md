# (better) ESP3D: installation and printing

A clearer Marlin printer workspace built on ESP3D-WEBUI 3.1. The name describes this fork's interface; ESP3D firmware, endpoints and network identity retain their existing names.

## Requirements and scope

- ESP3D 3.1 with a direct ESP32 SD connection and G-code host streaming enabled.
- A Marlin printer connected to ESP3D's serial transport.
- Firmware supporting `[ESP700]/SD/<path>` and `[ESP701]json=yes`. The redesigned controls are developed with the buffered Marlin transport in the [companion ESP3D fork](https://github.com/polaco1782/ESP3D). Check that your installed firmware includes the matching job-control implementation.

The UI does not add buffering, acknowledgments or resend recovery to the firmware. Printer-native SD printing and other targets are outside this workspace's job-control scope. File storage and the other targets' existing dashboards remain available.

## Build and local preview

Use Node.js 24 and the repository lockfile:

```sh
npm ci --no-audit --no-fund
npm run dev-printer-marlin
```

Open `http://localhost:8088/#/dashboard`. The mock HTTP server uses port 8080 and its WebSocket uses 8089; all bind to loopback. Mock job actions do not move or heat a physical printer.

```sh
node tools/check_print_workflow.mjs
node tools/check_stream_polling.mjs
npm run printer-marlin
```

Install `dist/Printer3D/Marlin/index.html.gz`. All main-interface HTML, CSS, JavaScript and icons are in that one file. The generated `.br` is an alternative compression artifact; it is not needed for ESP3D's gzip installation.

## Install on ESP3D

1. Wait until the printer is idle and ESP3D has no active stream.
2. Back up the existing Flash files, especially `index.html.gz` and `preferences.json`.
3. Check Flash capacity, including filesystem overhead and room to save preferences. The SD card's free space does not increase internal Flash capacity.
4. Use the existing WebUI's Flash upload controls or ESP3D's built-in recovery page at `/?forcefallback=yes` to replace `/index.html.gz`.
5. Reload the root dashboard. Confirm connection, SD files and temperature reports before starting a job.

Do not format Flash for a WebUI update. Preserve `preferences.json`: it holds editable options such as polling, console filters and default storage. An SD card is needed for direct SD print files, but the main WebUI itself lives in Flash.

### Small Flash partitions

For a 128 KiB filesystem, stronger gzip compression can help. After building, the following uses the Zopfli dependency already installed with this project's development dependencies. It verifies that decompression is unchanged before replacing the generated gzip:

```sh
node <<'JS'
const fs = require("fs")
const zlib = require("zlib")
const zopfli = require("@gfx/zopfli")
const file = "dist/Printer3D/Marlin/index.html.gz"
const html = zlib.gunzipSync(fs.readFileSync(file))
zopfli.gzip(html, { numiterations: 30 }, (error, compressed) => {
    if (error) throw error
    if (!zlib.gunzipSync(compressed).equals(html)) throw new Error("Content mismatch")
    fs.writeFileSync(file, compressed)
    console.log(`${file}: ${compressed.length} bytes`)
})
JS
```

The reviewed build was 109,132 bytes with standard gzip and 104,716 bytes with Zopfli. Sizes change as the source changes. Keep sufficient space for filesystem metadata and preference updates.

On the deployment used for this review, the optional camera page was moved to SD with a small Flash redirect, and the tool page was replaced by a link to the firmware's built-in recovery UI. The original pages were backed up. This is a device-specific space-saving arrangement, not a dependency or required installation step. The camera page then requires the SD card to be available; the main dashboard and built-in recovery do not.

## Start and control a print

1. Slice the model, then upload the G-code to the **ESP32 SD card**, either through Orca's ESP3D integration or **Upload G-code**.
2. Open **Print** and refresh the list after an Orca upload.
3. Choose **Print** beside the file. Check the filename and printer, then confirm **Start print**.
4. Follow **Current print**. Progress represents acknowledged file commands, not an estimate of elapsed time.

| Control | Behavior with the companion buffered transport |
| --- | --- |
| Pause | Drains accepted commands and keeps heaters on. Heating or other blocking commands may delay the paused state. |
| Resume | Continues the paused stream. |
| Cancel print | Requests cooperative cancellation; accepted moves finish before heater and fan shutdown. |
| Emergency stop | Prioritizes an `M112` request and locks the workspace. Reset the printer and ESP3D before another job. Delivery still depends on the HTTP connection. |

During a stream, preparation and heating controls are disabled. The temperature summary shows the latest received readings; updates depend on printer reports while ESP3D owns the serial connection. Faults or unavailable status prevent starting another job.

## Validation

- Production Marlin build and local print-workflow/polling regression checks passed.
- Browser mock checks covered start confirmation, file locking, pause, resume, cancellation, search, temperature navigation and emergency-command dispatch. A 390-pixel preview checked mobile layout.
- On 2026-10-26, deployment verification confirmed matching served bytes, preserved preferences, connection status, real SD file listings and live temperatures.
- Physical printing through the redesigned controls remains for the printer owner to test. A successful upload or mock run does not establish physical print reliability.

## Attribution

Based on [luc-github/ESP3D-WEBUI](https://github.com/luc-github/ESP3D-WEBUI/tree/3.1). Original contributor credits and licensing are retained in the repository.
