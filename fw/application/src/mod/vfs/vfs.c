#include "vfs.h"

#include "vfs_driver_fs.h"
#define VFS_DRIVER {.enabled = true, .p_driver = &vfs_driver_fs}

typedef struct {
    bool enabled;
    const vfs_driver_t *p_driver;
} vfs_drive_item_t;

static const vfs_drive_item_t vfs_drive_items[VFS_DRIVE_MAX] = {
    [VFS_DRIVE_INT] =
        {
            .enabled = false,
            .p_driver = NULL,
        },
    [VFS_DRIVE_EXT] = VFS_DRIVER
};


#ifdef VFS_OLED_AUTO_ENABLE
/* Clients and the journal keep this pointer across mount and remount. */
vfs_driver_t vfs_driver_fs;
static const vfs_driver_t *oled_active_driver;
static int32_t oled_mount(void);

static int32_t oled_format(void) {
    if (!oled_active_driver || !oled_active_driver->mounted()) return VFS_ERR_NODEV;
    return oled_active_driver->format();
}

static void oled_bind(const vfs_driver_t *backend) {
    oled_active_driver = backend;
    /* The native LittleFS methods check the mounted flag, providing the
     * unavailable drive interface before identification. */
    vfs_driver_fs = backend ? *backend : vfs_oled_lfs_driver;
    vfs_driver_fs.mount = oled_mount;
    vfs_driver_fs.format = oled_format;
}

static int32_t oled_mount(void) {
    if (oled_active_driver && oled_active_driver->mounted()) return VFS_OK;
    oled_bind(NULL);
    int32_t result = vfs_oled_lfs_driver.mount();
    if (result == VFS_OK) {
        oled_bind(&vfs_oled_lfs_driver);
    } else if (result == VFS_ERR_CRPT) {
        /* Only a failed superblock check can be a candidate for SPIFFS. */
        result = vfs_oled_spiffs_driver.mount();
        if (result == VFS_OK) oled_bind(&vfs_oled_spiffs_driver);
    }
    return result;
}
uint8_t vfs_oled_backend(void) {
    if (!oled_active_driver || !oled_active_driver->mounted()) return 0;
    return oled_active_driver == &vfs_oled_spiffs_driver ? 1 : 2;
}
#endif

bool vfs_drive_enabled(vfs_drive_t drive) {
    return (unsigned)drive < VFS_DRIVE_MAX && vfs_drive_items[drive].enabled;
}

vfs_driver_t *vfs_get_driver(vfs_drive_t drive) {
#ifdef VFS_OLED_AUTO_ENABLE
    if (!vfs_driver_fs.mount) oled_bind(NULL);
#endif
    return (unsigned)drive < VFS_DRIVE_MAX ? (vfs_driver_t *)vfs_drive_items[drive].p_driver : NULL;
}

vfs_driver_t* vfs_get_default_driver() {
    for(uint32_t i=0; i<VFS_DRIVE_MAX; i++ ){
        if(vfs_drive_items[i].enabled){
            return vfs_get_driver((vfs_drive_t)i);
        }
    }
    return NULL;
}

vfs_drive_t vfs_get_default_drive() {
    for(uint32_t i=0; i<VFS_DRIVE_MAX; i++ ){
        if(vfs_drive_items[i].enabled){
            return i;
        }
    }
    return VFS_DRIVE_MAX;
}
