#include "cwalk2.h"
#include "cwalk.h"
#include "vfs.h"
#include <stdio.h>
#include <string.h>

static size_t bounded_path_length(const char *path) {
    size_t length = 0;
    if (path) {
        while (length < VFS_MAX_PATH_LEN && path[length]) length++;
    }
    return length;
}

bool cwalk_append_segment(char *out_path, const char *path, const char *segment) {
    if (!out_path) return false;
    size_t path_length = bounded_path_length(path);
    size_t segment_length = bounded_path_length(segment);
    if (!path_length || !segment_length || path_length >= VFS_MAX_PATH_LEN ||
        segment_length >= VFS_MAX_PATH_LEN) {
        out_path[0] = 0;
        return false;
    }
    size_t separator = path[path_length - 1] == '/' ? 0 : 1;
    if (path_length + separator + segment_length >= VFS_MAX_PATH_LEN) {
        out_path[0] = 0;
        return false;
    }
    // The temporary buffer also supports out_path aliasing either input.
    char result[VFS_MAX_PATH_LEN];
    memcpy(result, path, path_length);
    if (separator) result[path_length] = '/';
    memcpy(result + path_length + separator, segment, segment_length);
    result[path_length + separator + segment_length] = 0;
    memcpy(out_path, result, path_length + separator + segment_length + 1);
    return true;
}

size_t cwalk_get_segment_size(const char *path) {
    if (!path || !path[0]) return 0;
    struct cwk_segment segment;
    size_t segment_size = 0;
    if (!cwk_path_get_first_segment(path, &segment)) {
        return 0;
    }

    do {
        segment_size++;
    } while (cwk_path_get_next_segment(&segment));

    return segment_size;
}

bool cwalk_same_prefix_segment(const char *base, const char *target) {
    size_t length = bounded_path_length(base);
    if (!length || length >= VFS_MAX_PATH_LEN || !target || strncmp(base, target, length) != 0) return false;
    return base[length - 1] == '/' || target[length] == 0 || target[length] == '/';
}


bool cwalk_dir_prefix_match(char* out_path, const char* path){
    if (!out_path) return false;
    size_t length = bounded_path_length(path);
    if (!length || length >= VFS_MAX_PATH_LEN) {
        out_path[0] = 0;
        return false;
    }
    size_t separator = path[length - 1] == '/' ? 0 : 1;
    if (length + separator >= VFS_MAX_PATH_LEN) {
        out_path[0] = 0;
        return false;
    }
    memmove(out_path, path, length);
    if (separator) out_path[length] = '/';
    out_path[length + separator] = 0;
    return true;
}
