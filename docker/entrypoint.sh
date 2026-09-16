#!/bin/sh
# ws-scrcpy entrypoint.
# The server only runs while the ADB device is connected:
#   - waits for $DEVICE to appear before starting the server
#   - stops the server as soon as the device goes away
#   - restarts automatically after reconnection

set -u

DEVICE="${DEVICE:-localhost:5555}"
PORT="${PORT:-8000}"
APP_DIR="${APP_DIR:-/ws-scrcpy}"

log() {
    echo "[ws-scrcpy] $*"
}

device_connected() {
    adb devices | grep -qw "$DEVICE"
}

wait_for_device() {
    until device_connected; do
        log "Waiting for ($DEVICE) to connect..."
        adb connect "$DEVICE" > /dev/null 2>&1 || true
        sleep 1
    done
    log "Device ($DEVICE) connected"
}

stop_server() {
    if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        log "Device disconnected, stopping server..."
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    SERVER_PID=""
}

start_server() {
    log "Starting ws-scrcpy on port $PORT"
    cd "$APP_DIR" || exit 1
    node dist/index.js &
    SERVER_PID=$!
    log "Server started (pid $SERVER_PID)"
}

SERVER_PID=""

trap 'stop_server; exit 0' INT TERM

while true; do
    if device_connected; then
        if [ -z "$SERVER_PID" ] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
            start_server
        fi
    else
        stop_server
        wait_for_device
    fi
    sleep 1
done
