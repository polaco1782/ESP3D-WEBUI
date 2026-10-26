import { h } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Printer, Sliders, Terminal, Activity, Play, Pause, Square, AlertTriangle, CheckCircle, Wifi, HardDrive, Thermometer, ArrowRight, RefreshCw } from "preact-feather"
import { useUiContext, useSettingsContext } from "../../../contexts"
import { useHttpQueue } from "../../../hooks"
import { espHttpURL } from "../../../components/Helpers"
import { showConfirmationModal } from "../../../components/Modal"
import { FilesPanel } from "../../../components/Panels/Files"
import { JogPanel } from "../../../components/Panels/Jog"
import { TemperaturesPanel } from "../../../components/Panels/Temperatures"
import { ExtrudersPanel } from "../../../components/Panels/Extruders"
import { ExtraControlsPanel } from "../../../components/Panels/ExtraControls"
import { TerminalPanel } from "../../../components/Panels/Terminal"
import { ChartsPanel } from "../../../components/Panels/Charts"
import { MacrosPanel } from "../../../components/Panels/Macros"
import { useTargetContext } from "./TargetContext"
import { readPrintJob, sdPrintCommand } from "./printJob"

const labels = { starting: "Starting print…", processing: "Printing", pausing: "Pausing…", pause: "Paused", cancelling: "Cancelling…", "no stream": "Ready to print", error: "Print stopped" }
const tabs = [ ["print", "Print", Printer], ["prepare", "Prepare", Sliders], ["monitor", "Temperatures", Activity], ["console", "Console", Terminal] ]

export default function PrinterWorkspace() {
    const { modals, connection } = useUiContext()
    const { createNewRequest, createNewTopRequest } = useHttpQueue()
    const { connectionSettings } = useSettingsContext()
    const { temperatures } = useTargetContext()
    const [tab, setTab] = useState("print")
    const [job, setJob] = useState({ state: "unknown", active: false, progress: 0 })
    const [pending, setPending] = useState("")
    const [error, setError] = useState("")
    const [statusError, setStatusError] = useState("")
    const [notice, setNotice] = useState("")
    const [emergencyLatched, setEmergencyLatched] = useState(false)
    const jobRef = useRef(job)
    const requestBusy = useRef(false)
    const pollBusy = useRef(false)
    const mounted = useRef(true)
    const generation = useRef(0)
    const lastTemperaturePoll = useRef(0)
    const lastAction = useRef("")
    const connected = connection.connectionState.connected
    const hasDirectSD = connectionSettings.current.SDConnection === "direct"
    const blocked = emergencyLatched || !connected || job.state === "unknown" || job.error || !!statusError || job.active || !!pending

    const request = (cmd) => new Promise((resolve, reject) => {
        createNewRequest(espHttpURL("command", { cmd }), { method: "GET" }, {
            onSuccess: resolve,
            onFail: (message) => reject(new Error(String(message))),
        })
    })
    const poll = async () => {
        if (pollBusy.current) return
        pollBusy.current = true
        const version = generation.current
        try {
            const result = await request("[ESP701]json=yes")
            if (!mounted.current || version !== generation.current) return
            const next = readPrintJob(result, jobRef.current)
            if (jobRef.current.active && !next.active && !next.error)
                setNotice((jobRef.current.state === "cancelling" || lastAction.current === "Cancel") ? "Print cancelled. Heater shutdown completed." : "Stream ended. Printer is ready for another file.")
            if (next.active && next.state !== jobRef.current.state) setNotice("")
            jobRef.current = next
            setJob(next)
            setStatusError("")
            if (!next.active && !next.error && !requestBusy.current && Date.now() - lastTemperaturePoll.current > 5000) {
                lastTemperaturePoll.current = Date.now()
                // Read-only temperature query while idle. Streaming owns the UART.
                request("M105").catch(() => {})
            }
        } catch (e) {
            if (mounted.current && version === generation.current) setStatusError("Could not refresh print status. " + e.message)
        } finally { pollBusy.current = false }
    }
    useEffect(() => {
        mounted.current = true
        poll()
        const timer = setInterval(poll, 2000)
        return () => { mounted.current = false; clearInterval(timer) }
    }, [])
    const send = async (cmd, label) => {
        if (requestBusy.current || (label === "Start print" && jobRef.current.active)) return
        lastAction.current = label
        requestBusy.current = true
        generation.current++
        setPending(label); setError(""); setNotice("")
        try {
            const result = await request(cmd)
            if (!mounted.current) return
            if (result.trim().startsWith("{")) {
                const reply = JSON.parse(result)
                if (reply.status !== "ok") throw new Error(typeof reply.data === "string" ? reply.data : JSON.stringify(reply.data))
            } else if (!/^(ok\b|ESP3D says:)/i.test(result.trim())) {
                throw new Error(result || "No confirmation from ESP3D")
            }
            if (label === "Start print") {
                jobRef.current = { ...jobRef.current, state: "starting", active: true }
                setJob(jobRef.current)
            }
            setNotice(label + " requested. Waiting for printer status.")
            await poll()
        } catch (e) { if (mounted.current) setError(e.message) }
        finally { requestBusy.current = false; if (mounted.current) setPending("") }
    }
    const startPrint = (fs, path, filename) => {
        if (blocked || requestBusy.current) return
        let cmd
        try {
            if (fs !== "DIRECTSD" || !hasDirectSD) throw new Error("Choose the ESP32 SD card to start a stream.")
            cmd = sdPrintCommand(path, filename)
            if (!cmd || cmd.includes(";")) throw new Error("Use the printer SD controls for this storage type.")
        } catch (e) { setError(e.message); return }
        showConfirmationModal({ modals, title: "Start print?",
            content: <div class="print-confirm"><strong>{filename}</strong><p>The printer will follow this file’s movement and heating commands. Check that the bed is clear and the printer is ready.</p></div>,
            button1: { text: "Start print", cb: () => { setTab("print"); send(cmd, "Start print") } },
            button2: { text: "Not now" },
        })
    }
    const cancelPrint = () => showConfirmationModal({ modals, title: "Cancel this print?",
        content: "Queued movement finishes first. ESP3D then turns off the active hotend, bed and fan. This is not an emergency stop.",
        button1: { text: "Cancel print", cb: () => send("[ESP701]action=ABORT", "Cancel") },
        button2: { text: "Keep printing" },
    })
    const emergency = () => {
        setEmergencyLatched(true)
        generation.current++
        setError("Emergency stop requested. Reset the printer and ESP3D before another job.")
        createNewTopRequest(espHttpURL("command", { cmd: "M112" }), { method: "GET" }, {
            onSuccess: () => poll(),
            onFail: message => setError("Emergency command could not be delivered: " + message + ". Use the printer’s physical power switch."),
        })
    }
    const temp = (key) => {
        const value = temperatures?.[key]?.[0]
        return value ? `${Number(value.value).toFixed(0)}° / ${Number(value.target).toFixed(0)}°` : "Waiting for data"
    }
    return <main class="better-workspace">
        <div class="workspace-heading">
            <div><div class="eyebrow">YOUR PRINTER, AT A GLANCE</div><h1>Printer workspace</h1><p>Choose a file, start a print, and follow its progress here.</p></div>
            <span class={`connection-pill ${connected ? "online" : "offline"}`}><Wifi size={16} />{connected ? "Connected" : "Disconnected"}</span>
        </div>
        <div class="workspace-navigation">
            <nav aria-label="Printer tools">{tabs.map(([id, label, Icon]) => <button key={id} class={`workspace-tab ${tab === id ? "selected" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={18} />{label}</button>)}</nav>
            <button class="emergency-button" onClick={emergency}><AlertTriangle size={16} />Emergency stop</button>
        </div>
        {(error || statusError || job.error) && <div class="workspace-alert" role="alert"><AlertTriangle size={20} /><div><strong>{job.error ? "Stream fault" : "Printer needs attention"}</strong><p>{error || statusError || `Error ${job.code || "reported by ESP3D"}. Inspect the printer and reset the printer and ESP3D before retrying.`}</p></div><button class="btn" onClick={poll}><RefreshCw size={16} />Retry status</button></div>}
        <div class="print-layout" hidden={tab !== "print"}>
            <section class="files-workspace"><FilesPanel onStartPrint={startPrint} printLocked={blocked} /></section>
            <aside class="print-sidebar">
                <section class={`job-card ${job.active ? "job-active" : ""}`} aria-label="Current print">
                    <div class="card-eyebrow"><Printer size={18} />CURRENT PRINT<span class="status-dot" /></div>
                    <h2 aria-live="polite">{emergencyLatched ? "Emergency stop" : pending || (statusError ? "Status unavailable" : labels[job.state] || "Checking printer…")}</h2>
                    {job.active ? <div><p class="job-filename">{job.name}</p><div class="job-progress-heading"><span>File progress</span><strong>{job.progress.toFixed(1)}%</strong></div><progress max="100" value={job.progress} aria-label="Print file progress" /><p class="job-hint">Based on acknowledged commands, not elapsed print time.</p></div> : <div class="job-empty"><div class="job-empty-icon"><HardDrive size={32} /></div><p>Upload G-code to the ESP32 SD card, then choose <strong>Print</strong> beside your file.</p></div>}
                    {job.active && <div class="job-actions">
                        <button class="btn btn-primary" disabled={emergencyLatched || !!pending || !!statusError || !["processing", "pause"].includes(job.state)} onClick={() => send(`[ESP701]action=${job.state === "pause" ? "RESUME" : "PAUSE"}`, job.state === "pause" ? "Resume" : "Pause")}>
                            {job.state === "pause" ? <Play size={18} /> : <Pause size={18} />}{job.state === "pause" ? "Resume" : "Pause"}</button>
                        <button class="btn cancel-print" disabled={emergencyLatched || !!pending || job.state === "cancelling"} onClick={cancelPrint}><Square size={16} />Cancel print</button>
                    </div>}
                    {job.active && <p class="job-hint">Pause drains queued moves and keeps heaters on. A heating wait may delay the pause.</p>}
                    {notice && <p class="job-notice" role="status"><CheckCircle size={16} />{notice}</p>}
                </section>
                <section class="temperature-summary"><div class="card-eyebrow"><Thermometer size={18} />TEMPERATURES</div><div class="temperature-readings"><div><span>Nozzle</span><strong>{temp("T")}</strong></div><div><span>Bed</span><strong>{temp("B")}</strong></div></div><button class="text-action" onClick={() => setTab("monitor")}>Temperature controls <ArrowRight size={16} /></button><p class="job-hint">Last reported values. Updates depend on printer reports during streaming.</p></section>
                <div class="workspace-tip"><span>01</span><p><strong>Slice. Upload. Print.</strong><br />Orca uploads appear in your SD files. Refresh the list after sending a new file.</p></div>
            </aside>
        </div>
        <section class="prepare-layout" hidden={tab !== "prepare"} aria-label="Prepare printer">
            <p class="section-description">Home, position, and prepare your printer. Manual controls are unavailable while a stream is active.</p>
            <fieldset disabled={emergencyLatched || job.active || !!pending || job.error || !!statusError || job.state === "unknown"} class="prepare-grid"><JogPanel /><ExtrudersPanel /><ExtraControlsPanel /><MacrosPanel /></fieldset>
        </section>
        <section class="monitor-layout" hidden={tab !== "monitor"} aria-label="Temperature monitoring"><fieldset disabled={emergencyLatched || job.active || job.error || !!pending || !!statusError || job.state === "unknown"}><TemperaturesPanel /></fieldset><ChartsPanel /><p class="section-description">During an ESP3D stream, use Cancel print to stop the job and switch off heaters.</p></section>
        <section class="console-layout" hidden={tab !== "console"}><p class="section-description">Advanced diagnostics and commands. Printing and job controls are available in the Print tab.</p><TerminalPanel /></section>
    </main>
}
