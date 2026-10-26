// Normalize ESP3D replies without mistaking a fault for an idle printer.
const activeStates = ["processing", "pausing", "pause", "cancelling"]
function readPrintJob(text, previous = {}) {
    const reply = JSON.parse(text)
    if (String(reply.cmd) !== "701") throw new Error("Unexpected printer status reply")
    const data = typeof reply.data === "string" ? { status: reply.data } : reply.data
    if (!data || ![...activeStates, "no stream"].includes(data.status))
        throw new Error("Printer status is unavailable")
    const error = reply.status !== "ok" || Number(data.code || 0) !== 0
    const active = activeStates.includes(data.status)
    const total = Number(data.total || previous.total || 0)
    const processed = Number(data.processed ?? previous.processed ?? 0)
    return {
        state: error ? "error" : data.status,
        active, error, code: data.code,
        name: active ? data.name || previous.name || "Current print" : "",
        total: active ? total : 0,
        processed: active ? processed : 0,
        progress: active && total > 0 ? Math.min(100, Math.max(0, processed / total * 100)) : 0,
    }
}
function sdPrintCommand(path, filename) {
    if (!filename || /[\r\n;\[\]]/.test(path + filename))
        throw new Error("This filename cannot be sent as a print command. Rename it first.")
    return "[ESP700]/SD/" + (path + "/" + filename).split("/").filter(Boolean).join("/")
}
export { readPrintJob, sdPrintCommand, activeStates }
