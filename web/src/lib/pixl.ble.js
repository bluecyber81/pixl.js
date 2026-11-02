import { sharedEventDispatcher } from "./event";

const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
const NUS_CHAR_TX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
const NUS_CHAR_RX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"


var nus_service;
var nus_char_rx;
var nus_char_tx;

var bluetoothDevice;
var connectionPromise;
var connectionGeneration = 0;
var connected = false;
var cancelConnectionStep;
var disconnectionPromise = null;
const NOTIFICATION_STOP_TIMEOUT = 1500;

// Browser GATT promises can remain pending after the peripheral disappears.
// Bound each radio step, but never time out the user's device picker.
function waitForConnectionStep(operation, checkCurrent) {
    return new Promise((resolve, reject) => {
        let finished = false;
        const finish = (error, value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (cancelConnectionStep === cancel) cancelConnectionStep = null;
            if (error) reject(error); else resolve(value);
        };
        const cancel = () => finish(new Error('Connection cancelled'));
        const timer = setTimeout(() => finish(Object.assign(
            new Error('Bluetooth connection step timed out'), { code: 'CONNECT_TIMEOUT' })), 20000);
        cancelConnectionStep = cancel;
        Promise.resolve(operation).then(value => {
            // A timed-out or cancelled gatt.connect() may still succeed later.
            // The generation check cleans that stale link without touching a
            // newer attempt that owns the same BluetoothDevice object.
            try { checkCurrent(); finish(null, value); } catch (error) { finish(error); }
        }, error => finish(error));
    });
}

// Opaque browser permission identity. RAM only, never a diagnostic/export field.
export function get_device_key() {
    return connected && typeof bluetoothDevice?.id === 'string' ? bluetoothDevice.id : null;
}

// Deliberately exclude the selected BluetoothDevice, its name and its address.
export function get_connection_state() {
    return disconnectionPromise ? 'disconnecting' : connected ? 'connected' : connectionPromise ? 'connecting' : 'disconnected';
}

function detachConnection() {
    const device = bluetoothDevice;
    const rx = nus_char_rx;
    if (nus_char_rx) {
        nus_char_rx.removeEventListener('characteristicvaluechanged', onRxDataReceived);
    }
    if (device) device.removeEventListener('gattserverdisconnected', onDeviceDisconnected);
    bluetoothDevice = null;
    nus_service = null;
    nus_char_rx = null;
    nus_char_tx = null;
    connected = false;
    return { device, rx };
}

function disconnectGatt(device) {
    // Local teardown must finish even if a platform has already invalidated GATT.
    try { device?.gatt.disconnect(); } catch (_) { /* Already unavailable. */ }
}

function clearConnection() {
    const { device } = detachConnection();
    // disconnect() also cancels a pending GATT connection while connected is
    // still false. Waiting for a late successful connect leaves that request live.
    disconnectGatt(device);
}

function stopNotificationsAndDisconnect({ device, rx }) {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    disconnectionPromise = pending;
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        device.removeEventListener('gattserverdisconnected', disconnected);
        disconnectGatt(device);
        if (disconnectionPromise === pending) disconnectionPromise = null;
        complete();
        sharedEventDispatcher().emit('ble_disconnect_complete');
    };
    const disconnected = event => { if (event.target === device) finish(); };
    const timer = setTimeout(finish, NOTIFICATION_STOP_TIMEOUT);
    device.addEventListener('gattserverdisconnected', disconnected);
    // Defer the radio operation until local consumers have cancelled their queues.
    // A resolved promise confirms local unsubscription, not a physical radio close.
    Promise.resolve().then(() => {
        if (!finished) return rx.stopNotifications();
    }).then(finish, finish);
    return pending;
}

export function connect() {
    if (connectionPromise) return connectionPromise;
    if (connected) return Promise.resolve();
    const previousDisconnect = disconnectionPromise;
    const generation = ++connectionGeneration;
    let attemptedDevice;
    function checkCurrent() {
        if (generation !== connectionGeneration) {
            // A pending gatt.connect() may finish after the user cancelled it.
            if (attemptedDevice && attemptedDevice !== bluetoothDevice && attemptedDevice.gatt.connected) {
                attemptedDevice.gatt.disconnect();
            }
            throw new Error('Connection cancelled');
        }
    }
    connectionPromise = Promise.resolve().then(() => {
        checkCurrent();
        return navigator.bluetooth.requestDevice({
        filters: [
            { services: [NUS_SERVICE_UUID] }
        ],
        optionalServices: [NUS_SERVICE_UUID]
        });
    })
        .then(device => {
            checkCurrent();
            // The picker still opens from the initiating user gesture. Only the
            // radio work waits: old unsubscription must never affect a new link.
            return Promise.resolve(previousDisconnect).then(() => {
                checkCurrent();
                attemptedDevice = device;
                bluetoothDevice = device;
                console.log('Connecting to GATT Server...');
                device.addEventListener('gattserverdisconnected', onDeviceDisconnected);
                return waitForConnectionStep(device.gatt.connect(), checkCurrent);
            });
        })
        .then(server => {
            checkCurrent();
            console.log('Getting Services...');
            return waitForConnectionStep(server.getPrimaryServices(), checkCurrent);
        })
        .then(services => {
            checkCurrent();
            console.log('Getting Characteristics...');
            services.forEach(service => {
                if (service.uuid == NUS_SERVICE_UUID) {
                    nus_service = service;
                    console.log('> found nus Service: ' + service.uuid);
                }
            });
            if (!nus_service) throw new Error('Pixl UART service is missing');
            return waitForConnectionStep(nus_service.getCharacteristics(), checkCurrent);
        })
        .then(characteristics => {
            checkCurrent();
            characteristics.forEach(characteristic => {
                console.log('>> Characteristic: ' + characteristic.uuid + ' ' +
                    getSupportedProperties(characteristic));
                if (characteristic.uuid == NUS_CHAR_TX_UUID) {
                    nus_char_tx = characteristic;

                } else if (characteristic.uuid == NUS_CHAR_RX_UUID) {
                    nus_char_rx = characteristic;
                    characteristic.addEventListener('characteristicvaluechanged',
                        onRxDataReceived);
                }
            });
            if (!nus_char_rx || !nus_char_tx) throw new Error('Pixl UART characteristics are missing');
            return waitForConnectionStep(nus_char_rx.startNotifications(), checkCurrent);
        })
        .then(() => {
            checkCurrent();
            connected = true;
            console.log("connected!");
            sharedEventDispatcher().emit("ble_connected");
        })
        .catch(error => {
            if (generation === connectionGeneration) {
                ++connectionGeneration;
                clearConnection();
                connectionPromise = null;
                sharedEventDispatcher().emit("ble_connect_error", error);
            }
        }).then(() => {
            if (generation === connectionGeneration) connectionPromise = null;
        });
    return connectionPromise;
}


export function disconnect(options = {}) {
    const hadConnection = !!(bluetoothDevice || connectionPromise || connected);
    const wasConnected = connected;
    ++connectionGeneration;
    cancelConnectionStep?.();
    connectionPromise = null;
    const snapshot = detachConnection();
    let pending = disconnectionPromise;
    if (wasConnected && !options.immediate && snapshot.device?.gatt.connected &&
        typeof snapshot.rx?.stopNotifications === 'function') {
        pending = stopNotificationsAndDisconnect(snapshot);
    } else disconnectGatt(snapshot.device);
    if (hadConnection) sharedEventDispatcher().emit("ble_disconnected");
    return pending || Promise.resolve();
}

// Receives the already authorized NUS link only after the remote protocol has
// acknowledged FILE_READY. No picker, connect, discovery or unsubscribe runs.
// The remote owner detaches synchronously before calling this receiver.
export function adopt_remote_connection(session) {
    if (bluetoothDevice || connectionPromise || connected || disconnectionPromise) throw new Error('File connection is busy');
    const { device, rx, tx } = session || {};
    if (!device?.gatt?.connected || rx?.uuid !== NUS_CHAR_RX_UUID || tx?.uuid !== NUS_CHAR_TX_UUID ||
        !rx.properties?.notify || !tx.properties?.write || typeof tx.writeValueWithResponse !== 'function') {
        throw new Error('Invalid remote file connection');
    }
    ++connectionGeneration;
    bluetoothDevice = device; nus_char_rx = rx; nus_char_tx = tx;
    try {
        device.addEventListener('gattserverdisconnected', onDeviceDisconnected);
        rx.addEventListener('characteristicvaluechanged', onRxDataReceived);
        connected = true;
        sharedEventDispatcher().emit('ble_connected');
        return true;
    } catch (error) {
        clearConnection();
        sharedEventDispatcher().emit('ble_connect_error', error);
        throw error;
    }
}


export function tx_data(buff) {
    if (!connected || !nus_char_tx || !bluetoothDevice || !bluetoothDevice.gatt.connected) {
        return Promise.reject(new Error('Bluetooth is not connected'));
    }
    if (nus_char_tx.properties.write && typeof nus_char_tx.writeValueWithResponse === 'function') {
        return nus_char_tx.writeValueWithResponse(buff);
    }
    return nus_char_tx.writeValue(buff);
}

/* Utils */

function onRxDataReceived(event) {
    if (event.target !== nus_char_rx) return;
    const value = event.target.value;
    const data = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    sharedEventDispatcher().emit("ble_rx_data", data);
}

function onDeviceDisconnected(event) {
    if (event.target !== bluetoothDevice) return;
    ++connectionGeneration;
    cancelConnectionStep?.();
    connectionPromise = null;
    clearConnection();
    sharedEventDispatcher().emit("ble_disconnected");
}

function getSupportedProperties(characteristic) {
    let supportedProperties = [];
    for (const p in characteristic.properties) {
        if (characteristic.properties[p] === true) {
            supportedProperties.push(p.toUpperCase());
        }
    }
    return '[' + supportedProperties.join(', ') + ']';
}
