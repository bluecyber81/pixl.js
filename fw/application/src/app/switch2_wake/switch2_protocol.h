#ifndef SWITCH2_PROTOCOL_H
#define SWITCH2_PROTOCOL_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define SWITCH2_WAKE_ADV_LEN 31u
#define SWITCH2_PID_JC2_L 0x2066
#define SWITCH2_PID_JC2_R 0x2067
#define SWITCH2_PID_PRO2 0x2069
typedef struct {
    bool has_mac;
    uint8_t controller_mac[6];
    bool has_host;
    uint8_t host_mac[6];
    uint16_t pid;
    bool has_raw_data;
    uint8_t raw_data[SWITCH2_WAKE_ADV_LEN];
    uint8_t raw_data_len;
    bool connectable, auto_wake;
} switch2_wake_cfg_t;
typedef struct {
    uint8_t controller_mac[6], host_mac[6];
    uint16_t pid;
    uint8_t adv_data[SWITCH2_WAKE_ADV_LEN], adv_len;
} ble_switch2_scan_result_t;

bool parse_mac_str(const char *str, uint8_t out[6]);
void switch2_wake_cfg_set_default(switch2_wake_cfg_t *cfg);
bool switch2_wake_parse_cfg(switch2_wake_cfg_t *cfg, char *text);
int switch2_wake_format_cfg(const switch2_wake_cfg_t *cfg, char *out, size_t capacity);
uint8_t switch2_wake_build_adv(const switch2_wake_cfg_t *cfg, uint8_t out[SWITCH2_WAKE_ADV_LEN]);
/* BLE advertising PDU including the two-byte header and six-byte AdvA.
 * Accept only public controller addresses and the observed Nintendo format. */
bool switch2_wake_parse_packet(const uint8_t *packet, size_t size, ble_switch2_scan_result_t *out);
#endif
