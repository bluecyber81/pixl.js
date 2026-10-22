import { sharedEventDispatcher } from "./event"
import * as pixl from "./pixl.ble"
import ByteBuffer from "bytebuffer"

import i18n from '../i18n'


const MTU_SIZE = 250
const MTU_MAX_DATA_SIZE = 247
const DF_HEADER_SIZE = 4
const DF_MAX_DATA_SIZE = MTU_MAX_DATA_SIZE - DF_HEADER_SIZE

var op_queue = []
var op_ongoing = false
var active_op = null
var response_timer = null
var initialized = false
const RESPONSE_IDLE_TIMEOUT = 30000
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const SAFE_GATT_PAYLOAD = 20
var transport_generation = 0
var transport_capabilities = null
var transport_probe = null

export function op_queue_push(cmd, tx_data_cb, rx_data_cb) {
    return new Promise((resolve, reject) => {
        var op = {
            cmd: cmd,
            tx_data_cb: tx_data_cb,
            rx_data_cb: rx_data_cb,
            p_resolve: resolve,
            p_reject: reject
        }
        op_queue.push(op);
        process_op_queue();
    });

}


function process_op_queue() {
    if (!op_ongoing && op_queue.length > 0) {
        var op = op_queue.shift();
        proocess_op(op);
    }
}

function proocess_op(op) {
    active_op = op;
    op_ongoing = true;
    op.tx_done = false;
    op.rx_done = false;
    reset_rx();
    var bb = new ByteBuffer();
    try {
        op.tx_data_cb(bb);
    } catch (error) {
        finish_op(op, error);
        return;
    }
    arm_response_timeout(op);
    try {
        Promise.resolve(tx_data_frame(op.cmd, 0, 0, bb)).then(() => {
            if (active_op !== op) return;
            op.tx_done = true;
            finish_when_ready(op);
        }).catch(error => {
            if (active_op === op) abort_transport(error);
        });
    } catch (error) {
        abort_transport(error);
    }
}

function finish_when_ready(op) {
    // A notification can arrive before Web Bluetooth finishes writeValue().
    // Keep the queue locked until both sides finish, including a late TX error.
    if (op.tx_done && op.rx_done) finish_op(op, op.rx_error, op.response);
}

function finish_op(op, error, response) {
    if (active_op !== op) return;
    clearTimeout(response_timer);
    response_timer = null;
    reset_rx();
    active_op = null;
    op_ongoing = false;
    if (error) op.p_reject(error);
    else op.p_resolve(response);
    process_op_queue();
}

function arm_response_timeout(op) {
    clearTimeout(response_timer);
    response_timer = setTimeout(() => {
        if (active_op === op) abort_transport(new Error('Bluetooth response timed out'));
    }, RESPONSE_IDLE_TIMEOUT);
}

function abort_transport(error) {
    // After a malformed/incomplete exchange, a late packet must not be consumed
    // as the response to a new command. Cancel work and require reconnection.
    on_ble_disconnected(error);
    pixl.disconnect();
}

export function init() {
    if (initialized) return;
    initialized = true;
    sharedEventDispatcher().addListener("ble_rx_data", on_rx_data);
    sharedEventDispatcher().addListener("ble_disconnected", on_ble_disconnected);
    sharedEventDispatcher().addListener("ble_connect_error", on_ble_disconnected);
    ByteBuffer.DEFAULT_ENDIAN = ByteBuffer.LITTLE_ENDIAN;
}

export function get_version() {
    console.log("get_version");
    const generation = transport_generation;
    return negotiate_transport().then(() => {
        if (generation !== transport_generation) throw new Error('Bluetooth session changed');
        return op_queue_push(0x01,
        b => { },
        b => {
            var ver = read_string(b);
            var ble_addr = "";
            if (b.remaining()) {
                ble_addr = read_string(b);
            }
            return {
                ver: ver,
                ble_addr: ble_addr
            }
        });
    });
}

// This is an application capability probe, NOT a measurement of the browser's
// negotiated ATT MTU. Older firmware rejects the new command with status255.
export function negotiate_transport() {
    if (transport_capabilities) return Promise.resolve(transport_capabilities);
    if (transport_probe) return transport_probe;
    const generation = transport_generation;
    const pending = op_queue_push(0x03, () => {}, b => {
        if ((b.remaining() !== 8 && b.remaining() !== 10) || b.readUint8() !== 80 || b.readUint8() !== 88 ||
            b.readUint8() !== 68 || b.readUint8() !== 70 || b.readUint8() !== 1) {
            throw new Error('Invalid file-transfer capability response');
        }
        const flags = b.readUint8(), maximum = b.readUint16();
        if ((flags & 3) !== 3 || maximum < 1 || maximum > DF_MAX_DATA_SIZE) {
            throw new Error('Unsupported file-transfer capabilities');
        }
        // Firmware reports its current negotiated GATT value capacity. A missing
        // or unclear value retains the universally safe ATT MTU23 limit.
        const advertised = b.remaining() === 2 ? b.readUint16() : SAFE_GATT_PAYLOAD;
        const gattValueCapacity = advertised >= SAFE_GATT_PAYLOAD && advertised <= MTU_MAX_DATA_SIZE
            ? advertised : SAFE_GATT_PAYLOAD;
        return { chunkedRequests: true, maxRequestPayload: maximum, gattValueCapacity };
    }).then(response => {
        if (generation !== transport_generation) throw new Error('Bluetooth session changed');
        if (response.status === 255) {
            transport_capabilities = { chunkedRequests: false, maxRequestPayload: DF_MAX_DATA_SIZE };
        } else {
            transport_capabilities = checked_response(response);
        }
        return transport_capabilities;
    });
    transport_probe = pending;
    const clear = () => { if (transport_probe === pending) transport_probe = null; };
    pending.then(clear, clear);
    return pending;
}

export function enter_dfu() {
    console.log("enter_dfu");
    return op_queue_push(0x02,
        b => { },
        b => { });
}

export function vfs_get_drive_list() {
    console.log("vfs_get_drive_list");
    return op_queue_push(0x10,
        b => { },
        b => {
            var drives = [];
            var d_cnt = b.readUint8();
            for (var index = 0; index < d_cnt; index++) {
                var drive = {};
                drive.status = b.readUint8();
                drive.label = String.fromCharCode(b.readByte());
                drive.name = read_string(b);
                drive.total_size = b.readUint32();
                // The firmware sends available bytes, not occupied bytes.
                drive.free_size = b.readUint32();

                drives.push(drive);
            }
            return drives;
        });
}

export function vfs_drive_format(path) {
    console.log("vfs_drive_format", path);
    return op_queue_push(0x11,
        b => { b.writeByte(path.charCodeAt(0)) },
        b => { });
}

export function vfs_read_folder(dir) {
    console.log("vfs_read_dir", dir);
    return op_queue_push(0x16,
        b => { write_string(b, dir); },
        bb => {
            var files = [];
            while (bb.remaining() > 0) {
                var file = {};
                file.name = read_string(bb);
                file.size = bb.readUint32();
                file.type = bb.readUint8();
                file.meta = read_meta(bb);
                files.push(file);
            }
            return files;
        });

}

export function vfs_create_folder(dir) {
    console.log("vfs_create_folder", dir);

    return op_queue_push(0x17,
        b => {
            path_validation(dir);
            write_string(b, dir);
        },
        b => { });
}


export function vfs_remove(path) {
    console.log("vfs_remove", path);

    return op_queue_push(0x18,
        b => { write_string(b, path); },
        b => { });
}

export function vfs_open_file(path, mode) {
    console.log("vfs_open_file", path, mode);

    return op_queue_push(0x12,
        b => {
            path_validation(path);
            write_string(b, path);
            if (mode == 'r') {
                b.writeUint8(0x8); //readonly
            } else if (mode == 'w') {
                b.writeUint8(0x16); //truc, create, write
            }

        },
        b => {
            return {
                file_id: b.readUint8()
            }
        });
}

export function vfs_close_file(file_id) {
    console.log("vfs_close_file", file_id);

    return op_queue_push(0x13,
        b => { b.writeUint8(file_id) },
        b => { });
}

export function vfs_read_file(file_id) {
    console.log("vfs_read_file", file_id);
    return op_queue_push(0x14,
        b => { b.writeUint8(file_id) },
        b => { return b.readBytes(b.remaining()).toArrayBuffer() });
}

export function vfs_write_file(file_id, data) {
    console.log("vfs_write_file", file_id);
    return op_queue_push(0x15,
        b => {
            b.writeUint8(file_id);
            write_bytes(b, data);
        },
        b => { });
}


export function vfs_update_meta(path, meta) {
    console.log("vfs_update_meta", path, meta);
    return op_queue_push(0x1a,
        b => {
            write_string(b, path);
            write_meta(b, meta);
        },
        b => { });
}

export function vfs_rename(old_path, new_path) {
    console.log("vfs_rename", old_path, new_path);
    return op_queue_push(0x19,
        b => {
            path_validation(old_path);
            path_validation(new_path);
            write_string(b, old_path);
            write_string(b, new_path);
        },
        b => { });
}

export function get_utf8_byte_size(str) {
    return encode_utf8(str).length;
}

function checked_response(response) {
    if (response.status !== 0) {
        const error = new Error('Device error: command 0x' + response.cmd.toString(16) + ', status ' + response.status);
        error.cmd = response.cmd;
        error.status = response.status;
        throw error;
    }
    return response.data;
}

export function vfs_helper_read_file(path, success_cb, error_cb, done_cb) {
    return new Promise(resolve => {
        file_write_queue.push({type: 'read', path, success_cb, error_cb, done_cb, completion: resolve});
        vfs_process_file_write_queue();
    });
}

function vfs_process_file_read(entry) {
    const generation = file_write_generation;
    function checkCurrent() {
        if (entry.finished || generation !== file_write_generation) throw new Error('File transfer cancelled');
    }
    return vfs_open_file(entry.path, "r").then(checked_response).then(opened => {
        checkCurrent();
        return vfs_read_file(opened.file_id).then(checked_response).then(data => {
            checkCurrent();
            return vfs_close_file(opened.file_id).then(checked_response).then(() => data);
        }, error => {
            if (generation !== file_write_generation) throw error;
            return vfs_close_file(opened.file_id).then(() => { throw error; }, () => { throw error; });
        });
    }).then(data => entry.finish(null, data), error => entry.finish(error));
}

// The device has one global file handle. Queue entire read AND write
// transactions so a second OPEN cannot replace an in-progress transfer.
var file_write_queue = []
var file_write_ongoing = false
var file_write_generation = 0
var file_write_current = null

export function vfs_helper_write_file(path, file, progress_cb, success_cb, error_cb) {
    file_write_queue.push({
        path: path,
        file: file,
        progress_cb: progress_cb,
        success_cb: success_cb,
        error_cb: error_cb
    });
    vfs_process_file_write_queue();
}

function vfs_process_file_write_queue() {
    if (!file_write_ongoing && file_write_queue.length > 0) {
        var e = file_write_queue.shift();
        file_write_ongoing = true;
        file_write_current = e;
        e.finished = false;
        e.finish = (error, data) => {
            if (e.finished) return;
            e.finished = true;
            file_write_current = null;
            file_write_ongoing = false;
            try {
                if (error) e.error_cb(error, e.file);
                else e.success_cb(e.type === 'read' ? data : e.file);
            } finally {
                if (e.done_cb) e.done_cb();
                if (e.completion) e.completion();
                vfs_process_file_write_queue();
            }
        };
        if (e.type === 'read') vfs_process_file_read(e);
        else vfs_process_file_write(e);
    }
}

function vfs_process_file_write(entry) {
    const generation = file_write_generation;
    let file_id = null;
    function checkCurrent() {
        if (entry.finished || generation !== file_write_generation) throw new Error('File transfer cancelled');
    }
    read_file_as_bytebuffer(entry.file).then(buffer => {
        checkCurrent();
        return vfs_open_file(entry.path, "w").then(checked_response).then(opened => {
            checkCurrent();
            file_id = opened.file_id;
            let offset = 0;
            const size = buffer.remaining();
            function writeNext() {
                checkCurrent();
                if (offset === size) return;
                const length = Math.min(DF_MAX_DATA_SIZE - 1, size - offset);
                return vfs_write_file(file_id, buffer.slice(offset, offset + length)).then(checked_response).then(() => {
                    checkCurrent();
                    offset += length;
                    entry.progress_cb({ written_bytes: offset, total_bytes: size }, entry.file);
                    return writeNext();
                });
            }
            return Promise.resolve().then(writeNext).then(() => {
                checkCurrent();
                const closing = file_id;
                file_id = null;
                return vfs_close_file(closing).then(checked_response);
            });
        });
    }).then(() => entry.finish(), error => {
        if (file_id !== null && generation === file_write_generation && !entry.finished) {
            return vfs_close_file(file_id).then(() => entry.finish(error), () => entry.finish(error));
        }
        entry.finish(error);
    });
}


function path_validation(path) {
    if (typeof path !== 'string' || !/^[A-Z]:\//.test(path) || path.includes('\0')) {
        throw new Error('Invalid file path');
    }
    // Firmware strips the two-byte drive label before checking its 64-byte
    // NUL-terminated path buffer. The wire path may therefore contain 65 bytes.
    if (get_utf8_byte_size(path.substring(2)) > 63) {
        throw new Error(i18n.global.t('rename.nametoolong'));
    }
    if (path.length > 3) {
        var p = path.lastIndexOf('/');
        var file_name = path.substring(p + 1);
        if (get_utf8_byte_size(file_name) > 47) {
            throw new Error(i18n.global.t('rename.pathtoolong'));
        }
    }
}


function read_file_as_bytebuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function () {
            resolve(ByteBuffer.wrap(reader.result));
        }
        reader.onerror = function () {
            reject(reader.error);
        }

        reader.readAsArrayBuffer(file);
    });
}

function read_header(bb) {
    return {
        cmd: bb.readUint8(),
        status: bb.readUint8(),
        chunk: bb.readUint16()
    }
}

function read_meta(bb) {
    var size = bb.readUint8();
    var meta = {
        valid: true,
        notes: "",
        flags: {
            raw: 0,
            hide: false,
            readonly: false
        },
        amiibo: {
            head: 0,
            tail: 0
        }
    }
    if (size == 0 || size == 0xff) {
        return meta;
    }
    // Consume exactly the outer record first. Invalid nested fields must not
    // consume a following file or prevent healthy files from being listed.
    var mb = ByteBuffer.wrap(read_bytes_array(bb, size));
    try {
        while (mb.remaining() > 0) {
            var type = mb.readUint8();
            if (type == 1) {
                var type_size = mb.readUint8();
                var bytes = read_bytes_array(mb, type_size);
                meta.notes = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
            } else if (type == 2) {
                var flags = mb.readUint8();
                // Retain SYSTEM and future bits when editing the visible flags.
                meta.flags = { raw: flags, hide: !!(flags & 1), readonly: !!(flags & 4) };
            } else if (type == 3) {
                meta.amiibo.head = mb.readUint32();
                meta.amiibo.tail = mb.readUint32();
            } else {
                // Unknown fields have no length prefix and cannot be skipped.
                throw new Error('Unknown metadata field');
            }
        }
    } catch (_) {
        // Explicitly read-only in the UI; never silently rewrite partial data.
        return { valid: false, notes: '', flags: { raw: 0, hide: false, readonly: false }, amiibo: { head: 0, tail: 0 } };
    }

    return meta;
}

function write_meta(bb, meta) {
    if (meta.valid === false) throw new Error(i18n.global.t('properties.invalidmeta'));
    var notes = meta.notes;
    var bytes = encode_utf8(notes);

    // Firmware notes[90] reserves its final byte for the terminating NUL.
    if (bytes.length > 89) {
        throw new Error(i18n.global.t('properties.notelimit', { max: 89, actual: bytes.length }));
    }

    var tb = new ByteBuffer();
    //notes
    if (notes.length > 0) {
        tb.writeUint8(1);//amiibo notes
        tb.writeUint8(bytes.length);
        for (var i = 0; i < bytes.length; i++) {
            tb.writeUint8(bytes[i]);
        }
    }

    //flags
    tb.writeUint8(2);
    var flags = Number.isInteger(meta.flags.raw) ? (meta.flags.raw & 0xff) : 0;
    flags &= ~(1 | 4);
    if (meta.flags.hide) {
        flags |= 1;
    }
    if (meta.flags.readonly) {
        flags |= 4;
    }
    tb.writeUint8(flags);

    if (meta.amiibo.head > 0 || meta.amiibo.tail > 0) {
        tb.writeUint8(3);
        tb.writeUint32(meta.amiibo.head);
        tb.writeUint32(meta.amiibo.tail);
    }
    tb.flip();

    bb.writeUint8(tb.remaining());
    write_bytes(bb, tb);
}


function decode_utf8(bytes) {
    // These strings include file identities, not just display labels. Replacing
    // invalid bytes or removing a leading BOM could address a different file
    // when a selected row is encoded again for download, rename or removal.
    try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes));
    } catch (_) {
        throw new Error('Invalid UTF-8 in device response; file names cannot be used safely');
    }
}

function encode_utf8(text) {
    //return Array.from(new Uint8Array(ByteBuffer.wrap(text, 'utf8').toArrayBuffer()));
    return Array.from(new TextEncoder().encode(text));
}

function read_string(bb) {
    var size = bb.readUint16();
    var bytes = []
    for (var i = 0; i < size; i++) {
        bytes.push(bb.readUint8());
    }
    return decode_utf8(bytes);
}

function write_string(bb, str) {
    var bytes = encode_utf8(str);
    bb.writeUint16(bytes.length);
    for (var i = 0; i < bytes.length; i++) {
        bb.writeUint8(bytes[i]);
    }
}

function write_bytes(bb, buffer) {
    var size = buffer.remaining();
    for (var i = 0; i < size; i++) {
        bb.writeUint8(buffer.readUint8());
    }
}

function read_bytes_array(bb, size) {
    var bytes = []
    for (var i = 0; i < size; i++) {
        bytes.push(bb.readUint8());
    }
    return bytes;
}

async function tx_data_frame(cmd, status, chunk, data) {
    const generation = transport_generation;
    if (data) data.flip();
    const payload = data ? new Uint8Array(data.toArrayBuffer()) : new Uint8Array(0);
    const profile = transport_capabilities;
    const chunked = profile?.chunkedRequests === true;
    const maximum = profile?.maxRequestPayload ?? DF_MAX_DATA_SIZE;
    if (payload.length > maximum) throw new Error('File-transfer request is too large');
    const capacity = chunked ? profile.gattValueCapacity - DF_HEADER_SIZE : DF_MAX_DATA_SIZE;
    let offset = 0, sequence = 0;
    do {
        if (generation !== transport_generation) throw new Error('Bluetooth session changed');
        const length = Math.min(capacity, payload.length - offset);
        const more = offset + length < payload.length;
        const frame = new ByteBuffer();
        frame.writeUint8(cmd); frame.writeUint8(status);
        frame.writeUint16(chunked ? sequence | (more ? 0x8000 : 0) : chunk);
        for (let index = 0; index < length; index++) frame.writeUint8(payload[offset + index]);
        frame.flip();
        // Await every GATT write; no concurrent writes and no fragments from
        // an earlier connection can leak into a replacement session.
        await pixl.tx_data(frame.toArrayBuffer());
        offset += length; ++sequence;
        if (generation !== transport_generation) throw new Error('Bluetooth session changed');
        if (active_op) {
            if (offset < payload.length && active_op.rx_done) {
                throw new Error('Bluetooth response arrived before the complete request');
            }
            arm_response_timeout(active_op);
        }
    } while (offset < payload.length);
}



var rx_bytebuffer = new ByteBuffer();
var rx_next_chunk = 0;

function reset_rx() {
    rx_bytebuffer = new ByteBuffer();
    rx_next_chunk = 0;
}


function on_rx_data(data) {
    const op = active_op;
    if (!op) return; // Ignore unsolicited/stale notifications outside an exchange.
    if (op.rx_done) {
        abort_transport(new Error('Unexpected extra Bluetooth response'));
        return;
    }
    var h;
    try {
        const buff = ByteBuffer.wrap(data);
        if (buff.remaining() < DF_HEADER_SIZE) throw new Error('Truncated Bluetooth frame');
        h = read_header(buff);
        if (h.cmd !== op.cmd || (h.chunk & 0x7fff) !== rx_next_chunk) {
            throw new Error('Unexpected Bluetooth response command or chunk');
        }
        const more = !!(h.chunk & 0x8000);
        if ((h.status !== 0 && more) || (more && rx_next_chunk === 0x7fff)) {
            throw new Error('Invalid Bluetooth response continuation');
        }
        if (rx_bytebuffer.offset + buff.remaining() > MAX_RESPONSE_BYTES) {
            throw new Error('Bluetooth response is too large');
        }
        if (h.status === 0) write_bytes(rx_bytebuffer, buff);
        ++rx_next_chunk;
        arm_response_timeout(op);
        if (more) return;
    } catch (error) {
        abort_transport(error);
        return;
    }
    try {
        // Preserve the FINAL device status. Partial data from preceding frames
        // must never turn a failed transfer into a successful short download.
        if (h.status === 0) {
            rx_bytebuffer.flip();
            h.data = op.rx_data_cb(ByteBuffer.wrap(rx_bytebuffer.toArrayBuffer()));
        }
        op.response = h;
    } catch (error) {
        op.rx_error = error;
    }
    op.rx_done = true;
    finish_when_ready(op);
}


function on_ble_disconnected(reason) {
    ++transport_generation;
    transport_capabilities = null;
    transport_probe = null;
    const error = reason instanceof Error ? reason : new Error('Bluetooth disconnected');
    clearTimeout(response_timer);
    response_timer = null;
    reset_rx();
    const pending = op_queue;
    op_queue = [];
    if (active_op) pending.unshift(active_op);
    active_op = null;
    op_ongoing = false;
    pending.forEach(op => op.p_reject(error));
    ++file_write_generation;
    const waiting = file_write_queue;
    file_write_queue = [];
    if (file_write_current) file_write_current.finish(error);
    waiting.forEach(entry => {
        try { entry.error_cb(error, entry.file); }
        finally {
            if (entry.done_cb) entry.done_cb();
            if (entry.completion) entry.completion();
        }
    });
}






