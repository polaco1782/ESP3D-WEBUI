// Background polling must not compete with an ESP3D-owned printer stream.
// Keep this state separate from UI status: faulted streams can report "no stream"
// while retaining the UART lock until restart.
const streamStatusCommand = "[ESP701]json=yes"
const isEspCommand = (cmd) => cmd.trim().toUpperCase().startsWith("[ESP")

class StreamPollingGuard {
    constructor() {
        this.blocked = false
    }

    command(cmd) {
        return this.blocked && !isEspCommand(cmd) ? streamStatusCommand : cmd
    }

    failure(cmd, error) {
        if (!isEspCommand(cmd) && error?.code === 409 &&
            error.responseText?.trim() ===
                "Marlin stream owns printer connection; use ESP701") {
            this.blocked = true
            return true
        }
        return false
    }

    success(cmd, result) {
        if (!cmd.trim().toUpperCase().startsWith("[ESP701]")) return
        try {
            const response = JSON.parse(result)
            if (String(response.cmd) !== "701") return
            const status = typeof response.data === "string"
                ? response.data : response.data?.status
            if (response.status === "ok" && status === "no stream") {
                this.blocked = false
            } else if (["processing", "pausing", "pause", "cancelling"].includes(status)) {
                this.blocked = true
            }
        } catch (_) {
            // An invalid/unknown reply cannot establish that the UART is free.
        }
    }
}

export { StreamPollingGuard }
