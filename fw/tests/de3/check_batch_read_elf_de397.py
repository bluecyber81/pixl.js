"""Execute the linked LCD batch parser, TLSF, SHA and reply path on Cortex-M4.

PackedFS readiness/generation and read_file_data are modeled boundaries here;
the host C suite separately executes the real PackedFS/adapter on synthetic NOR.
No physical storage, radio, SoftDevice timing or complete application stack test.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from subprocess import check_output

from check_build_fault_elf import firmware
from check_stack_watermark_elf import tool
from unicorn import (Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB,
                     UC_PROT_EXEC, UC_PROT_READ, UC_PROT_WRITE)
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_PRIMASK, UC_ARM_REG_R0,
                               UC_ARM_REG_R1, UC_ARM_REG_R2)


def verify(folder, expected_counter=670):
    metadata, s, image, _ = firmware(folder)
    assert isinstance(expected_counter, int) and 0 < expected_counter <= 0xffffffff
    assert metadata["counter"] == expected_counter, (metadata["counter"], expected_counter)
    # LTO may give a unique local object a linker-private suffix.
    for name in ("store", "packed_read_file_data"):
        if name not in s:
            matches = [addr for key, addr in s.items() if key.startswith(name + ".lto_priv.")]
            if len(matches) == 1:
                s[name] = matches[0]
    sizes = {r[3]: int(r[1], 16) for line in check_output(
        [tool("nm"), "-S", folder / "pixljs.out"], text=True).splitlines()
        if len(r := line.split()) == 4}
    assert sizes["small_read"] == 12
    registry = {}
    start = s["df_proto_handler_vfs_entries"] - s["__isr_vector"]
    for i in range(64):
        command, handler = struct.unpack_from("<B3xI", image, start + i * 8)
        if not command:
            assert not handler
            break
        assert handler & 1 and command not in registry
        registry[command] = handler - 1
    else:
        raise AssertionError("Unterminated VFS command registry")
    assert registry[0x22] == registry[0x25] == s["df_small_create_capability"]
    assert registry[0x24] == s["df_proto_handler_vfs_small_read"]
    assert registry[0x26] == s["df_proto_handler_vfs_batch_read"]
    if expected_counter == 683:
        assert registry[0x29] == registry[0x22] and registry[0x2a] == registry[0x28] == s["df_group_request"]
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_write(s["__isr_vector"], image)
    cpu.mem_protect(0, 0x80000, UC_PROT_READ | UC_PROT_EXEC)
    cpu.mem_map(0x20000000, 0x10000, UC_PROT_READ | UC_PROT_WRITE)
    cpu.mem_map(0xe000e000, 0x1000)
    cpu.mem_write(s["__data_start__"], bytes(cpu.mem_read(s["__etext"], s["__data_end__"] - s["__data_start__"])))
    cpu.mem_write(s["mount_epoch"], struct.pack("<I", 1))
    scratch = s["__HeapBase"]
    event, frame, monitor = scratch, scratch + 8, scratch + 264
    assert monitor + 28 <= s["__HeapLimit"]
    replies, reads, reply_read_counts, cases = [], [], [], []
    files = {}
    generation = 10358
    mounted, poisoned, imported, handles_idle = True, False, False, True
    fail_read, mutate_after, sha_failure = 0, 0, False
    minimum_sp = s["__StackTop"]
    peak_tlsf_delta = 0

    def respond(value=0, high=None):
        cpu.reg_write(UC_ARM_REG_R0, value & 0xffffffff)
        if high is not None:
            cpu.reg_write(UC_ARM_REG_R1, high & 0xffffffff)
        cpu.reg_write(UC_ARM_REG_PC, cpu.reg_read(UC_ARM_REG_LR))

    def hook(name, callback):
        def run(machine, address, size, user):
            callback()
        return cpu.hook_add(UC_HOOK_CODE, run, begin=s[name], end=s[name])

    indirect = not all(name in s for name in ("pfs_poisoned", "pfs_generation", "pfs_import_pending"))
    if indirect:
        # Compute the layout using the same target ABI and verified storage
        # sources. Exercise the *real* optimized readiness/generation logic.
        from tempfile import TemporaryDirectory
        from subprocess import run
        fw = Path(__file__).resolve().parents[2]
        core = fw / "application/src/mod/vfs"
        lfs = fw / "components/littlefs"
        from sys import path as modules
        modules.insert(0, str(fw / "scripts"))
        from packed_identity import identity
        assert identity(core, lfs)[1] == metadata["packed_engine_identity"]["engine_sha256"]
        with TemporaryDirectory() as temp:
            d = Path(temp)
            f = d / "abi.c"
            f.write_text('#include <stddef.h>\n#include "packed_fs.c"\n'
              'const unsigned shape[] = {sizeof(pfs_t),offsetof(pfs_t,mounted),offsetof(pfs_t,poisoned),'
              'offsetof(pfs_t,current.pending),offsetof(pfs_t,handles),offsetof(pfs_t,current.generation)};\n')
            run([tool("gcc"), "-std=c99", "-Os", "-mcpu=cortex-m4", "-mthumb", "-fdata-sections",
                 "-DBOARD_LCD", "-DPIXL_RUNTIME_DIAGNOSTICS", "-DLFS_NO_MALLOC", "-DLFS_NO_DEBUG",
                 "-DLFS_NO_ERROR", "-DLFS_NO_ASSERT", "-DLFS_NO_WARN", "-I"+str(core), "-I"+str(lfs),
                 "-c", str(f), "-o", str(d/"abi.o")], check=True)
            run([tool("objcopy"), "-O", "binary", "--only-section=.rodata.shape", str(d/"abi.o"), str(d/"abi.bin")], check=True)
            shape = struct.unpack("<6I", (d/"abi.bin").read_bytes())
        def refresh_model():
            cpu.mem_write(store+shape[1], bytes([mounted]))
            cpu.mem_write(store+shape[2], bytes([poisoned]))
            cpu.mem_write(store+shape[3], struct.pack("<I", int(imported)))
            cpu.mem_write(store+shape[4], struct.pack("<I", 0 if handles_idle else store))
            cpu.mem_write(store+shape[5], struct.pack("<I", generation))
    else:
        hook("pfs_mounted", lambda: respond(mounted))
        hook("pfs_poisoned", lambda: respond(poisoned))
        hook("pfs_import_pending", lambda: respond(imported))
        hook("pfs_idle", lambda: respond(handles_idle))
        hook("pfs_generation", lambda: respond(generation))
        def refresh_model():
            pass

    def read_file():
        nonlocal generation
        pointer = cpu.reg_read(UC_ARM_REG_R0)
        raw = bytearray()
        while byte := cpu.mem_read(pointer + len(raw), 1)[0]:
            raw.append(byte)
            assert len(raw) < 66
        path = raw.decode("utf-8")
        target, capacity = cpu.reg_read(UC_ARM_REG_R1), cpu.reg_read(UC_ARM_REG_R2)
        reads.append((path, capacity))
        assert 1 <= capacity <= 573
        if len(reads) == fail_read or path not in files:
            respond(-1)
            return
        data = files[path][:capacity]
        cpu.mem_write(target, data)
        if len(reads) == mutate_after:
            generation += 1
            refresh_model()
        respond(len(data))

    hook("packed_read_file_data", read_file)

    def capture():
        data = bytes(cpu.mem_read(cpu.reg_read(UC_ARM_REG_R0), 248))
        replies.append((data[0], data[1], struct.unpack_from("<H", data, 2)[0], data[4:4 + data[247]]))
        reply_read_counts.append(len(reads))
        respond()

    hook("df_core_send_frame", capture)

    def optional_sha_failure():
        if sha_failure:
            respond(-1)

    hook("mbedtls_sha256_ret", optional_sha_failure)

    def measure_stack(machine, address, size, user):
        nonlocal minimum_sp
        minimum_sp = min(minimum_sp, machine.reg_read(UC_ARM_REG_MSP))

    cpu.hook_add(UC_HOOK_CODE, measure_stack)

    def call(name, *args):
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2), args):
            cpu.reg_write(reg, value & 0xffffffff)
        cpu.reg_write(UC_ARM_REG_MSP, s["__StackTop"])
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.reg_write(UC_ARM_REG_PRIMASK, 0)
        cpu.emu_start(s[name] | 1, 0x100, count=1000000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100, name
        assert cpu.reg_read(UC_ARM_REG_MSP) == s["__StackTop"], name
        return cpu.reg_read(UC_ARM_REG_R0)

    def free_space():
        call("mui_mem_monitor", monitor)
        return struct.unpack("<7I", cpu.mem_read(monitor, 28))[2:4]

    call("mui_mem_init")
    if indirect:
        store = call("mui_mem_malloc", shape[0])
        assert store and 0x20000000 <= store < 0x20010000 - shape[0]
        cpu.mem_write(store, bytes(shape[0]))
        cpu.mem_write(s["store"], struct.pack("<I", store))
        refresh_model()
    initial_free, initial_largest = free_space()

    def request(command, payload=b"", status=0, chunk=0, event_type=2, reset=True):
        nonlocal peak_tlsf_delta
        refresh_model()
        if reset:
            replies.clear()
            reads.clear()
            reply_read_counts.clear()
        cpu.mem_write(event, struct.pack("<II", event_type, frame if event_type == 2 else 0))
        raw = bytearray(struct.pack("<BBH243xB", command, status, chunk, len(payload)))
        assert len(payload) <= 243
        raw[4:4 + len(payload)] = payload
        cpu.mem_write(frame, bytes(raw))
        name = "df_small_create_capability" if command in (0x22, 0x25) else "df_proto_handler_vfs_batch_read"
        free_before = free_space()[0]
        call(name, event)
        peak_tlsf_delta = max(peak_tlsf_delta, free_before - free_space()[0])
        return replies.copy()

    def packet(mode, chosen, revision=None):
        rev = (1 << 32) | generation if revision is None else revision
        data = bytes((mode, len(chosen))) + struct.pack("<Q", rev)
        for path, size in chosen:
            encoded = ("E:" + path).encode("utf-8")
            data += struct.pack("<H", len(encoded)) + encoded + struct.pack("<H", size)
        return data

    def rejected(payload, **kwargs):
        assert request(0x26, payload, **kwargs) == [(0x26, 1, 0, b"")]
        assert bytes(cpu.mem_read(s["small_read"], 12)) == bytes(12)
        assert free_space() == (initial_free, initial_largest)

    for command, prefix in ((0x22, b"PXSC\1\7"), (0x25, b"PXBR\1\4")):
        expected = prefix + struct.pack("<HQ", 572, (1 << 32) | generation)
        assert request(command) == [(command, 0, 0, expected)]
        assert request(command, b"\0") == [(command, 1, 0, b"")]
    cases.append("linked_registration_and_exact_unchanged_PXSC_new_PXBR")

    for lengths in ((0, 0, 0, 0), (0, 1, 540, 572), (572, 572, 572, 572)):
        files = {path: bytes((i + j * 13) % 256 for j in range(n))
                 for i, (path, n) in enumerate(zip(("/a", "/b", "/c", "/ä-文"), lengths))}
        chosen = [(p, len(data)) for p, data in files.items()]
        for mode in (0, 1):
            for capacity in (16, 243):
                cpu.mem_write(s["m_ble_nus_max_data_len"], struct.pack("<H", capacity + 4))
                expected = b"".join(sha256(data).digest() if mode else data for data in files.values())
                request(0x26, packet(mode, chosen))
                assert len(reads) == reply_read_counts[0] == 4
                while replies[-1][2] & 0x8000:
                    request(0x26, event_type=3, reset=False)
                    assert len(replies) <= 143
                assert b"".join(r[3] for r in replies) == expected
                for i, (command, status, chunk, data) in enumerate(replies):
                    assert command == 0x26 and not status and chunk & 0x7fff == i
                    assert bool(chunk & 0x8000) == (i + 1 < len(replies)) and len(data) <= capacity
                assert bytes(cpu.mem_read(s["small_read"], 12)) == bytes(12)
                assert free_space() == (initial_free, initial_largest)
    cases.append("actual_linked_READ_SHA_TLSF_empty_UTF8_max4x572_and_minimum_payload")

    valid = packet(0, chosen)
    for size in range(len(valid)):
        rejected(valid[:size])
    for invalid in (valid + b"\0", b"\2" + valid[1:], valid[:1] + b"\5" + valid[2:],
                    packet(0, chosen, 0), packet(0, chosen, generation), packet(0, [("/a", 573)]),
                    packet(0, [("/../a", 572)])):
        rejected(invalid)
    rejected(valid, status=1)
    rejected(valid, chunk=0x8000)
    cases.append("linked_full_preflight_bounds_and_revision_errors_leave_TLSF_unchanged")

    for mode in (0, 1):
        for index in range(1, 5):
            fail_read = index
            rejected(packet(mode, chosen))
            assert len(reads) == index
            fail_read = 0
            mutate_after = index
            rejected(packet(mode, chosen))
            mutate_after = 0
        rejected(packet(mode, [("/a", 571)]))
        files["/a"] = files["/a"][:570]
        rejected(packet(mode, [("/a", 572)]))
        files["/a"] = bytes(j % 256 for j in range(572))
    sha_failure = True
    rejected(packet(1, chosen))
    sha_failure = False
    for gate in ("mounted", "poisoned", "imported", "handles_idle"):
        old = (mounted, poisoned, imported, handles_idle)
        mounted = gate != "mounted"
        poisoned = gate == "poisoned"
        imported = gate == "imported"
        handles_idle = gate != "handles_idle"
        rejected(packet(0, chosen))
        mounted, poisoned, imported, handles_idle = old
    cases.append("linked_read_error_grow_shrink_postrevision_SHA_and_storage_readiness_guards")

    cpu.mem_write(s["m_ble_nus_max_data_len"], struct.pack("<H", 20))
    request(0x26, packet(0, chosen))
    assert replies[-1][2] & 0x8000
    call("df_proto_vfs_cleanup")
    assert free_space() == (initial_free, initial_largest)
    before = replies.copy()
    request(0x26, event_type=3, reset=False)
    assert replies == before
    # TLSF rounds its search class upward, so its largest free block is not an
    # unconditional promise that an equally sized request can be allocated.
    reserved = call("mui_mem_malloc", initial_largest - 1024)
    assert reserved
    before_free = free_space()
    assert before_free[1] < 2289
    assert request(0x26, packet(0, chosen)) == [(0x26, 1, 0, b"")]
    assert free_space() == before_free and bytes(cpu.mem_read(s["small_read"], 12)) == bytes(12)
    call("mui_mem_free", reserved)
    assert free_space() == (initial_free, initial_largest)
    cases.append("actual_TLSF_exhaustion_and_cleanup_restore_identical_free_space_and_largest_block")

    return dict(passed=True, deviceAccess=False, sourceId=metadata["source_id_sha256"],
                binSha256=metadata["artifacts_sha256"]["pixljs.bin"], cases=cases,
                expectedCounter=expected_counter, firmwareCounter=metadata["counter"],
                smallReadStaticBytes=sizes["small_read"], initialTlsfFree=initial_free,
                maxResponseTlsfFreeDelta=peak_tlsf_delta, finalTlsfFree=free_space()[0],
                linkedCallMaxObservedStack=s["__StackTop"] - minimum_sp,
                scope="Actual linked Cortex-M4 parser, guards, registry, TLSF, SHA256 and response chunking. "
                      "Storage readiness/generation and read_file_data plus response capture are explicit modeled boundaries. "
                      "No full BLE caller/interrupt stack, physical media/radio throughput or installation claim.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build", type=Path)
    parser.add_argument("--json", type=Path)
    parser.add_argument("--expected-counter", type=int, default=670,
                        help="Exact expected application counter; default retains the App670 guard")
    args = parser.parse_args()
    result = verify(args.build, args.expected_counter)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
