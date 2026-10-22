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

function clearConnection() {
    const device = bluetoothDevice;
    if (nus_char_rx) {
        nus_char_rx.removeEventListener('characteristicvaluechanged', onRxDataReceived);
    }
    if (device) device.removeEventListener('gattserverdisconnected', onDeviceDisconnected);
    bluetoothDevice = null;
    nus_service = null;
    nus_char_rx = null;
    nus_char_tx = null;
    connected = false;
    if (device && device.gatt.connected) device.gatt.disconnect();
}

export function connect() {
    if (connectionPromise) return connectionPromise;
    if (connected) return Promise.resolve();
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
    connectionPromise = Promise.resolve().then(() => navigator.bluetooth.requestDevice({
        filters: [
            { services: [NUS_SERVICE_UUID] }
        ],
        optionalServices: [NUS_SERVICE_UUID]
    }))
        .then(device => {
            checkCurrent();
            attemptedDevice = device;
            bluetoothDevice = device;
            console.log('Connecting to GATT Server...');
            device.addEventListener('gattserverdisconnected', onDeviceDisconnected);
            return device.gatt.connect();
        })
        .then(server => {
            checkCurrent();
            console.log('Getting Services...');
            return server.getPrimaryServices();
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
            return nus_service.getCharacteristics();
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
            return nus_char_rx.startNotifications();
        })
        .then(() => {
            checkCurrent();
            connected = true;
            console.log("connected!");
            sharedEventDispatcher().emit("ble_connected");
        })
        .catch(error => {
            if (generation === connectionGeneration) {
                clearConnection();
                sharedEventDispatcher().emit("ble_connect_error", error);
            }
        }).then(() => {
            if (generation === connectionGeneration) connectionPromise = null;
        });
    return connectionPromise;
}


export function disconnect() {
    const hadConnection = !!(bluetoothDevice || connectionPromise || connected);
    ++connectionGeneration;
    connectionPromise = null;
    clearConnection();
    if (hadConnection) sharedEventDispatcher().emit("ble_disconnected");
}


export function tx_data(buff) {
    if (!connected || !nus_char_tx || !bluetoothDevice || !bluetoothDevice.gatt.connected) {
        return Promise.reject(new Error('Bluetooth is not connected'));
    }
    console.log("tx bytes:", buff.byteLength);
    return nus_char_tx.writeValue(buff);
}

/* Utils */

function onRxDataReceived(event) {
    if (event.target !== nus_char_rx) return;
    const value = event.target.value;
    const data = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    console.log("rx bytes:", data.byteLength);
    sharedEventDispatcher().emit("ble_rx_data", data);
}

function onDeviceDisconnected(event) {
    if (event.target !== bluetoothDevice) return;
    ++connectionGeneration;
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
