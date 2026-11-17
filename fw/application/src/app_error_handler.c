#include "app_error.h"
#include "app_util_platform.h"
#include "cache.h"
#include "fault_note.h"

#if (defined(BOARD_LCD) || defined(BOARD_OLED)) && defined(PIXL_RUNTIME_DIAGNOSTICS)
/* Zero validity before changing fields, write validity last. Retained SRAM
 * is untrusted after reset. The marker includes the record format version. */
#define FAULT_NOTE_V1 UINT32_C(0x31465850)
typedef struct {
    uint32_t magic, kind, id, pc, inverse_kind, inverse_id, inverse_pc;
} retained_fault_t;
static volatile retained_fault_t retained __attribute__((section(".pixl_fault"), aligned(4)));
_Static_assert(sizeof(retained) == 28, "retained fault ABI");
static fault_note_t previous;

void fault_note_on_boot(void) {
    previous = (fault_note_t){0};
    if (retained.magic == FAULT_NOTE_V1) {
        fault_note_t note = {retained.kind, retained.id, retained.pc};
        if (note.kind >= FAULT_NOTE_SDK && note.kind <= FAULT_NOTE_EXIT &&
            retained.inverse_kind == ~note.kind && retained.inverse_id == ~note.sdk_id &&
            retained.inverse_pc == ~note.pc && note.pc < UINT32_C(0x80000) &&
            (note.kind == FAULT_NOTE_SDK || (!note.sdk_id && !note.pc)))
            previous = note;
    }
    retained.magic = 0;
}

const fault_note_t *fault_note_previous(void) { return &previous; }
#endif

/* Error recovery must not depend on a usable UI, logger, heap or fault frame.
 * The retained cache may describe the operation that failed: invalidate it
 * with one RAM store, without CRC work or modifying the persistent files. */
static __attribute__((used, noinline, noreturn)) void fault_stop(uint32_t kind, uint32_t id, uint32_t pc) {
    __disable_irq();
#if (defined(BOARD_LCD) || defined(BOARD_OLED)) && defined(PIXL_RUNTIME_DIAGNOSTICS)
    if (pc >= UINT32_C(0x80000)) pc = 0; /* Supplied code address only, never dereferenced. */
    retained.magic = 0;
    __DMB();
    retained.kind = kind;
    retained.id = id;
    retained.pc = pc;
    retained.inverse_kind = ~kind;
    retained.inverse_id = ~id;
    retained.inverse_pc = ~pc;
    __DMB();
    retained.magic = FAULT_NOTE_V1;
#else
    (void)kind;
    (void)id;
    (void)pc;
#endif
    cache_invalidate();
    __DSB();
#ifdef DEBUG
    /* Do not call app_error_save_and_stop: it dereferences the fault's info
     * pointer for SDK errors. Raw registers remain available to a debugger. */
    NRF_BREAKPOINT_COND;
#else
    NVIC_SystemReset();
#endif
    while (1) {}
}

void app_error_fault_handler(uint32_t id, uint32_t pc, uint32_t info) {
    (void)info;
    fault_stop(FAULT_NOTE_SDK, id, pc);
}

#if (defined(BOARD_LCD) || defined(BOARD_OLED)) && defined(PIXL_RUNTIME_DIAGNOSTICS) && defined(NRF52832) && defined(__thumb__)
/* A damaged MSP or an extended PSP exception frame must not be inspected.
 * This terminal handler never returns. Give its C calls the known top of
 * the application stack before executing any compiler-generated prologue. */
_Static_assert(FAULT_NOTE_HARD == 2, "fault entry assembly");
__attribute__((naked)) void HardFault_Handler(void) {
    __asm volatile("cpsid i\n"
                   "ldr r3, =__StackTop\n"
                   "msr msp, r3\n"
                   "movs r0, #2\n"
                   "movs r1, #0\n"
                   "movs r2, #0\n"
                   "b fault_stop");
}
#else
void HardFault_Handler(void) {
    /* No guessed MSP offset: the exception may use PSP or an extended frame. */
    fault_stop(FAULT_NOTE_HARD, 0, 0);
}
#endif

void _exit(int status) {
    (void)status;
    fault_stop(FAULT_NOTE_EXIT, 0, 0);
}
