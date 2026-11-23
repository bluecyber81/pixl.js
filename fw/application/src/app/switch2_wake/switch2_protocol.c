/* Nintendo wake payload from PR479 (Aragamiz, b0ade162). Parsing is bounded;
 * no filesystem/radio/UI access and no partially published configuration. */
#include "switch2_protocol.h"
#include <stdio.h>
#include <string.h>

static int hex_nibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}
static int parse_hex_bytes(const char *str, uint8_t *out, size_t capacity) {
    int hi = -1;
    size_t n = 0;
    for (; *str; ++str) {
        if (*str == ' ' || *str == '\t' || *str == ':' || *str == '-') continue;
        int v = hex_nibble(*str);
        if (v < 0) return -1;
        if (hi < 0) hi = v;
        else {
            if (n == capacity) return -1;
            out[n++] = (uint8_t)((hi << 4) | v);
            hi = -1;
        }
    }
    return hi < 0 ? (int)n : -1;
}
static bool valid_mac(const uint8_t *mac) {
    bool zero = true, ones = true;
    for (unsigned i = 0; i < 6; ++i) { zero &= mac[i] == 0; ones &= mac[i] == 0xff; }
    return !zero && !ones;
}
bool parse_mac_str(const char *str, uint8_t out[6]) {
    uint8_t parsed[6];
    if (!str || !out || parse_hex_bytes(str, parsed, sizeof(parsed)) != 6 || !valid_mac(parsed)) return false;
    memcpy(out, parsed, sizeof(parsed));
    return true;
}
void switch2_wake_cfg_set_default(switch2_wake_cfg_t *cfg) {
    memset(cfg, 0, sizeof(*cfg));
    cfg->pid = SWITCH2_PID_JC2_L;
}
static bool parse_adv(const uint8_t *data, size_t length, uint8_t host[6], uint16_t *pid) {
    if (length != SWITCH2_WAKE_ADV_LEN) return false;
    bool found = false;
    size_t pos = 0;
    while (pos < length) {
        size_t field = data[pos];
        if (!field || field > length - pos - 1) return false;
        if (data[pos + 1] == 0xff) {
            const uint8_t *m = data + pos + 2;
            if (found || field < 20 || m[0] != 0x53 || m[1] != 0x05 ||
                m[2] != 1 || m[3] != 0 || m[4] != 3 || m[5] != 0x7e || m[6] != 0x05 ||
                m[11] != 0x81 || m[18] != 0x0f) return false;
            for (unsigned i = 0; i < 6; ++i) host[i] = m[17 - i];
            if (!valid_mac(host)) return false;
            *pid = (uint16_t)m[7] | (uint16_t)m[8] << 8;
            found = true;
        }
        pos += field + 1;
    }
    return found;
}
bool switch2_wake_parse_packet(const uint8_t *packet, size_t size, ble_switch2_scan_result_t *out) {
    if (!packet || !out || size < 8 || (packet[0] & 0x40)) return false;
    uint8_t kind = packet[0] & 0x0f;
    size_t length = packet[1];
    if ((kind != 0 && kind != 2 && kind != 6) || length != 6 + SWITCH2_WAKE_ADV_LEN || size < length + 2) return false;
    ble_switch2_scan_result_t result = {0};
    if (!parse_adv(packet + 8, length - 6, result.host_mac, &result.pid)) return false;
    for (unsigned i = 0; i < 6; ++i) result.controller_mac[i] = packet[7 - i];
    if (!valid_mac(result.controller_mac)) return false;
    memcpy(result.adv_data, packet + 8, SWITCH2_WAKE_ADV_LEN);
    result.adv_len = SWITCH2_WAKE_ADV_LEN;
    *out = result;
    return true;
}
static char *trim(char *text) {
    while (*text == ' ' || *text == '\t' || *text == '\r') ++text;
    size_t n = strlen(text);
    while (n && (text[n-1] == ' ' || text[n-1] == '\t' || text[n-1] == '\r')) text[--n] = 0;
    return text;
}
bool switch2_wake_parse_cfg(switch2_wake_cfg_t *cfg, char *text) {
    if (!cfg || !text) return false;
    switch2_wake_cfg_t parsed;
    switch2_wake_cfg_set_default(&parsed);
    for (char *line = text; line && *line;) {
        char *next = strchr(line, '\n');
        if (next) *next++ = 0;
        char *comment = strpbrk(line, "#;");
        if (comment) *comment = 0;
        line = trim(line);
        if (*line) {
            char *eq = strchr(line, '=');
            if (!eq) return false;
            *eq++ = 0;
            char *key = trim(line), *value = trim(eq);
            if (!strcmp(key, "mac")) {
                if (!parse_mac_str(value, parsed.controller_mac)) return false;
                parsed.has_mac = true;
            } else if (!strcmp(key, "host")) {
                if (!parse_mac_str(value, parsed.host_mac)) return false;
                parsed.has_host = true;
            } else if (!strcmp(key, "pid")) {
                uint8_t bytes[2];
                if (parse_hex_bytes(value, bytes, sizeof(bytes)) != 2) return false;
                parsed.pid = (uint16_t)bytes[0] << 8 | bytes[1];
            } else if (!strcmp(key, "data")) {
                if (parse_hex_bytes(value, parsed.raw_data, sizeof(parsed.raw_data)) != SWITCH2_WAKE_ADV_LEN) return false;
                parsed.has_raw_data = true;
                parsed.raw_data_len = SWITCH2_WAKE_ADV_LEN;
            } else if (!strcmp(key, "mode")) {
                if (strcmp(value, "conn") && strcmp(value, "nonconn")) return false;
                parsed.connectable = !strcmp(value, "conn");
            } else if (!strcmp(key, "auto_wake")) {
                if (strcmp(value, "0") && strcmp(value, "1")) return false;
                parsed.auto_wake = value[0] == '1';
            }
        }
        line = next;
    }
    if (parsed.has_raw_data) {
        if (!parse_adv(parsed.raw_data, parsed.raw_data_len, parsed.host_mac, &parsed.pid)) return false;
        parsed.has_host = true;
    }
    *cfg = parsed;
    return true;
}
uint8_t switch2_wake_build_adv(const switch2_wake_cfg_t *cfg, uint8_t out[SWITCH2_WAKE_ADV_LEN]) {
    if (!cfg || !out) return 0;
    if (cfg->has_raw_data) {
        uint8_t host[6]; uint16_t pid;
        if (!parse_adv(cfg->raw_data, cfg->raw_data_len, host, &pid)) return 0;
        memcpy(out, cfg->raw_data, SWITCH2_WAKE_ADV_LEN);
        return SWITCH2_WAKE_ADV_LEN;
    }
    if (!cfg->has_host || !valid_mac(cfg->host_mac)) return 0;
    static const uint8_t prefix[] = {2,1,6,0x1b,0xff,0x53,5,1,0,3,0x7e,5};
    memset(out, 0, SWITCH2_WAKE_ADV_LEN);
    memcpy(out, prefix, sizeof(prefix));
    out[12] = (uint8_t)cfg->pid; out[13] = (uint8_t)(cfg->pid >> 8);
    out[15] = 1; out[16] = 0x81;
    for (unsigned i = 0; i < 6; ++i) out[17+i] = cfg->host_mac[5-i];
    out[23] = 0x0f;
    return SWITCH2_WAKE_ADV_LEN;
}
int switch2_wake_format_cfg(const switch2_wake_cfg_t *cfg, char *out, size_t capacity) {
    if (!cfg || !out || !capacity) return -1;
    int n = snprintf(out, capacity,
        "# Switch 2 BLE Wake\n%smac=%02X:%02X:%02X:%02X:%02X:%02X\n"
        "%shost=%02X:%02X:%02X:%02X:%02X:%02X\npid=%04X\nmode=%s\nauto_wake=%u\n",
        cfg->has_mac ? "" : "#", cfg->controller_mac[0], cfg->controller_mac[1], cfg->controller_mac[2],
        cfg->controller_mac[3], cfg->controller_mac[4], cfg->controller_mac[5],
        cfg->has_host ? "" : "#", cfg->host_mac[0], cfg->host_mac[1], cfg->host_mac[2],
        cfg->host_mac[3], cfg->host_mac[4], cfg->host_mac[5], cfg->pid,
        cfg->connectable ? "conn" : "nonconn", cfg->auto_wake ? 1u : 0u);
    if (n < 0 || (size_t)n >= capacity) return -1;
    if (cfg->has_raw_data) {
        uint8_t host[6]; uint16_t pid;
        if (!parse_adv(cfg->raw_data, cfg->raw_data_len, host, &pid) || capacity - (size_t)n < 69) return -1;
        memcpy(out+n, "data=", 5); n += 5;
        static const char hex[] = "0123456789ABCDEF";
        for (unsigned i=0; i<SWITCH2_WAKE_ADV_LEN; ++i) {
            out[n++] = hex[cfg->raw_data[i] >> 4]; out[n++] = hex[cfg->raw_data[i] & 15];
        }
        out[n++] = '\n'; out[n] = 0;
    }
    return n;
}
