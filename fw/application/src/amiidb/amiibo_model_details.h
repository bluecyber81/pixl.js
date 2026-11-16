#ifndef AMIIBO_MODEL_DETAILS_H
#define AMIIBO_MODEL_DETAILS_H

#include <stddef.h>
#include <stdint.h>

enum { AIR_RIDERS_GAME_ID = 75, OOT_GAME_ID = 82 };
typedef enum {
    MODEL_DEFAULT,
    OOT_YOUNG_LINK,
    OOT_YOUNG_ZELDA,
    KIRBY_WARP_STAR,
    SWORD_KIRBY_DRAGOON,
    META_KNIGHT_SHADOW_STAR,
    KING_DEDEDE_TANK_STAR,
    NOIR_DEDEDE_HYDRA,
    BANDANA_WADDLE_DEE_WINGED_STAR,
    CHEF_KAWASAKI_HOP_STAR,
} amiibo_detail_model_t;

/* Match the full model ID. The two Ocarina of Time IDs were observed in
 * prerelease files. Earlier Young Link and Zelda models stay distinct. */
static inline amiibo_detail_model_t amiibo_detail_model(uint32_t head, uint32_t tail) {
    switch (tail) {
    case 0x04fd0902: return head == 0x01000000 ? OOT_YOUNG_LINK : MODEL_DEFAULT;
    case 0x04ff0902: return head == 0x01010000 ? OOT_YOUNG_ZELDA : MODEL_DEFAULT;
    case 0x04c41e03: return head == 0x1f000000 ? KIRBY_WARP_STAR : MODEL_DEFAULT;
    case 0x04c51e03: return head == 0x1f000100 ? SWORD_KIRBY_DRAGOON : MODEL_DEFAULT;
    case 0x04c61e03: return head == 0x1f010000 ? META_KNIGHT_SHADOW_STAR : MODEL_DEFAULT;
    case 0x04c71e03: return head == 0x1f020000 ? KING_DEDEDE_TANK_STAR : MODEL_DEFAULT;
    case 0x04c81e03: return head == 0x1f020100 ? NOIR_DEDEDE_HYDRA : MODEL_DEFAULT;
    case 0x04c91e03: return head == 0x1f030100 ? BANDANA_WADDLE_DEE_WINGED_STAR : MODEL_DEFAULT;
    case 0x04ca1e03: return head == 0x1f040000 ? CHEF_KAWASAKI_HOP_STAR : MODEL_DEFAULT;
    default: return MODEL_DEFAULT;
    }
}

static inline const char *amiibo_detail_german_name(uint32_t head, uint32_t tail) {
    switch (amiibo_detail_model(head, tail)) {
    case OOT_YOUNG_LINK: return "Junger Link (Ocarina of Time)";
    case OOT_YOUNG_ZELDA: return "Junge Zelda (Ocarina of Time)";
    case KIRBY_WARP_STAR: return "Kirby & Warp-Stern";
    case SWORD_KIRBY_DRAGOON: return "Kirby mit Schwert & Dragoon";
    case META_KNIGHT_SHADOW_STAR: return "Meta-Knight & Schatten-Stern";
    case KING_DEDEDE_TANK_STAR: return "König Dedede & Panzer-Stern";
    case NOIR_DEDEDE_HYDRA: return "Dedede Noir & Hydra";
    case BANDANA_WADDLE_DEE_WINGED_STAR: return "Waddle-Dee-Assistent & Flügel-Stern";
    case CHEF_KAWASAKI_HOP_STAR: return "Koch Kawasaki & Hopp-Stern";
    default: return NULL;
    }
}
#endif
