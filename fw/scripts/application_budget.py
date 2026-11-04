"""Release gates derived from the linked Nordic LCD application map and binary."""
import re


def check_budget(map_text, binary_bytes):
    def one(pattern, name):
        matches = re.findall(pattern, map_text, re.MULTILINE)
        if len(matches) != 1:
            raise ValueError("Missing or ambiguous linker field: " + name)
        return matches[0]

    def region(name):
        fields = one(r"^" + name + r"\s+(0x[\da-fA-F]+)\s+(0x[\da-fA-F]+)\s+\w+\s*$", name)
        return tuple(int(field, 16) for field in fields)

    def symbol(name):
        return int(one(r"^\s*(0x[\da-fA-F]+)\s+" + name + r"\s*=.*$", name), 16)

    flash, ram = region("FLASH"), region("RAM")
    if flash != (0x19000, 0x5B000) or ram != (0x20003600, 0xCA00):
        raise ValueError("Unexpected LCD application regions")
    used = symbol("TotalFlashUsed")
    top, limit, heap = (symbol(key) for key in ("__StackTop", "__StackLimit", "__HeapLimit"))
    if not (0 < binary_bytes <= used <= flash[1] and ram[0] < heap <= limit < top == sum(ram)):
        raise ValueError("Inconsistent binary or RAM/flash linker symbols")
    margins = {"flash_reserve_bytes": flash[1] - used, "heap_stack_gap_bytes": limit - heap,
               "stack_reserved_bytes": top - limit}
    minima = {"flash_reserve_bytes": 8192, "heap_stack_gap_bytes": 1536, "stack_reserved_bytes": 8192}
    for name, floor in minima.items():
        if margins[name] < floor:
            raise ValueError(f"LCD budget {name}: {margins[name]} bytes, need at least {floor}")
    return {"binary_bytes": binary_bytes, "linker_flash_used_bytes": used, "observed": margins, "minimum": minima}
