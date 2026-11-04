"""Behavior checks of real reset/DFU C through the real launcher contract.

Only peripheral boundaries and unrelated applications are mocked. This is not
an ARM build, a BLE-stack emulator, or an on-device flash test.
"""
import re
import unittest

from exit_contract_support_de358 import HERE, actual, compile_cases, function, launcher_fixture


def reset_boundary_fixture():
    body = actual("utils.c")
    functions = "\n\n".join(function(body, name) for name in (
        "system_prepare_reset", "system_reset_prepared", "system_cancel_reset",
        "enter_dfu", "system_reboot"))
    fixture = (HERE / "reset_boundary_fixture_de358.c.in").read_text(encoding="utf-8")
    return fixture.replace("/* ACTUAL_RESET_FUNCTIONS */", functions)


def async_reset_fixture():
    fixture = (HERE / "async_reset_exit_contract_de358.c.in").read_text(encoding="utf-8")
    fixture = fixture.replace("/* ACTUAL_LAUNCHER_FIXTURE */", launcher_fixture())
    fixture = fixture.replace("/* RESET_BOUNDARY_FIXTURE */", reset_boundary_fixture())
    fixture = fixture.replace("/* ACTUAL_PROTOCOL_HEADERS */", "\n".join(actual("mod/df/" + path)
        for path in ("df_defines.h", "df_driver.h", "df_core.h", "df_proto_info.h", "df_proto_vfs.h")))
    vfs = actual("mod/df/df_proto_vfs.c")
    info = actual("mod/df/df_proto_info.c")
    states = []
    for name, initializer in (("dir_chunk_state", "{.dir_closed = true}"), ("file_chunk_state", "{0}")):
        declaration = re.search(r"typedef struct \{[^{}]*\} " + name + r"_t;", vfs)
        assert declaration, "Actual VFS state definition not found: " + name
        states += [declaration.group(0), "static " + name + "_t " + name + " = " + initializer + ";"]
    fixture = fixture.replace("/* ACTUAL_VFS_STATE */", "\n".join(states))
    pending = []
    for module, name in ((vfs, "packed_restart_pending"), (info, "dfu_pending")):
        declaration = re.search(r"static bool " + name + r";", module)
        assert declaration, "Actual pending state not found: " + name
        pending.append(declaration.group(0))
    fixture = fixture.replace("/* ACTUAL_PENDING_STATE */", "\n".join(pending))
    fixture = fixture.replace("/* ACTUAL_VFS_FUNCTIONS */", "\n\n".join(function(vfs, name) for name in (
        "get_driver_by_label", "send_vfs_error", "send_error", "close_directory",
        "file_transfer_closed", "df_proto_vfs_file_transfer_closed", "df_proto_vfs_is_idle",
        "df_proto_vfs_cancel_restart", "df_proto_vfs_cleanup", "df_proto_handler_vfs_import_state")))
    fixture = fixture.replace("/* ACTUAL_DFU_FUNCTIONS */", "\n\n".join(function(info, name) for name in (
        "df_proto_info_cancel_pending", "df_proto_handler_info_enter_dfu")))
    return fixture.replace("/* ACTUAL_DF_CORE */", actual("mod/df/df_core.c"))


class ResetExitContractTests(unittest.TestCase):
    def test_actual_reset_utilities_keep_saved_owner_and_flags_ordered(self):
        fixture = (HERE / "reset_exit_contract_de358.c.in").read_text(encoding="utf-8")
        fixture = fixture.replace("/* ACTUAL_LAUNCHER_FIXTURE */", launcher_fixture())
        fixture = fixture.replace("/* RESET_BOUNDARY_FIXTURE */", reset_boundary_fixture())
        cases = (
            "direct DFU app-save refusal has no reset/flag/BLE/cache side effects",
            "direct reboot NTAG refusal precedes app preparation",
            "DFU flag-clear SVC failure cancels without resetting",
            "DFU flag-set SVC failure leaves owned magic disarmed",
            "unexpected reset return clears magic and releases the saved owner",
            "non-returning DFU reset keeps the reservation and unrelated flags",
            "normal reboot never changes GPREGRET",
            "preparation reused once by an asynchronous reset",
            "reset helpers cannot cancel or consume a prepared sleep",
            "failed preparation is retryable without losing the live owner",
            "cancel is idempotent and never triggers a save",
        )
        compile_cases(self, fixture, cases, "reset-exit")

    def test_actual_protocol_cancels_replaced_or_aborted_reset_requests(self):
        cases = (
            "DFU rejects app-save refusal before acknowledging",
            "import restart rejects app-save refusal before acknowledging",
            "DFU preserves existing NTAG save refusal",
            "import restart preserves existing NTAG save refusal",
            "malformed DFU fields cannot prepare or reset",
            "malformed import shape cannot prepare or reset",
            "DFU refuses an open abandoned file without closing it",
            "all VFS busy states prohibit import restart",
            "mount, packed handle and unfinished import guards precede save",
            "DFU saves before ACK and consumes TX_READY once",
            "import restart saves before ACK and consumes TX_READY once",
            "disconnect disarms accepted DFU and releases both writers",
            "disconnect disarms accepted import restart and releases writers",
            "DFU send failure aborts; protocol disconnect cleanup prevents reset",
            "import send failure aborts; protocol disconnect cleanup prevents reset",
            "ordinary replacement disarms old DFU before dispatch",
            "unknown replacement disarms old import restart",
            "DFU replaced by import cannot later force DFU mode",
            "import replaced by DFU cannot later force normal reboot",
            "replacement DFU save refusal cannot reuse an earlier ACK",
            "malformed import replacement cannot reuse an earlier ACK",
            "stale owner handle cannot consume a reset reservation",
            "explicit cancellation and app switch invalidate the old reset",
            "import query, finish and binding retain non-reset behavior",
            "finish/bind failure cannot prepare or restart",
            "pending cancellation and disconnect cleanup are idempotent",
            "DFU/import cannot consume or cancel a prepared sleep",
        )
        compile_cases(self, async_reset_fixture(), cases, "async-reset-exit")


if __name__ == "__main__":
    unittest.main()
