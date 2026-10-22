<template>

  <el-config-provider :locale="elementLocale"><div class="filemanager">
    <h2>Allmiibo Dateimanager · DE3.12</h2>
    <div class="action-right">
      <el-dropdown trigger="click" class="international" @command="handle_set_language">
        <div>
          <el-button size="small" type="primary" >{{ $t('lang.choose') }}</el-button>
        </div>
        <template #dropdown><el-dropdown-menu>
          <el-dropdown-item :disabled="language === 'zh_CN'" command="zh_CN" divided>
            {{ $t('lang.zhcn') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'zh_TW'" command="zh_TW" divided>
            {{ $t('lang.zhtw') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'en'" command="en" divided>
            {{ $t('lang.en') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'es'" command="es" divided>
            {{ $t('lang.es') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'ru_RU'" command="ru_RU" divided>
            {{ $t('lang.ru') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'de_DE'" command="de_DE" divided>
            {{ $t('lang.de') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'sv_SE'" command="sv_SE" divided>
            {{ $t('lang.sv') }}
          </el-dropdown-item>
          <el-dropdown-item :disabled="language === 'ja_JP'" command="ja_JP" divided>
            {{ $t('lang.ja') }}
          </el-dropdown-item>
        </el-dropdown-menu></template>
      </el-dropdown>
    </div>
    <p class="header">Pixl.js / Allmiibo</p>
    <el-row>
      <el-col :span="14">
        <div class="action-left">
          <el-button-group>
            <el-button size="small" type="primary" @click="on_btn_upload"
              :disabled="btn_disabled()">{{ $t('menu.upload')  }}</el-button>
          </el-button-group>
          <el-button-group>
            <el-button size="small" @click="on_btn_new_folder"
              :disabled="btn_disabled()">{{ $t('menu.newfolder')  }}</el-button>
            <el-button size="small" type="danger" @click="on_btn_remove"
              :disabled="btn_disabled() || !table_selection.length">{{ $t('menu.del')  }}</el-button>
          </el-button-group>
          <el-button-group>
            <el-button size="small" @click="on_btn_up" :disabled="btn_disabled()">{{ $t('menu.up')  }}</el-button>
            <el-button size="small" @click="on_btn_refresh" :disabled="!connected || busy">{{ $t('menu.refresh') }}</el-button>
          </el-button-group>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="action-right">
          <el-button type="success" size="small" v-if="version">{{ version }}</el-button>
          <a class="dfu-page-link" href="https://thegecko.github.io/web-bluetooth-dfu/examples/web.html"
            target="_blank" rel="noopener noreferrer">{{ $t('menu.dfupage') }}</a>
          <el-button-group>
            <el-button type="info" size="small" @click="on_btn_enter_dfu"
              :disabled="!connected || busy">{{ $t('menu.enterdfu') }}</el-button>
            <el-button :type="connBtnType" size="small" @click="on_btn_ble_connect">{{
              connBtnText
            }}</el-button>
          </el-button-group>
        </div>
      </el-col>
    </el-row>
    <el-row>
      <el-col :span="24">
        <div class="folder-path">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>{{ current_dir }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
      </el-col>
    </el-row>
    <div>
      <el-table ref="multipleTable" :data="tableData" tooltip-effect="dark" style="width: 100%" v-loading="table_loading"
        :element-loading-text="$t('status.loading')"  cell-class-name="file-cell"
        @selection-change="on_table_selection_change"
        :default-sort="{ prop: 'name', order: 'ascending' }">
        <el-table-column type="selection" width="42" :selectable="row => row.type !== 'DRIVE' && !busy">
        </el-table-column>
        <el-table-column prop="name" :label="$t('labels.name')" sortable :sort-method="sort_table_row_name" width="320">
          <template #default="scope">
            <span class="file-symbol" aria-hidden="true">{{ scope.row.type === "REG" ? "▤" : scope.row.type === "DIR" ? "▣" : "◫" }}</span>
            <button type="button" class="file-name-action" :disabled="!connected || table_loading || mutating || pendingUploads > 0" @click="handle_name_click(scope.$index, scope.row)">
              {{ scope.row.name }}</button>
          </template>
        </el-table-column>
        <el-table-column prop="size" :label="$t('labels.size')" sortable :sort-method="sort_table_row_size" width="150">
        </el-table-column>
        <el-table-column prop="type" :label="$t('labels.type')" sortable width="80">
        </el-table-column>
        <el-table-column prop="notes" :label="$t('labels.remark')" sortable>
        </el-table-column>
        <el-table-column label="" fixed="right" width="40">
          <template #default="scope">
            <el-dropdown trigger="click" :disabled="!connected || busy" @command="command => on_row_command(command, scope.row)">
              <button type="button" class="row-menu" :aria-label="$t('contxmenu.prop') + ': ' + scope.row.name" :disabled="!connected || busy">
                <span aria-hidden="true">▾</span>
              </button>
              <template #dropdown><el-dropdown-menu>
                <el-dropdown-item command="remove"
                  v-if="scope.row.type != 'DRIVE'">{{ $t('contxmenu.del') }}</el-dropdown-item>
                <el-dropdown-item command="rename"
                  v-if="scope.row.type != 'DRIVE'">{{ $t('contxmenu.rename') }}</el-dropdown-item>
                <el-dropdown-item command="meta" :disabled="scope.row.metadataValid === false"
                  v-if="scope.row.type != 'DRIVE'">{{ $t('contxmenu.prop') }}</el-dropdown-item>
                <el-dropdown-item command="format"
                  v-if="scope.row.type == 'DRIVE'">{{ $t('contxmenu.format') }}</el-dropdown-item>
              </el-dropdown-menu></template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog :title="$t('properties.title')" v-model="meta_diag_visible" width="min(560px, 92vw)" :close-on-click-modal="!mutating" :close-on-press-escape="!mutating" :show-close="!mutating">
      <el-form ref="form" :model="meta_form" label-width="80px" :disabled="mutating">
        <el-form-item :label="$t('properties.remark')">
          <el-input v-model="meta_form.notes"></el-input>
        </el-form-item>
        <el-form-item :label="$t('properties.attrib')">
          <el-checkbox v-model="meta_form.flags.hide">{{ $t('properties.hide') }}</el-checkbox>
          <el-checkbox v-model="meta_form.flags.readonly">{{ $t('properties.readonly') }}</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="mutating" @click="meta_diag_visible = false">{{ $t('btn.cancel') }}</el-button>
        <el-button type="primary" :loading="mutating" :disabled="!connected || busy" @click="on_diag_meta_close">{{ $t('btn.ok') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="$t('upload.title')" v-model="upload_diag_visible" width="min(560px, 92vw)" :before-close="on_upload_diag_close">
      <div>
        <el-upload ref="upload" class="upload-demo" drag action="#" multiple
          :http-request="on_upload_request" :on-error="on_upload_error" :disabled="!connected" :before-remove="before_upload_remove">
          <span class="upload-symbol" aria-hidden="true">↑</span>
          <div class="el-upload__text">{{ $t('upload.drag') }} <em>{{ $t('upload.click') }}</em></div>
          <template #tip><div class="el-upload__tip">
            <ul>
              <li>{{ $t('upload.maxsize') }}</li>
              <li>{{ $t('upload.maxname') }}</li>
            </ul>
          </div></template>
        </el-upload>
      </div>
      <template #footer>
      </template>
    </el-dialog>

  </div></el-config-provider>
</template>



<script>
import * as pixl from "./lib/pixl.ble"
import { sharedEventDispatcher } from "./lib/event"
import * as proto from "./lib/pixl.proto"
import { getElementLocale } from "./i18n"
import { read_saved_language, save_language } from "./lib/locale"



export default {
  data() {
    return {
      tableData: [],
      connBtnType: "",
      connBtnText: `${this.$t("conn.connect")}`,
      version: "",
      connected: false,
      table_loading: false,
      mutating: false, connecting: false, pendingUploads: 0, pendingDownloads: 0,
      sessionGeneration: 0, listingGeneration: 0, firmwareVersion: "",
      current_dir: "",
      upload_diag_visible: false,
      table_selection: [],
      language: "de_DE",
      meta_diag_visible: false,
      meta_form: {
        notes: "",
        flags: {
          hide: false, readonly: false
        },
        amiibo: {
          head: 0,
          tail: 0
        },
        name: "",
        row: null
      }
    }
  },

  computed: {
    elementLocale() { return getElementLocale(this.language) },
    busy() { return this.table_loading || this.mutating || this.pendingUploads > 0 || this.pendingDownloads > 0 }
  },
  methods: {
    storage() { try { return window.localStorage; } catch (_) { return null; } },
    checked(response) {
      if (!response || response.status !== 0) throw new Error(this.$t('transfer.deviceerror') + ': ' + (response?.status ?? '?'));
      return response.data;
    },
    session_current(generation) { return this.connected && generation === this.sessionGeneration; },
    confirm_options() { return { confirmButtonText: this.$t('btn.ok'), cancelButtonText: this.$t('btn.cancel'), type: 'warning' }; },
    async mutate(action) {
      if (!this.connected || this.busy) return;
      const generation = this.sessionGeneration; this.mutating = true;
      try { await action(generation); }
      catch (error) { if (this.session_current(generation)) this.show_transfer_error(error); }
      finally { if (generation === this.sessionGeneration) this.mutating = false; }
    },
    on_row_command(command, row) {
      const handlers = { remove: this.on_row_btn_remove, rename: this.on_row_btn_rename, meta: this.on_row_btn_meta, format: this.on_row_btn_format };
      if (handlers[command] && this.connected && !this.busy) return handlers[command](0, row);
    },
    before_upload_remove(file) {
      if (file.status !== 'uploading' && file.status !== 'ready') return true;
      this.$message({ type: 'warning', message: this.$t('transfer.busy') }); return false;
    },
    sort_table_row_size(a, b) { return (a.sizeBytes || 0) - (b.sizeBytes || 0); },
    show_transfer_error(error) {
      if (error === 'cancel' || error === 'close') return;
      this.$message({ type: 'error', message: error?.message || String(error) });
    },
    on_btn_ble_connect() {
      if (this.connected || this.connecting) pixl.disconnect();
      else { this.connecting = true; this.connBtnText = this.$t('conn.connecting'); pixl.connect(); }
    },
    async on_ble_connected() {
      const generation = ++this.sessionGeneration;
      this.connected = true; this.connecting = false; this.connBtnType = 'success';
      this.connBtnText = this.$t('conn.disconnect');
      this.$notify({ title: 'Allmiibo', type: 'success', message: this.$t('conn.consuccess'), duration: 5000 });
      try {
        const data = this.checked(await proto.get_version());
        if (!this.session_current(generation)) return;
        this.firmwareVersion = data.ver;
        this.version = this.$t('status.connected') + data.ver;
        if (data.ver.startsWith('2.0.0')) this.$alert(this.$t('oldfirm.message'), this.$t('oldfirm.title')).catch(() => {});
        await this.reload_drive();
      } catch (error) { if (this.session_current(generation)) this.show_transfer_error(error); }
    },
    on_ble_disconnected() {
      ++this.sessionGeneration; ++this.listingGeneration;
      this.connecting = false; this.connected = false; this.mutating = false;
      this.meta_diag_visible = false; this.table_selection = []; this.firmwareVersion = "";
      this.connBtnType = "";
      this.connected = false;
      this.connBtnText = `${this.$t("conn.connect")}`;
      this.version = "";
      this.table_loading = false;
      this.tableData = [];
      this.current_dir = "";
      this.$notify({
        title: 'Pixl.js',
        type: 'error',
        message: `${this.$t("conn.disconnected")}`,
        duration: 5000
      });


    },
    on_ble_connect_error() {
      ++this.sessionGeneration; ++this.listingGeneration;
      this.connecting = false; this.connected = false; this.mutating = false;
      this.meta_diag_visible = false; this.table_selection = []; this.firmwareVersion = "";
      this.connBtnType = "";
      this.connBtnText = `${this.$t("conn.connect")}`;
      this.version = "";
      this.table_loading = false;
      this.tableData = [];
      this.current_dir = "";
      this.$notify({
        title: 'Pixl.js',
        type: 'error',
        message: `${this.$t("conn.connfailed")}`,
        duration: 5000
      });
    },

    async on_btn_enter_dfu() {
      if (!this.connected || this.busy) return;
      const generation = this.sessionGeneration;
      try {
        await this.$confirm(this.$t('dfumode.startconfirm'), this.$t('dfumode.title'), this.confirm_options());
        if (!this.session_current(generation)) return;
        this.checked(await proto.enter_dfu());
        // The acknowledgement confirms the command, not a bootloader connection
        // or a completed firmware update. The external page is a separate link.
        this.$message({ type: 'info', message: this.$t('dfumode.commandaccepted') });
      } catch (error) { this.show_transfer_error(error); }
    },

    on_btn_up() {
      if (this.btn_disabled()) return;
      var drive = this.current_dir.substring(0, 2); //E:
      var path = this.current_dir.substring(2);

      if (path == '/') { // root
        this.current_dir = "";
        return this.reload_drive();
      } else {
        var idx = path.lastIndexOf('/');
        if (idx == 0) {
          this.current_dir = drive + "/";
        } else {
          this.current_dir = drive + path.substring(0, idx);
        }

        return this.reload_folder();
      }
    },

    on_btn_refresh() {
      if (this.current_dir == '') {
        return this.reload_drive();
      } else {
        return this.reload_folder();
      }
    },

    async on_btn_new_folder() {
      if (this.btn_disabled()) return;
      const dir = this.current_dir, generation = this.sessionGeneration;
      try {
        const { value } = await this.$prompt(this.$t('newfolder.message'), this.$t('newfolder.title'), { ...this.confirm_options(), inputValue: '' });
        if (!value || !this.session_current(generation)) return;
        await this.mutate(async () => {
          this.checked(await proto.vfs_create_folder(this.append_segment(dir, value)));
          if (this.session_current(generation)) await this.on_btn_refresh();
        });
      } catch (error) { this.show_transfer_error(error); }
    },

    on_btn_upload() {
      if (this.btn_disabled()) return;
      this.upload_diag_visible = true;
    },

    async on_btn_remove() {
      if (this.btn_disabled() || !this.table_selection.length) return;
      const dir = this.current_dir, generation = this.sessionGeneration;
      const rows = this.table_selection.filter(row => row.type !== 'DRIVE').slice();
      if (!rows.length) return;
      try {
        await this.$confirm(this.$t('del.message') + rows.map(row => row.name).join(', ') + this.$t('del.messageend'), this.$t('del.title'), this.confirm_options());
        if (!this.session_current(generation)) return;
        await this.mutate(async () => {
          for (const row of rows) {
            if (!this.session_current(generation)) return;
            try {
              this.checked(await proto.vfs_remove(this.append_segment(dir, row.name)));
              if (this.session_current(generation) && dir === this.current_dir) this.delete_table_row_by_name(row.name);
            } catch (error) { if (this.session_current(generation)) this.show_transfer_error(new Error(row.name + ': ' + error.message)); }
          }
        });
      } catch (error) { this.show_transfer_error(error); }
    },


    async on_upload_diag_close(done) {
      try {
        if (this.pendingUploads > 0) {
          await this.$confirm(this.$t('upload.closemessage'), this.$t('upload.closetitle'), this.confirm_options());
          pixl.disconnect();
          await this.$nextTick();
        }
        this.$refs.upload?.clearFiles();
        done();
        if (this.connected) await this.on_btn_refresh();
      } catch (error) { this.show_transfer_error(error); }
    },

    on_upload_request(options) {
      if (!this.connected || !this.current_dir) return Promise.reject(new Error(this.$t('conn.disconnected')));
      const path = this.append_segment(this.current_dir, options.file.name);
      ++this.pendingUploads;
      // Element Plus observes this promise and invokes completion hooks itself.
      return new Promise((resolve, reject) => {
        let finished = false;
        const finish = error => {
          if (finished) return;
          finished = true; --this.pendingUploads;
          if (error) reject(error); else resolve({});
        };
        try {
          proto.vfs_helper_write_file(path, options.file,
            progress => options.onProgress({ percent: progress.total_bytes ? progress.written_bytes / progress.total_bytes * 100 : 100 }),
            () => finish(), error => finish(error));
        } catch (error) { finish(error); }
      });
    },

    on_upload_error(err, file, filelist) {
      this.$message({
        type: 'error',
        message: file.name + `${this.$t("upload.errupload")}` + err
      });
    },

    async on_row_btn_format(index, row) {
      const generation = this.sessionGeneration;
      try {
        await this.$confirm(this.$t('format.messrow1a') + row.name + this.$t('format.messrow1b') + '\n' + this.$t('format.messrow2') + '\n' + this.$t('format.messrow3'), this.$t('format.title'), this.confirm_options());
        if (!this.session_current(generation)) return;
        await this.mutate(async () => {
          this.checked(await proto.vfs_drive_format(row.name.slice(0, 1)));
          if (!this.session_current(generation)) return;
          this.$message({ type: 'success', message: row.name + this.$t('format.formatok') });
          await this.reload_drive();
        });
      } catch (error) { this.show_transfer_error(error); }
    },

    async on_row_btn_remove(index, row) {
      const path = this.append_segment(this.current_dir, row.name), generation = this.sessionGeneration;
      try {
        await this.$confirm(this.$t('del.message') + row.name + this.$t('del.messageend'), this.$t('del.title'), this.confirm_options());
        if (!this.session_current(generation)) return;
        await this.mutate(async () => {
          this.checked(await proto.vfs_remove(path));
          if (this.session_current(generation)) await this.on_btn_refresh();
        });
      } catch (error) { this.show_transfer_error(error); }
    },

    async on_row_btn_rename(index, row) {
      const dir = this.current_dir, path = this.append_segment(dir, row.name), generation = this.sessionGeneration;
      try {
        const { value } = await this.$prompt(this.$t('rename.message'), this.$t('rename.title'), { ...this.confirm_options(), inputValue: row.name });
        if (!value || value === row.name || !this.session_current(generation)) return;
        await this.mutate(async () => {
          this.checked(await proto.vfs_rename(path, this.append_segment(dir, value)));
          if (this.session_current(generation)) await this.on_btn_refresh();
        });
      } catch (error) { this.show_transfer_error(error); }
    },


    on_row_btn_meta(index, row) {
      if (row.metadataValid === false) {
        this.$message({ type: 'warning', message: this.$t('properties.invalidmeta') });
        return;
      }
      this.meta_form = { name: row.name, notes: row.notes || '', flags: { ...row.flags }, amiibo: { ...row.amiibo }, row,
        path: this.append_segment(this.current_dir, row.name) };
      this.meta_diag_visible = true;
    },

    on_diag_meta_close() {
      const form = this.meta_form, meta = { notes: form.notes, flags: { ...form.flags }, amiibo: { ...form.amiibo } };
      return this.mutate(async generation => {
        this.checked(await proto.vfs_update_meta(form.path, meta));
        if (!this.session_current(generation)) return;
        Object.assign(form.row, meta); this.meta_diag_visible = false;
      });
    },

    on_table_selection_change(selected) {
      this.table_selection = selected;
    },

    sort_table_row_name(a, b) {
      return a.name.localeCompare(b.name, this.language.replace('_', '-'), { numeric: true, sensitivity: 'base' });
    },

    handle_name_click(index, row) {
      if (!this.connected || this.table_loading || this.mutating || this.pendingUploads) return;
      if (row.type === 'DRIVE' || row.type === 'DIR') {
        if (this.pendingDownloads) return;
        this.current_dir = row.type === 'DRIVE' ? row.name.slice(0, 3) : this.append_segment(this.current_dir, row.name);
        return this.reload_folder();
      }
      const generation = this.sessionGeneration;
      ++this.pendingDownloads;
      return proto.vfs_helper_read_file(this.append_segment(this.current_dir, row.name), data => {
        if (!this.session_current(generation)) return;
        const url = window.URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
        const link = document.createElement('a'); link.href = url; link.download = row.name; link.style.display = 'none';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      }, error => { if (this.session_current(generation)) this.show_transfer_error(error); }, () => { --this.pendingDownloads; });
    },

    async reload_drive() {
      if (!this.connected) return;
      const listing = ++this.listingGeneration, generation = this.sessionGeneration;
      this.current_dir = ''; this.table_loading = true; this.tableData = []; this.table_selection = [];
      try {
        const data = this.checked(await proto.vfs_get_drive_list());
        if (!this.session_current(generation) || listing !== this.listingGeneration) return;
        this.tableData = data.map(drive => ({ name: drive.label + ':/ [' + drive.name + ']', type: 'DRIVE', notes: '', sizeBytes: drive.total_size,
          size: drive.status === 0 ? this.$t('drive.free', { free: this.format_size(drive.free_size), total: this.format_size(drive.total_size) }) : this.$t('drive.message') + drive.status + this.$t('drive.messageend') }));
      } catch (error) { if (this.session_current(generation) && listing === this.listingGeneration) this.show_transfer_error(error); }
      finally { if (listing === this.listingGeneration) this.table_loading = false; }
    },

    async reload_folder() {
      if (!this.connected) return;
      const dir = this.current_dir, listing = ++this.listingGeneration, generation = this.sessionGeneration;
      this.table_loading = true; this.tableData = []; this.table_selection = [];
      try {
        const data = this.checked(await proto.vfs_read_folder(dir));
        if (!this.session_current(generation) || listing !== this.listingGeneration || dir !== this.current_dir) return;
        this.tableData = data.map(file => ({ name: file.name, size: this.format_size(file.size), sizeBytes: file.size,
          type: file.type === 0 ? 'REG' : 'DIR', metadataValid: file.meta.valid !== false,
          notes: file.meta.valid === false ? this.$t('properties.invalidmeta') : file.meta.notes, flags: file.meta.flags, amiibo: file.meta.amiibo }));
      } catch (error) { if (this.session_current(generation) && listing === this.listingGeneration) this.show_transfer_error(error); }
      finally { if (listing === this.listingGeneration) this.table_loading = false; }
    },

    format_size(size) {
      if (typeof size == 'number') {
        if (size < 1024) {
          return size + " B"
        } else if (size < 1024 * 1024) {
          return (size / 1024).toFixed(2) + " KB";
        } else {
          return (size / 1024 / 1024).toFixed(2) + " MB";
        }
      } else {
        return size;
      }
    },

    btn_disabled() { return !this.connected || !this.current_dir || this.busy; },

    append_segment(dir, seg) {
      var drive = dir.substring(0, 2); //E:
      var path = dir.substring(2);
      if (path == '/') {
        return dir + seg;
      } else {
        return dir + '/' + seg;
      }
    },

    delete_table_row_by_name(name) {
      for (var i = 0; i < this.tableData.length; i++) {
        if (this.tableData[i].name == name) {
          this.tableData.splice(i, 1);
          return;
        }
      }
    },

    handle_set_language(lang) {
      if (!this.$i18n.availableLocales.includes(lang)) return;
      this.language = lang; this.$i18n.locale = lang;
      document.documentElement.lang = lang.replace('_', '-');
      save_language(this.storage(), lang);
      this.connBtnText = this.$t(this.connected ? 'conn.disconnect' : this.connecting ? 'conn.connecting' : 'conn.connect');
      this.version = this.firmwareVersion ? this.$t('status.connected') + this.firmwareVersion : '';
      this.$message({ message: this.$t('lang.changeok'), type: 'success' });
    }


  }, mounted() {
    var dispatcher = sharedEventDispatcher();
    dispatcher.addListener("ble_connected", this.on_ble_connected);
    dispatcher.addListener("ble_disconnected", this.on_ble_disconnected);
    dispatcher.addListener("ble_connect_error", this.on_ble_connect_error);

    proto.init();

    var lang = read_saved_language(this.storage(), this.$i18n.availableLocales, "de_DE")
    if (!lang || this.$i18n.availableLocales.indexOf(lang) < 0) {
      lang = this.$i18n.locale
    }

    this.language = lang
    this.$i18n.locale = lang
    document.documentElement.lang = lang.replace('_', '-');
    this.connBtnText = `${this.$t("conn.connect")}`;
  },
  beforeUnmount() {
    ++this.sessionGeneration; ++this.listingGeneration;
    this.connected = false; this.connecting = false;
    const dispatcher = sharedEventDispatcher();
    dispatcher.removeListener('ble_connected', this.on_ble_connected);
    dispatcher.removeListener('ble_disconnected', this.on_ble_disconnected);
    dispatcher.removeListener('ble_connect_error', this.on_ble_connect_error);
    pixl.disconnect();
  }
}
</script>

<style>
body { margin: 20px; background: #f5f7fa; color: #253047; }
.file-symbol { margin-right: 8px; color: #64758a; }
.file-name-action { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.file-name-action:hover { color: #2459a6; }
.file-name-action:focus-visible { outline: 2px solid #2459a6; outline-offset: 3px; }
.file-name-action:disabled { cursor: default; opacity: .5; }
.upload-symbol { display: block; font-size: 48px; color: #8292a6; }
.el-button-group { margin: 3px; }
.dfu-page-link { display: inline-block; margin: 6px; color: #2459a6; text-underline-offset: 3px; }
.filemanager h2 { font-size: 26px; }
.row-menu { background: transparent; border: 0; cursor: pointer; padding: 6px; color: inherit; }
.row-menu:disabled { cursor: default; opacity: .5; }
.filemanager {
  font-family: Helvetica, sans-serif;
  max-width: 1120px;
  padding: 24px;
  background: white;
  border-radius: 12px;
  margin: 0 auto;
}

.action-left {
  float: left;
}

.action-right {
  float: right;
}

.folder-path {
  margin: 20px auto;
}

.folder-action {
  float: right;
}

.file-cell {
  padding: 4px 0 !important;
}

.header {
  text-align: center;
  margin: 30px auto;
}
@media (max-width: 650px) { body { margin: 8px; } .filemanager { padding: 12px; } }
</style>
