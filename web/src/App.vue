<template>

  <el-config-provider :locale="elementLocale"><main class="filemanager">
    <a class="skip-link" href="#file-workspace" @click="show_workspace('files')">{{ $t('workflow.skipToFiles') }}</a>
    <header class="app-header">
      <div class="brand-lockup"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="20" rx="5"/><path d="M10 12h12M10 17h7M22 21h.01"/></svg></span>
        <div><p class="app-eyebrow">ALLMIIBO · LCD</p><h1>{{ $t('workflow.appTitle') }}</h1><p class="app-subtitle">{{ $t('tools.subtitle') }}</p></div>
      </div>
      <div class="header-tools">    <div class="header-language">
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
<el-button :type="connBtnType || 'primary'" size="small" @click="on_btn_ble_connect" :disabled="remoteActive || disconnecting || connectionDisconnectLocked || (!!browserIssue && !connected && !connecting)">{{
              connBtnText
            }}</el-button></div>
    </header>
    <div class="version-context"><span>{{ $t('info.browserVersion') }} <strong>3.43.0-rc.1</strong></span><span>{{ $t('info.deviceFirmware') }} <strong>{{ firmwareVersion || $t('info.disconnected') }}</strong></span></div>
    <section class="quick-status" :aria-label="$t('workflow.quickStatus')">
      <div class="quick-status-main"><span class="connection-pill" :class="{online:connected}">{{ $t(connectionSummaryKey) }}</span>
      <span v-if="connected" class="quick-location">{{ current_dir || $t('workflow.chooseDrive') }}</span>
      <span v-else class="quick-location">{{ $t(demoMode ? 'workflow.previewShort' : 'workflow.connectHint') }}</span></div>
      <span v-if="quickFreeSpace" class="quick-storage">{{ statusDriveInfo.label }}: {{ $t('workflow.freeSpace',{bytes:quickFreeSpace}) }}</span>
      <div class="status-links">
        <a class="guide-link" :href="guideUrl" target="_blank" rel="noopener noreferrer">{{ $t('workflow.flashGuide') }}</a>
        <button type="button" @click="show_device_panel">{{ $t('workflow.deviceDetails') }}</button>
      </div>
    </section>
    <p v-if="browserIssue" class="notice error" role="alert">{{ $t(browserIssue) }}</p>
    <nav v-if="activeWorkspace === 'files'" class="start-actions" :aria-label="$t('workflow.startActions')">
      <button type="button" class="start-figure" aria-controls="catalogue-workspace" @click="show_figure_import">
        <img class="action-art" src="./assets/figure-import-pixel.png" alt="" width="72" height="54">
        <span class="action-copy"><strong>{{ $t('workflow.startFigure') }}</strong><span>{{ $t('workflow.startFigureHint') }}</span></span>
      </button>
      <button type="button" class="start-firmware" aria-controls="update-workspace" @click="show_workspace('update')">
        <img class="action-art" src="./assets/lcd-update-pixel.png" alt="" width="72" height="54">
        <span class="action-copy"><strong>{{ $t('workflow.startFirmware') }}</strong><span>{{ $t('workflow.startFirmwareHint') }}</span></span>
      </button>
    </nav>
    <div class="app-layout">
    <nav class="workspace-nav" :aria-label="$t('workflow.workspaces')">
      <button type="button" @click="show_workspace('files')" :aria-current="activeWorkspace === 'files' ? 'page' : undefined" aria-controls="file-workspace"><span class="workspace-icon" aria-hidden="true">▤</span><span><strong>{{ $t('workflow.filesTitle') }}</strong><small>{{ $t('workflow.filesBrief') }}</small></span><span class="workspace-arrow" aria-hidden="true">↗</span></button>
      <button type="button" @click="show_workspace('backup')" :aria-current="activeWorkspace === 'backup' ? 'page' : undefined" aria-controls="backup-workspace"><span class="workspace-icon" aria-hidden="true">↓</span><span><strong>{{ $t('workflow.backupShort') }}</strong><small>{{ $t('workflow.backupBrief') }}</small></span><span class="workspace-arrow" aria-hidden="true">↗</span></button>
      <button type="button" @click="show_workspace('update')" :aria-current="activeWorkspace === 'update' ? 'page' : undefined" aria-controls="update-workspace"><span class="workspace-icon" aria-hidden="true">↻</span><span><strong>{{ $t('workflow.updateShort') }}</strong><small>{{ $t('workflow.updateBrief') }}</small></span><span class="workspace-arrow" aria-hidden="true">↗</span></button>
      <button type="button" @click="show_workspace('remote')" :aria-current="activeWorkspace === 'remote' ? 'page' : undefined" aria-controls="remote-workspace"><span class="workspace-icon" aria-hidden="true">↔</span><span><strong>{{ language === 'de_DE' ? 'Fernbedienung' : 'Remote control' }}</strong><small>{{ language === 'de_DE' ? 'Menü am Gerät bedienen' : 'Operate the device menu' }}</small></span><span class="workspace-arrow" aria-hidden="true">↗</span></button>
      <button type="button" @click="show_workspace('device')" :aria-current="activeWorkspace === 'device' ? 'page' : undefined" aria-controls="device-overview"><span class="workspace-icon" aria-hidden="true">◉</span><span><strong>{{ language === 'de_DE' ? 'Gerät & Diagnose' : 'Device & diagnostics' }}</strong><small>{{ language === 'de_DE' ? 'RAM, Speicher und Bluetooth' : 'RAM, storage and Bluetooth' }}</small></span></button>
      <button type="button" @click="show_workspace('catalogue')" :aria-current="activeWorkspace === 'catalogue' ? 'page' : undefined" aria-controls="catalogue-workspace"><span class="workspace-icon" aria-hidden="true">◇</span><span><strong>{{ language === 'de_DE' ? 'Figurenkatalog' : 'Figure catalogue' }}</strong><small>{{ language === 'de_DE' ? 'Neuheiten, Sammlungsprüfung und Downloads' : 'New figures, collection checks and downloads' }}</small></span></button>
      <DeviceStorageCard :connected="connected" :drive="statusDriveInfo" :directory="current_dir" :entries="folderEntryCount" :locale="language" :upload-disabled="btn_disabled()" @upload="on_btn_upload" />
    </nav>
    <div class="workspace-body">
    <ScreenAwake :active="screenAwakeActive" :locale="language" />
    <p v-if="collectionBusy" class="background-work" role="status">{{ language === 'de_DE' ? 'Sammlungsprüfung oder Figurenübertragung läuft …' : 'Collection check or figure transfer running …' }} <button type="button" @click="show_workspace('catalogue')">{{ language === 'de_DE' ? 'Vorgang anzeigen' : 'Show operation' }}</button></p>
    <p v-if="searchBusy" class="background-work" role="status">{{ language === 'de_DE' ? 'Gerätesuche läuft…' : 'Device search running…' }} <button type="button" @click="show_workspace('files')">{{ language === 'de_DE' ? 'Suche anzeigen' : 'Show search' }}</button></p>
    <details v-show="activeWorkspace === 'remote'" id="remote-workspace" ref="remoteWorkspace" class="remote-workspace"><summary>{{ language === 'de_DE' ? 'Fernbedienung · Menü und Dateien' : 'Remote control · menu and files' }}</summary><RemoteControl :locale="language" :blocked="connected || connecting || disconnecting || busy" :handoff-file-connection="on_remote_file_handoff" @active="remoteActive = $event" /></details>
    <section v-if="transfer && !upload_diag_visible && !zipDialog && !syncDialog" class="transfer-panel">
      <span class="visually-hidden" role="status" aria-live="polite">{{ $t('tools.' + transfer.phase) }}</span>
      <strong>{{ $t('tools.' + transfer.phase) }}</strong>
      <span class="transfer-path">{{ transfer.path }}</span>
      <progress v-if="backupReadTime && transfer.phase === 'verifying'" :value="transfer.timing.completed" :max="transfer.timing.total" :aria-label="$t('tools.verifying')"></progress>
      <progress v-else :value="Number.isSafeInteger(transfer.total) ? transferPercent : undefined" max="100" :aria-label="$t('tools.transfer')"></progress>
      <template v-if="!backingUp || transfer.phase === 'reading'">
        <span v-if="Number.isSafeInteger(transfer.total)">{{ transferPercent }}%</span>
        <span>{{ format_size(transfer.done) }}<template v-if="Number.isSafeInteger(transfer.total)"> / {{ format_size(transfer.total) }}</template></span>
        <span v-if="Number.isSafeInteger(transfer.filesTotal)">{{ $t('workflow.backupFiles',{done:transfer.filesDone,total:transfer.filesTotal}) }}</span>
      </template>
      <span v-if="backupReadTime && transfer.phase === 'listing'">{{ $t('workflow.backupListing',{folders:transfer.foldersListed,files:transfer.filesTotal}) }}</span>
      <span v-if="backupReadTime && transfer.phase === 'verifying'">{{ $t('workflow.backupVerifying',{done:transfer.timing.completed,total:transfer.timing.total}) }}</span>
      <span v-if="transferStats?.bytesPerSecond != null">{{ format_size(Math.round(transferStats.bytesPerSecond)) }}/s</span>
      <template v-if="backupReadTime">
        <span>{{ $t('workflow.backupElapsed',{time:formatReadDuration(backupReadTime.jobSeconds)}) }}</span>
        <strong v-if="!cancellingBackup && backupReadTime.remainingSeconds != null">{{ $t('workflow.backupRemaining',{time:formatReadDuration(backupReadTime.remainingSeconds)}) }}</strong>
        <small v-else-if="!cancellingBackup && backupReadTime.waiting && transfer.phase !== 'archiving'">{{ $t('workflow.backupWaiting') }}</small>
        <small v-else-if="!cancellingBackup && transfer.phase === 'reading'">{{ $t('workflow.backupEstimating') }}</small>
      </template>
      <template v-else-if="!backingUp">
        <span v-if="transferStats?.etaSeconds != null">{{ $t('info.remaining', { seconds: Math.ceil(transferStats.etaSeconds) }) }}</span>
        <span v-if="transferStats?.stalled">{{ $t('info.waiting') }}</span>
        <small class="transfer-estimate-hint">{{ $t('info.estimateHint') }}</small>
      </template>
      <button v-if="zipBusy || syncing || backingUp || pendingUploads || pendingDownloads" type="button" @click="cancel_transfer" :disabled="transferCancelling">{{ $t('tools.cancel') }}</button>
      <span v-if="cancellingBackup">{{ $t('tools.cancelling') }}</span>
      <span v-if="cancellingUploads">{{ $t('info.finishingCommit') }}</span>
    </section>
    <section v-if="backupCanResume" class="backup-resume">
      <strong>{{ $t('workflow.resumeTitle') }}</strong>
      <p>{{ backupResumeInfo.rootPath }} · {{ $t('workflow.cached', {count:backupResumeInfo.files,bytes:format_size(backupResumeInfo.bytes)}) }}</p>
      <p>{{ $t('workflow.resumeHint') }}</p>
      <details><summary>{{ $t('workflow.resumeLimitsTitle') }}</summary><p>{{ $t('workflow.resumeLimits') }}</p></details>
      <button type="button" @click="on_backup(true)" :disabled="!backupResumeMatches || busy || disconnecting || upload_diag_visible">{{ $t('workflow.resume') }}</button>
      <button type="button" @click="discard_backup_checkpoint" :disabled="busy || backupResumeInfo.busy">{{ $t('workflow.discard') }}</button>
    </section>
    <section v-if="lastBackup" class="backup-ready" role="status">
      <span class="backup-archive">
        <strong>{{ $t(backupReadSummary ? 'tools.readyArchive' : 'tools.previousArchive') }}</strong> {{ lastBackup.filename }}
        <small v-if="backupReadSummary">
          {{ $t('tools.backupFresh', { count: backupReadSummary.freshFiles, bytes: format_size(backupReadSummary.freshBytes) }, backupReadSummary.freshFiles) }}
          · {{ $t('tools.backupReused', { count: backupReadSummary.reusedFiles, bytes: format_size(backupReadSummary.reusedBytes) }, backupReadSummary.reusedFiles) }}
        </small>
      </span>
      <button type="button" @click="lastBackup = null">{{ $t('info.discard') }}</button>
      <button type="button" @click="save_last_backup">{{ $t('tools.saveBackup') }}</button>
    </section>
    <section v-if="lastDownload" class="backup-ready" role="status">
      <span>{{ $t('info.downloadReady') }} {{ lastDownload.filename }}</span>
      <button type="button" @click="save_last_download">{{ $t('info.saveFile') }}</button>
      <button type="button" @click="lastDownload = null">{{ $t('info.discard') }}</button>
    </section>
    <p v-if="lastTransfer" class="backup-hint" role="status">{{ $t('info.lastTransfer') }}: {{ $t('info.kind_' + lastTransfer.kind) }} · {{ $t('info.result_' + lastTransfer.status) }} · {{ format_size(lastTransfer.bytes) }}<span v-if="lastTransfer.verified"> · SHA-256 ✓</span></p>
    <section v-if="recoveryNotes.length" class="notice error" role="alert">
      <strong>{{ $t('info.recoveryTitle') }}</strong><p>{{ $t('info.recoveryHint') }}</p>
      <pre v-for="(note, index) in recoveryNotes" :key="index" class="recovery-note">{{ note }}</pre>
      <button type="button" @click="recoveryNotes = []">{{ $t('info.discard') }}</button>
    </section>
    <p v-if="enteringDfu" class="notice" role="status">{{ $t('info.enteringDfu') }}</p>
    <section v-show="activeWorkspace === 'files'" class="files-workspace" id="file-workspace" ref="fileWorkspace" tabindex="-1" :aria-label="$t('workflow.filesTitle')">
      <div class="collection-layout"><div class="collection-main">
      <div class="section-heading"><div><p class="section-eyebrow">{{ $t('workflow.collection') }}</p><h2>{{ $t('workflow.filesTitle') }}</h2></div><div v-show="connected || demoMode" class="file-navigation"><el-button size="small" @click="on_btn_up" :disabled="btn_disabled()">{{ $t('menu.up')  }}</el-button><el-button size="small" @click="on_btn_refresh" :disabled="!connected || busy">{{ $t('menu.refresh') }}</el-button></div></div>
      <div v-if="!connected && !connecting && !demoMode" class="connection-guide"><span class="connection-guide-symbol" aria-hidden="true">↔</span><div><h3>{{ $t('workflow.readyToConnect') }}</h3><p>{{ $t('workflow.connectGuide') }}</p></div></div>
      <div v-if="!connected && !connecting" class="preview-controls"><button type="button" @click="toggle_preview">{{ $t(demoMode ? 'tools.previewClose' : 'tools.previewOpen') }}</button><p v-if="demoMode" role="status">{{ $t('tools.previewNotice') }}</p></div>
      <div v-show="connected || demoMode" class="file-toolbar"><el-button-group><el-button size="small" type="primary" @click="on_btn_upload"
              :disabled="btn_disabled()">{{ $t('menu.upload')  }}</el-button><el-button size="small" @click="on_btn_new_folder"
              :disabled="btn_disabled()">{{ $t('menu.newfolder')  }}</el-button></el-button-group><el-button-group><el-button size="small" type="danger" @click="on_btn_remove"
              :disabled="btn_disabled() || !table_selection.length">{{ $t('menu.del')  }}</el-button></el-button-group><span v-if="table_selection.length" class="selection-counter">{{ $t('workflow.selectedCount',{count:table_selection.length}) }}</span></div>
    <el-row>
      <el-col :span="24">
        <div class="folder-path">
          <nav class="folder-breadcrumbs" :aria-label="$t('workflow.folderPath')"><ol>
            <li v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
              <span v-if="index" class="path-separator" aria-hidden="true">/</span>
              <span v-if="crumb.path === current_dir" aria-current="page">{{ crumb.name || $t('workflow.drives') }}</span>
              <button v-else type="button" :disabled="!connected || busy" @click="navigate_breadcrumb(crumb.path)">{{ crumb.name || $t('workflow.drives') }}</button>
            </li>
          </ol></nav>
        </div>
      </el-col>
    </el-row>
    <DeviceSearch :connected="connected" :blocked="(busy && !searchBusy) || upload_diag_visible || syncDialog || zipDialog || meta_diag_visible" :generation="sessionGeneration" :directory="current_dir" :locale="language" :catalogue="collectionCatalogue" :get-session="device_search_session" @busy="searchBusy = $event" @navigate="navigate_search_result" @download="download_search_result" />
    <div class="file-filters">
      <label class="search-label">{{ $t('tools.search') }}<input type="search" v-model="searchQuery" @input="on_filter_change" :placeholder="$t('tools.search')"></label>
      <label>{{ $t('tools.filter') }} <select v-model="typeFilter" @change="on_filter_change">
        <option value="all">{{ $t('tools.all') }}</option><option value="REG">{{ $t('tools.files') }}</option><option value="DIR">{{ $t('tools.folders') }}</option>
      </select></label>
      <span class="entry-count">{{ $t('tools.counts', { visible: filteredRows.length, total: tableData.length }) }}</span>
      <button v-if="searchQuery || typeFilter !== 'all'" type="button" @click="reset_filters">{{ $t('workflow.resetFilters') }}</button>
    </div>
    <p v-if="listingError && connected && !table_loading" class="notice error" role="alert">{{ $t('workflow.listingFailed') }}</p>
    <p v-if="(connected || demoMode) && !table_loading && !listingError && !filteredRows.length" class="backup-hint" role="status">{{ $t(tableData.length ? 'workflow.noMatches' : current_dir ? 'workflow.emptyFolder' : 'workflow.noDrives') }}</p>
    <p v-if="connected && current_dir" class="backup-hint">{{ $t('tools.backupHint') }}</p>
    <div>
      <el-table ref="multipleTable" :data="pagedRows" tooltip-effect="dark" style="width: 100%" v-loading="table_loading"
        :element-loading-text="$t('status.loading')"  cell-class-name="file-cell"
        @selection-change="on_table_selection_change"
        @sort-change="on_sort_change"
        :default-sort="{ prop: 'name', order: 'ascending' }">
        <el-table-column type="selection" width="42" :selectable="row => connected && row.type !== 'DRIVE' && !busy">
        </el-table-column>
        <el-table-column prop="name" :label="$t('labels.name')" sortable="custom" min-width="240">
          <template #default="scope">
            <span class="file-symbol" aria-hidden="true">{{ scope.row.type === "REG" ? "▤" : scope.row.type === "DIR" ? "▣" : "◫" }}</span>
            <button type="button" class="file-name-action" :data-file-name="scope.row.name" :disabled="(!connected && !(demoMode && scope.row.demoFigure)) || (busy && !previewBusy)" @click="select_file_row(scope.$index, scope.row)" @dblclick="download_preview_selection">
              {{ scope.row.name }}</button>
          </template>
        </el-table-column>
        <el-table-column prop="size" :label="$t('labels.size')" sortable="custom" width="150">
        </el-table-column>
        <el-table-column prop="type" :label="$t('labels.type')" sortable="custom" width="80">
        </el-table-column>
        <el-table-column prop="notes" :label="$t('labels.remark')" sortable="custom">
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
      <div class="table-footer" v-if="tableData.length">
        <label class="page-size">{{ $t('workflow.pageSize') }} <select :value="pageSize" @change="set_page_size($event.target.value)" :disabled="busy"><option v-for="size in [25,50,100]" :key="size" :value="size">{{ size }}</option></select></label>
      <nav class="pagination" :aria-label="$t('tools.pages')" v-if="pageCount > 1">
        <button type="button" @click="change_page(page - 1)" :disabled="page <= 1 || busy">{{ $t('tools.previous') }}</button>
        <span>{{ $t('tools.page', { page, total: pageCount }) }}</span>
        <button type="button" @click="change_page(page + 1)" :disabled="page >= pageCount || busy">{{ $t('tools.next') }}</button>
      </nav>
      </div>
    </div>

      </div><aside class="selection-context" :class="{'has-selection': !!previewSelection}"><button v-if="previewSelection" type="button" class="mobile-preview-close" @click="close_preview_selection">{{ language === 'de_DE' ? 'Vorschau schließen' : 'Close preview' }} ×</button><SelectionPreview :selection="previewSelection" :locale="language" :catalogue="collectionCatalogue" :blocked="busy || !preview_selection_current()" @download="download_preview_selection" @properties="open_preview_properties" /></aside></div>
    </section>
    <details v-show="activeWorkspace === 'backup'" class="workspace-panel" ref="backupWorkspace" id="backup-workspace" @toggle="keep_migration_visible">
      <summary>{{ $t('workflow.backupTitle') }}<span>{{ $t('workflow.backupBrief') }}</span></summary>
      <div class="workspace-content"><p class="workspace-description">{{ $t('workflow.backupScope') }}</p>
      <a class="guide-link" :href="guideUrl + '#littlefs'" target="_blank" rel="noopener noreferrer">{{ $t('workflow.migrationGuide') }}</a>
      <p class="workspace-location">{{ $t('workflow.sourceFolder') }} <strong>{{ current_dir || $t('workflow.chooseDrive') }}</strong></p>
      <p v-if="table_loading" class="backup-hint" role="status">{{ $t('workflow.backupDriveOpening') }}</p>
      <p v-else-if="(listingError || backupDriveOpenError) && connected" class="notice error" role="alert">{{ $t('workflow.backupDriveFailed') }}</p>
      <div v-if="connected && !current_dir" class="workspace-actions backup-drive-picker">
        <el-button v-for="drive in availableBackupDrives" :key="drive.label" type="primary"
          :disabled="busy || disconnecting || upload_diag_visible" @click="open_backup_drive(drive.label)">
          {{ $t('workflow.openDrive', { drive: drive.label }) }}
        </el-button>
        <el-button v-if="!availableBackupDrives.length" :disabled="busy || disconnecting || upload_diag_visible"
          @click="on_btn_refresh">{{ $t('workflow.refreshDrives') }}</el-button>
      </div>
      <div class="workspace-actions"><el-button size="small" type="primary" @click="on_backup" :disabled="btn_disabled() || upload_diag_visible || (storeBackup && (storedBusy || !!storedHead || !!storedError))">{{ $t('tools.backup') }}</el-button><el-button size="small" @click="open_zip" :disabled="btn_disabled() || upload_diag_visible">{{ $t('workflow.zipTitle') }}</el-button><el-button size="small" @click="open_sync" :disabled="btn_disabled() || upload_diag_visible">{{ $t('info.syncOpen') }}</el-button></div>
      <label><input type="checkbox" :checked="storeBackup" :disabled="busy || storedBusy" @change="toggle_stored_backup($event.target.checked)"> {{ $t('workflow.storeOption') }}</label>
      <div v-if="storeBackup" class="backup-resume">
        <p>{{ $t('workflow.storeInfo') }}</p>
        <p v-if="persistStatus">{{ $t('workflow.' + persistStatus) }}</p>
        <p v-if="storedError" role="alert">{{ $t('workflow.' + storedError) }}</p>
        <template v-if="storedHead">
          <strong>{{ $t(storedHead.invalid ? 'workflow.storeInvalid' : storedHead.status === 'exported' ? 'workflow.storeExported' : 'workflow.storeIncomplete') }}</strong>
          <p v-if="!storedHead.invalid">{{ storedHead.context.rootPath }} · {{ storedHead.context.firmwareVersion }} · {{ $t('workflow.storeProgress',{count:storedHead.files,bytes:format_size(storedHead.bytes)}) }}</p>
          <p v-if="!storedHead.invalid && !storedBackupMatches">{{ $t('workflow.storeReconnect') }}</p>
          <button type="button" @click="on_backup('stored')" :disabled="!storedBackupMatches || busy || storedBusy || disconnecting || upload_diag_visible">{{ $t('workflow.resume') }}</button>
          <button type="button" @click="discard_stored_backup" :disabled="busy || storedBusy">{{ $t('workflow.discard') }}</button>
        </template>
        <button type="button" @click="refresh_stored_backup()" :disabled="busy || storedBusy">{{ $t('workflow.storeRefresh') }}</button>
      </div>
    <MigrationAssistant :connected="connected" :blocked="busy && !migrationBusy" :generation="sessionGeneration" :language="language" :get-session="migration_session" :confirm-restore="confirm_migration_restore" :confirm-format="confirm_migration_format" :confirm-initialize="confirm_migration_initialize" :confirm-restart="confirm_migration_restart" @busy="on_migration_busy" @restored="refresh_current" />
      </div>
    </details>
    <details v-show="activeWorkspace === 'update'" class="workspace-panel" ref="updateWorkspace" id="update-workspace">
      <summary>{{ $t('workflow.updateTitle') }}<span>{{ $t('workflow.updateBrief') }}</span></summary>
      <div class="workspace-content"><p class="workspace-description">{{ $t('workflow.updateScope') }}</p>
      <a class="guide-link" :href="guideUrl" target="_blank" rel="noopener noreferrer">{{ $t('workflow.flashGuide') }}</a>
      <div class="update-steps"><div><span aria-hidden="true">1</span><p>{{ $t('workflow.updateStepDevice') }}</p><el-button type="info" size="small" @click="on_btn_enter_dfu"
              :disabled="!connected || busy">{{ $t('menu.enterdfu') }}</el-button></div>
      <div><span aria-hidden="true">2</span><p>{{ $t('workflow.updateStepPage') }}</p><a class="dfu-page-link" :href="dfuPageUrl" target="_blank" rel="noopener noreferrer">{{ $t('menu.dfupage') }} <span aria-hidden="true">↗</span></a></div></div>
      <UpdateCheck :session="{ connected, firmwareVersion, bootState, dfuReference: lastDfuReference }" :boot="bootInfo" :locale="language" />
      <div class="info-actions"><button type="button" @click="refresh_boot_info" :disabled="!connected || busy || upload_diag_visible">{{ $t('workflow.updateRead') }}</button><button type="button" @click="show_device_panel">{{ $t('workflow.deviceDetails') }}</button></div>
      </div>
    </details>
    <details v-show="activeWorkspace === 'device'" class="device-panel" ref="devicePanel" id="device-overview">
      <summary>{{ $t('info.title') }}</summary>
      <p>{{ $t('info.localBluetooth') }}</p>
      <DiagnosticOverview :connected="connected" :blocked="busy && !fullDiagnosticBusy || upload_diag_visible || diagnosticsBusy" :loading="fullDiagnosticBusy" :snapshot="fullDiagnosticSnapshot" :progress="fullDiagnosticProgress" :read-clock="readClock" :interrupted="fullDiagnosticInterrupted" :locale="language" @read="read_all_diagnostics" @export="save_diagnostics" />
      <DisplayPhoto :connected="connected" :firmware-version="firmwareVersion" :generation="sessionGeneration" :blocked="busy || upload_diag_visible || diagnosticsBusy" :locale="language" :read-photo="read_display_photo" @busy="displayPhotoBusy = $event" />
      <CardSlotInspection v-if="activeWorkspace === 'device'" :locale="language" :blocked="busy || upload_diag_visible" />
      <StartupDiagnostics :firmware-version="firmwareVersion" :connected="connected" :blocked="busy && !startupBusy || upload_diag_visible" :generation="sessionGeneration" :locale="language" :read-diagnostics="read_startup_diagnostics" @busy="startupBusy = $event" @export="open_startup_report" />
      <dl class="device-info-grid">
        <div><dt>{{ $t('info.application') }}</dt><dd>3.43.0-rc.1</dd></div>
        <div><dt>{{ $t('info.firmware') }}</dt><dd>{{ firmwareVersion || $t('info.unknown') }}</dd></div>
        <div><dt>{{ $t('info.connection') }}</dt><dd>{{ $t(disconnecting ? 'info.disconnecting' : connected ? 'info.connected' : 'info.disconnected') }}</dd></div>
        <div><dt>{{ $t('info.mode') }}</dt><dd>{{ $t('info.' + (transportInfo?.chunkMode || 'not-negotiated')) }}</dd></div>
        <div><dt>{{ $t('info.reportedCapacity') }}</dt><dd>{{ transportInfo?.reportedGattValueCapacity ?? $t('info.unknown') }}</dd></div>
        <div><dt>{{ $t('info.effectiveCapacity') }}</dt><dd>{{ transportInfo?.effectiveGattValueCapacity ?? $t('info.unknown') }}</dd></div>
        <div><dt>{{ $t('info.sent') }}</dt><dd>{{ format_size(transportInfo?.txBytes || 0) }}</dd></div>
        <div><dt>{{ $t('info.received') }}</dt><dd>{{ format_size(transportInfo?.rxBytes || 0) }}</dd></div>
      </dl>
      <p class="backup-hint">{{ $t('info.capacityHint') }}</p>
      <div class="drive-info" v-for="drive in driveInfo" :key="drive.label">
        <strong>{{ drive.label }}:</strong>
        <span v-if="drive.status === 0">{{ $t('drive.free', { free: format_size(drive.freeBytes), total: format_size(drive.totalBytes) }) }}</span>
        <span v-else>{{ $t('info.unavailable') }}</span>
        <progress v-if="drive.status === 0 && drive.totalBytes" :value="drive.totalBytes - drive.freeBytes" :max="drive.totalBytes" :aria-label="$t('info.used')"></progress>
      </div>
      <p v-if="driveInfo.length" class="backup-hint">{{ $t('info.snapshot') }}</p>
      <div class="info-actions">
        <button type="button" @click="refresh_device_info" :disabled="!connected || busy || upload_diag_visible">{{ $t('info.refresh') }}</button>
        <button type="button" @click="refresh_runtime_info" :disabled="!connected || busy || upload_diag_visible">{{ $t('info.runtimeRead') }}</button>
        <button type="button" @click="refresh_boot_info" :disabled="!connected || busy || upload_diag_visible">{{ $t('info.bootRead') }}</button>
        <button type="button" @click="refresh_power_info" :disabled="!connected || busy || upload_diag_visible">{{ $t('workflow.powerRead') }}</button>
        <button type="button" @click="save_diagnostics" :disabled="diagnosticsBusy || fullDiagnosticBusy">{{ $t('info.export') }}</button>
      </div>
      <div class="runtime-status" role="status" aria-live="polite" aria-atomic="true">
        <p v-if="runtimeState === 'loading'">{{ $t('info.runtimeLoading') }}</p>
        <p v-else-if="runtimeState === 'failed'" class="notice error">{{ $t('info.runtimeFailed') }}</p>
        <p v-else-if="runtimeState === 'unavailable'">{{ $t('info.runtimeUnavailable') }}</p>
      </div>
      <section v-if="runtimeInfo" class="runtime-info">
        <p>{{ $t('info.runtimeScope') }}</p>
        <p class="sample-note">{{ $t('info.' + memory_sample_key(runtimeInfo.memorySamples), { count: runtimeInfo.memorySamples }) }}</p>
        <dl class="device-info-grid">
          <div><dt>{{ $t('info.heapFree') }}</dt><dd>{{ format_optional_size(runtimeInfo.heapFreeBytes) }} / {{ format_optional_size(runtimeInfo.heapPoolBytes) }}</dd></div>
          <div><dt>{{ $t('info.heapLargest') }}</dt><dd>{{ format_optional_size(runtimeInfo.largestFreeBlockBytes) }}</dd></div>
          <div><dt>{{ $t('info.heapMinimum') }}</dt><dd>{{ format_optional_size(runtimeInfo.sampledMinFreeBytes) }}</dd></div>
          <div><dt>{{ $t('info.stackMark') }}</dt><dd>{{ format_optional_size(runtimeInfo.stackMinFreeBytes) }} / {{ format_optional_size(runtimeInfo.stackReservedBytes) }}</dd></div>
          <div><dt>{{ $t('info.heapSamples') }}</dt><dd>{{ runtimeInfo.memorySamples ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.runtimeDisconnects') }}</dt><dd>{{ runtimeInfo.disconnects ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.runtimeTimeouts') }}</dt><dd>{{ runtimeInfo.timeouts ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.runtimeQueue') }}</dt><dd>{{ runtimeInfo.queueOverflows ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.runtimeAllocations') }}</dt><dd>{{ runtimeInfo.allocationFailures ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.runtimeVfs') }}</dt><dd>{{ runtimeInfo.vfsErrors ?? $t('info.unknown') }} · {{ runtimeInfo.lastVfsError ?? '—' }}</dd></div>
          <div><dt>{{ $t('info.runtimeBleCause') }}</dt><dd>{{ runtimeInfo.lastLocalBleCause ?? '—' }} / {{ runtimeInfo.lastHciReason ?? '—' }}</dd></div>
        </dl><p class="backup-hint">{{ $t('info.runtimeVfsHint') }} {{ runtime_vfs_detail(runtimeInfo.lastVfsError) }}</p>
        <p class="backup-hint">{{ $t('info.runtimeLimits') }} {{ $t(runtimeInfo.stackMinFreeBytes == null ? 'info.stackMissing' : 'info.stackHint') }}</p>
      </section>
      <p v-if="bootState === 'loading'" role="status">{{ $t('info.bootLoading') }}</p>
      <p v-if="bootState === 'unavailable'" role="status">{{ $t('info.bootUnavailable') }}</p>
      <p v-if="bootState === 'failed'" role="status">{{ $t('info.bootFailed') }}</p>
      <section v-if="bootInfo" class="runtime-info">
        <h3>{{ $t('info.bootTitle') }}</h3><p>{{ $t('info.bootScope') }}</p>
        <p v-if="!bootInfo.geometryValid || !bootInfo.bootAddressValid || !bootInfo.bootVectorsValid || !bootInfo.paramsLayoutKnown" class="notice error">{{ $t('info.bootIncomplete') }}</p>
        <p v-if="bootInfo.addressConflict" class="notice error">{{ $t('info.bootConflict') }}</p>
        <dl class="device-info-grid">
          <div><dt>{{ $t('info.bootChip') }}</dt><dd>{{ format_hex(bootInfo.chipPart) }} / {{ format_hex(bootInfo.chipVariantRaw) }}</dd></div>
          <div><dt>{{ $t('info.bootMemory') }}</dt><dd>{{ format_optional_size(bootInfo.flashBytes) }} / {{ format_optional_size(bootInfo.ramBytes) }}</dd></div>
          <div><dt>{{ $t('info.bootSoftDevice') }}</dt><dd>{{ bootInfo.softDeviceVariant ?? $t('info.unknown') }} / {{ bootInfo.softDeviceVersion ?? $t('info.unknown') }} / {{ format_hex(bootInfo.softDeviceFwid) }}</dd></div>
          <div><dt>{{ $t('info.bootAddress') }}</dt><dd>{{ format_hex(bootInfo.bootAddress) }} · {{ $t('info.bootSource_' + bootInfo.bootAddressSource) }}</dd></div>
          <div><dt>{{ $t('info.bootSettings') }}</dt><dd>{{ bootInfo.settingsVersion ?? $t('info.unknown') }} · {{ $t(bootInfo.settingsCrcValid ? 'info.bootCrcValid' : 'info.bootCrcUnvalidated') }}</dd></div>
          <div><dt>{{ $t('info.bootCounter') }}</dt><dd>{{ bootInfo.bootloaderCounter ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.bootAppCounter') }}</dt><dd>{{ bootInfo.applicationCounter ?? $t('info.unknown') }}</dd></div>
          <div><dt>{{ $t('info.bootHash') }}</dt><dd>{{ bootInfo.bootRegionSha256 ?? $t('info.unknown') }}<br>{{ format_optional_size(bootInfo.bootRegionBytes) }}</dd></div>
        </dl><p class="backup-hint">{{ $t('info.bootLimits') }}</p>
      </section>
      <section v-if="powerState !== 'unknown'" class="power-diagnostics">
        <h3>{{ $t('workflow.powerTitle') }}</h3>
        <p v-if="powerState === 'loading'" role="status">{{ $t('workflow.powerLoading') }}</p>
        <p v-else-if="powerState === 'unavailable'" role="status">{{ $t('workflow.powerUnavailable') }}</p>
        <p v-else-if="powerState === 'failed'" class="notice error" role="status">{{ $t('workflow.powerFailed') }}</p>
        <dl v-if="powerInfo" class="device-grid">
          <div><dt>{{ $t('workflow.powerReset') }}</dt><dd>{{ format_hex(powerInfo.resetReasonRaw) }}</dd></div>
          <div><dt>{{ $t('workflow.powerVoltage') }}</dt><dd>{{ powerInfo.batteryMillivolts === null ? $t('info.unknown') : powerInfo.batteryMillivolts + ' mV' }}</dd></div>
          <div><dt>{{ $t('workflow.powerMode') }}</dt><dd>{{ $t(!powerInfo.sampleCollected ? 'info.unknown' : powerInfo.lipoMode ? 'workflow.powerLipo' : 'workflow.powerOther') }}</dd></div>
          <div><dt>{{ $t('workflow.powerCharging') }}</dt><dd>{{ $t(!powerInfo.voltageValid ? 'info.unknown' : powerInfo.chargingActive ? 'workflow.powerActive' : 'workflow.powerInactive') }}</dd></div>
          <div><dt>{{ $t('workflow.powerSleep') }}</dt><dd>{{ powerInfo.sampleCollected ? powerInfo.configuredSleepSeconds + ' s' : $t('info.unknown') }}</dd></div>
        </dl>
        <p class="backup-hint">{{ $t('workflow.powerLimits') }}</p>
      </section>
      <p class="backup-hint">{{ $t('info.privacy') }}</p>
    </details>
    <section v-show="activeWorkspace === 'catalogue'" ref="catalogueWorkspace" id="catalogue-workspace" tabindex="-1" class="extra-tools" :aria-label="$t('workflow.extraTools')"><h2>{{ $t('workflow.extraTools') }}</h2><p>{{ $t('workflow.catalogueHint') }}</p>
    <button class="catalogue-toggle" type="button" :aria-expanded="catalogueOpen" aria-controls="figure-catalogue" @click="catalogueOpen = !catalogueOpen">{{ $t('info.catalogueOpen') }}</button>
    <CollectionAssistant ref="figureImport" :read-clock="readClock" :connected="connected" :blocked="(busy && !collectionBusy) || upload_diag_visible || syncDialog || zipDialog || meta_diag_visible || remoteActive" :generation="sessionGeneration" :directory="current_dir" :locale="language" :get-session="device_search_session" :get-transfer-session="collection_transfer_session" :revision="collectionRevision" :selected-figure="collectionSelected" @import-ready="$nextTick(focus_pending_figure_import)" @busy="collectionBusy = $event" @writing="collectionWriting = $event" @catalogue="on_collection_catalogue" @report="on_collection_report" @report-stale="on_collection_stale" @changed="on_collection_changed" @recovery="remember_recovery" />
    <div id="figure-catalogue"><CataloguePanel v-if="catalogueOpen" :catalogue="collectionCatalogue" :collection-report="cataloguePresenceReport" :collection-stale="collectionStale" :collection-historical="catalogueObservationHistorical" :collection-observed-at="catalogueObservationAt" :blocked="collectionBusy" :open-import="open_figure_import" @select-entry="collectionSelected = $event" /></div>
    </section>
    </div></div>
    <el-dialog :title="$t('info.diagnosticPreviewTitle')" v-model="diagnosticsDialog" width="min(800px, 94vw)" :close-on-click-modal="!diagnosticsBusy" :close-on-press-escape="!diagnosticsBusy" :show-close="!diagnosticsBusy">
      <p class="diagnostic-export-hint">{{ $t('info.diagnosticPreviewHint') }}</p>
      <p class="backup-hint">{{ $t('info.privacy') }}</p>
      <p class="property-filename">{{ diagnosticsFilename }}</p>
      <label class="diagnostic-json-label" for="diagnostic-json">{{ $t('info.diagnosticJsonContent') }}</label>
      <textarea id="diagnostic-json" ref="diagnosticsText" class="diagnostic-json" readonly spellcheck="false" rows="12" :value="diagnosticsJson"></textarea>
      <p v-if="!nativeDiagnosticSaveAvailable" class="backup-hint">{{ $t('info.diagnosticPickerUnavailable') }}</p>
      <p class="diagnostic-export-status" role="status" aria-live="polite">{{ $t(diagnosticsStatus) }}</p>
      <template #footer><div class="diagnostic-export-actions">
        <button v-if="nativeDiagnosticSaveAvailable" type="button" @click="save_diagnostic_file" :disabled="diagnosticsBusy">{{ $t('info.diagnosticSaveFile') }}</button>
        <button type="button" @click="copy_diagnostics" :disabled="diagnosticsBusy">{{ $t('info.diagnosticCopy') }}</button>
        <button type="button" @click="select_diagnostics" :disabled="diagnosticsBusy">{{ $t('info.diagnosticSelect') }}</button>
        <button type="button" @click="download_diagnostics" :disabled="diagnosticsBusy">{{ $t('info.diagnosticTryDownload') }}</button>
        <button type="button" @click="diagnosticsDialog = false" :disabled="diagnosticsBusy">{{ $t('info.closeProperties') }}</button>
      </div></template>
    </el-dialog>

    <el-dialog :title="$t('properties.title')" v-model="meta_diag_visible" @close="reset_figure_info" width="min(640px, 94vw)" :close-on-click-modal="!mutating" :close-on-press-escape="!mutating" :show-close="!mutating">
      <p class="property-filename">{{ meta_form.name }}</p>
      <section v-if="figureInfoSupported" class="figure-file-read">
        <button type="button" :disabled="!connected || busy" @click="read_figure_info">{{ $t('info.figureRead') }}</button>
        <p class="read-only-label">{{ $t('info.figureReadBrief') }}</p>
        <details><summary>{{ $t('info.figureReadScope') }}</summary><p>{{ $t('info.figureReadHint') }}</p></details>
        <p v-if="figureInfoState === 'reading'" role="status">{{ $t('info.figureReading') }}</p>
        <p v-if="figureInfoState === 'failed'" role="alert">{{ $t('info.figureReadFailed') }}</p>
      </section>
      <FigureDetails v-if="meta_diag_visible && meta_form.row && meta_form.row.type === 'REG'" :key="meta_form.path + ':' + (figureInspection ? 'file' : 'metadata')" :metadata="figureInspection ? null : meta_form.amiibo" :id="figureInspection?.id || null" :inspection="figureInspection" :source="figureInspection ? 'local' : 'metadata'" :catalogue="collectionCatalogue" />
      <details class="property-edit"><summary>{{ $t('info.editProperties') }}</summary>
      <el-form ref="form" :model="meta_form" label-width="80px" :disabled="mutating">
        <el-form-item :label="$t('properties.remark')">
          <el-input v-model="meta_form.notes" aria-describedby="metadata-note-hint" :aria-invalid="!metadataNote.valid"></el-input>
          <p id="metadata-note-hint" class="metadata-note-hint" :class="{ invalid: !metadataNote.valid }" role="status">{{ metadata_note_hint() }}</p>
        </el-form-item>
        <el-form-item :label="$t('properties.attrib')">
          <el-checkbox v-model="meta_form.flags.hide">{{ $t('properties.hide') }}</el-checkbox>
          <el-checkbox v-model="meta_form.flags.readonly">{{ $t('properties.readonly') }}</el-checkbox>
        </el-form-item>
      </el-form>
      </details>
      <template #footer>
        <el-button :disabled="mutating" @click="meta_diag_visible = false">{{ $t('info.closeProperties') }}</el-button>
        <el-button type="primary" :loading="mutating" :disabled="!connected || busy || !metadataNote.valid" @click="on_diag_meta_close">{{ $t('info.saveProperties') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="$t('workflow.zipTitle')" v-model="zipDialog" width="min(800px, 94vw)" :before-close="close_zip">
      <p>{{ $t('workflow.zipHint') }}</p><p class="property-filename">{{ $t('workflow.destination') }} {{ zipRoot }}</p>
      <label class="sync-picker">{{ $t('workflow.chooseZip') }}<input type="file" accept=".zip,application/zip" :disabled="busy" @change="on_zip_file"></label>
      <p>{{ zipFilename }}</p>
      <el-button @click="preview_zip" :disabled="!connected || busy || !zipFilename">{{ $t('info.syncCompare') }}</el-button>
      <section v-if="zipPlan" class="sync-plan">
        <p class="property-filename">{{ $t('workflow.source') }} {{ zipPlan.sourceRoot }} → {{ $t('workflow.destination') }} {{ zipPlan.rootPath }}</p>
        <p>{{ $t('info.syncSummary', zipPlan.summary) }}</p><p>{{ $t('workflow.selectionHint') }}</p>
        <div class="selection-actions"><button type="button" :disabled="busy" @click="select_plan('zip',true)">{{ $t('workflow.onlyNew') }}</button><button type="button" :disabled="busy" @click="select_plan('zip',false)">{{ $t('workflow.clearSelection') }}</button><span>{{ $t('workflow.selectedCount',{count:zipSelected.length}) }}</span></div>
        <div class="sync-entries"><label v-for="entry in zipPagedEntries" :key="entry.targetPath" class="sync-entry">
          <input v-if="entry.status==='add'||entry.status==='change'" type="checkbox" :value="entry.targetPath" v-model="zipSelected" :disabled="busy">
          <span>{{ $t('info.sync_' + entry.status) }} · {{ entry.targetPath }}</span><small v-if="entry.reason">{{ plan_reason(entry.reason) }}</small>
        </label></div>
        <div class="sync-pages"><button type="button" @click="zipPage--" :disabled="busy || zipPage<=1">{{ $t('tools.previous') }}</button>
          <span>{{ $t('tools.page',{page:zipPage,total:zipPageCount}) }}</span><button type="button" @click="zipPage++" :disabled="busy || zipPage>=zipPageCount">{{ $t('tools.next') }}</button></div>
        <el-button type="primary" @click="run_zip" :disabled="!connected || busy || !zipSelected.length">{{ $t('info.syncRun',{count:zipSelected.length}) }}</el-button>
      </section>
      <TransferStatus v-if="transfer" :transfer="transfer" :stats="transferStats" :format-size="format_size" :can-cancel="true" :cancelling="transferCancelling" @cancel="cancel_transfer" />
      <p v-if="zipStatus" role="status">{{ zipStatus }}</p><el-button v-if="zipBusy" :disabled="workflowCancelling" @click="cancel_transfer">{{ $t('tools.cancel') }}</el-button>
    </el-dialog>
    <el-dialog :title="$t('info.syncOpen')" v-model="syncDialog" width="min(780px, 94vw)" :before-close="close_sync">
      <p>{{ $t('info.syncNotice') }}</p>
      <p>{{ syncRoot }}</p>
      <label class="sync-picker">{{ $t('info.syncFiles') }} <input type="file" multiple :disabled="busy" @change="on_sync_files"></label>
      <label class="sync-picker">{{ $t('info.syncFolder') }} <input type="file" webkitdirectory multiple :disabled="busy" @change="on_sync_files"></label>
      <p>{{ $t('info.syncSelectedFiles', { count: syncFileCount }) }}</p>
      <el-button @click="build_sync_plan" :disabled="!connected || busy || !syncFileCount">{{ $t('info.syncCompare') }}</el-button>
      <section v-if="syncPlan" class="sync-plan">
        <p>{{ $t('info.syncSummary', syncPlan.summary) }}</p>
        <p>{{ $t('info.syncKeepDevice', { count: syncPlan.deviceOnly.length }) }}</p>
        <div class="selection-actions"><button type="button" :disabled="busy" @click="select_plan('sync',true)">{{ $t('workflow.onlyNew') }}</button><button type="button" :disabled="busy" @click="select_plan('sync',false)">{{ $t('workflow.clearSelection') }}</button><span>{{ $t('workflow.selectedCount',{count:syncSelected.length}) }}</span></div>
        <div class="sync-entries">
          <label v-for="entry in syncPagedEntries" :key="entry.relativePath" class="sync-entry">
            <input v-if="entry.status === 'add' || entry.status === 'change'" type="checkbox" :value="entry.targetPath" v-model="syncSelected" :disabled="busy">
            <span>{{ $t('info.sync_' + entry.status) }} · {{ entry.relativePath }}</span>
            <small v-if="entry.reason">{{ plan_reason(entry.reason) }}</small>
          </label>
        </div>
        <div class="sync-pages"><button type="button" @click="syncPage--" :disabled="busy || syncPage <= 1">{{ $t('tools.previous') }}</button>
          <span>{{ $t('tools.page', {page:syncPage,total:syncPageCount}) }}</span>
          <button type="button" @click="syncPage++" :disabled="busy || syncPage >= syncPageCount">{{ $t('tools.next') }}</button></div>
        <el-button type="primary" @click="run_sync" :disabled="!connected || busy || !syncSelected.length">{{ $t('info.syncRun', { count: syncSelected.length }) }}</el-button>
      </section>
      <TransferStatus v-if="transfer" :transfer="transfer" :stats="transferStats" :format-size="format_size" :can-cancel="true" :cancelling="transferCancelling" @cancel="cancel_transfer" />
      <p v-if="syncStatus" role="status">{{ syncStatus }}</p>
      <el-button v-if="syncing" :disabled="workflowCancelling" @click="cancel_sync">{{ $t('tools.cancel') }}</el-button>
    </el-dialog>
    <el-dialog :title="$t('upload.title')" v-model="upload_diag_visible" width="min(560px, 92vw)" :before-close="on_upload_diag_close">
      <div>
        <p class="upload-destination">{{ uploadHub.destination }} <strong>{{ current_dir }}</strong></p>
        <div class="upload-choices">
          <label class="upload-choice">{{ uploadHub.folder }}<input type="file" webkitdirectory multiple :disabled="busy || !connected" @change="on_upload_folder_choice"></label>
          <label class="upload-choice">{{ uploadHub.zip }}<input type="file" accept=".zip,application/zip" :disabled="busy || !connected" @change="on_upload_zip_choice"></label>
        </div>
        <p class="backup-hint">{{ uploadHub.planHint }}</p>
        <h3>{{ uploadHub.files }}</h3>
<TransferStatus v-if="transfer" :transfer="transfer" :stats="transferStats" :format-size="format_size" :can-cancel="true" :cancelling="transferCancelling" @cancel="cancel_transfer" />
              <p>{{ $t('tools.uploadNotice') }}</p>
        <el-checkbox v-model="safeUploads" :disabled="pendingUploads > 0" @change="value => { if (value) verifyUploads = true }">{{ $t('info.safeUploads') }}</el-checkbox>
        <p v-if="safeUploads">{{ $t('info.safeUploadHint') }}</p><p v-else class="notice error">{{ $t('info.directUploadWarning') }}</p>
        <el-checkbox v-model="verifyUploads" :disabled="safeUploads || pendingUploads > 0">{{ $t('tools.verify') }}</el-checkbox>
        <el-checkbox v-model="replaceUploads" :disabled="pendingUploads > 0">{{ $t('tools.replace') }}</el-checkbox>
        <el-upload ref="upload" class="upload-demo" drag action="#" multiple
          :http-request="on_upload_request" :on-error="on_upload_error" :disabled="!connected || enteringDfu || cancellingUploads || backingUp || dialogPending" :before-remove="before_upload_remove">
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
        <span role="status" aria-live="polite">{{ pendingUploads ? uploadHub.queued + ': ' + pendingUploads : uploadHub.idle }}</span>
        <el-button @click="on_upload_diag_close(() => { upload_diag_visible = false })">{{ uploadHub.close }}</el-button>
      </template>
    </el-dialog>

  <footer class="source-footer">
    <a :href="archiveLinks.source" download target="_blank" rel="noopener noreferrer">{{ language.startsWith('de') ? 'Quellcode (ZIP)' : 'Source code (ZIP)' }}{{ archiveLinks.labelSuffix }}</a>
    <a :href="archiveLinks.testKit" download target="_blank" rel="noopener noreferrer">{{ language.startsWith('de') ? 'Prüfpaket für ChatGPT (ZIP)' : 'Test kit for ChatGPT (ZIP)' }}{{ archiveLinks.labelSuffix }}</a>
    <a :href="licensesUrl" target="_blank" rel="noopener noreferrer">{{ language.startsWith('de') ? 'Quellen & Lizenzen' : 'Source & licenses' }}</a>
  </footer>
  </main></el-config-provider>
</template>



<script>
import DeviceStorageCard from "./components/DeviceStorageCard.vue"
import { storageUsage, storageAmount } from "./lib/device-storage-display.js"
import { defineAsyncComponent } from "vue"
import * as pixl from "./lib/pixl.ble"
import { sharedEventDispatcher } from "./lib/event"
import * as proto from "./lib/pixl.proto"
import { getElementLocale } from "./i18n"
import { read_saved_language, save_language } from "./lib/locale"
import { filterRows, joinDevicePath, sha256, saveBlob, saveBlobWithPicker } from "./lib/browser-tools.js"
import { createBackup, createBackupCheckpoint } from "./lib/backup.js"
import { readTimeEstimate, formatReadDuration } from "./lib/read-time-estimate.js"
import { normalizePowerDiagnostics } from "./lib/power-diagnostics.js"
import { normalizeBootDiagnostics, formatHexWord } from "./lib/boot-diagnostics.js"
import { normalizeDrives, normalizeRuntimeDiagnostics, memorySampleEvidenceKey, runtimeVfsDetailKey, uploadSpaceAvailable, createDiagnostics } from "./lib/device-info.js"
import { DIAGNOSTIC_SECTION_KEYS, collectDiagnosticSnapshot, createCombinedDiagnosticReport } from "./lib/diagnostic-snapshot.js"
import { assertPortableEntryName, portableNameKey } from "./lib/portable-names.js"
import { safeUpload, writableDirectoryPath } from "./lib/safe-upload.js"
import { createSyncPlan, createSyncJob, executeSyncJob } from "./lib/sync-plan.js"
import { createTransferMeter } from "./lib/transfer-meter.js"
import { loadBackupZip, previewZipImport, executeZipImport } from "./lib/zip-import.js"
import { TAG_LENGTHS, inspectTagStructure, metadataFigureId } from "./lib/figure-info.js"
import { directoryBreadcrumbs, checkedPageSize } from "./lib/folder-navigation.js"
import { metadataNoteInfo } from "./lib/metadata-note.js"
import { deploymentPath } from "./lib/deployment-path.js"
import { version as webVersion } from "../package.json"
import { projectDownloads } from "./lib/project-downloads.js"
import { dfuReference } from "./lib/release-packages.js"
import catalogueBaseline from "./data/catalogue.json"



export default {
  components: { DeviceStorageCard, DisplayPhoto: defineAsyncComponent(() => import('./components/DisplayPhoto.vue')), ScreenAwake: defineAsyncComponent(() => import('./components/ScreenAwake.vue')), CardSlotInspection: defineAsyncComponent(() => import('./components/CardSlotInspection.vue')), DiagnosticOverview: defineAsyncComponent(() => import('./components/DiagnosticOverview.vue')), CollectionAssistant: defineAsyncComponent(() => import('./components/CollectionAssistant.vue')), SelectionPreview: defineAsyncComponent(() => import('./components/SelectionPreview.vue')), DeviceSearch: defineAsyncComponent(() => import('./components/DeviceSearch.vue')), RemoteControl: defineAsyncComponent(() => import('./components/RemoteControl.vue')), StartupDiagnostics: defineAsyncComponent(() => import('./components/StartupDiagnostics.vue')), MigrationAssistant: defineAsyncComponent(() => import('./components/MigrationAssistant.vue')), TransferStatus: defineAsyncComponent(() => import('./components/TransferStatus.vue')), UpdateCheck: defineAsyncComponent(() => import('./components/UpdateCheck.vue')), CataloguePanel: defineAsyncComponent(() => import('./components/CataloguePanel.vue')), FigureDetails: defineAsyncComponent(() => import('./components/FigureDetails.vue')) },
  data() {
    return {
      diagnosticsDialog: false, diagnosticsJson: '', diagnosticsFilename: 'Allmiibo-Diagnose-3.43.0-rc.1.json', diagnosticsStatus: 'info.diagnosticReady', diagnosticsSaving: false, diagnosticsCopying: false,
      backupResumeInfo: null, storeBackup:false, storedBusy:false, storedHead:null, storedError:'', persistStatus:'',
      zipDialog: false, zipBusy: false, zipRoot: '', zipFilename: '', zipPlan: null, zipSelected: [], zipStatus: '', zipPage: 1,
      activeWorkspace: 'files', figureImportFocusPending: false, previewSelection: null, previewBusy: false, previewSerial: 0, remoteActive: false,
      powerInfo: null, powerState: 'unknown', startupBusy: false, displayPhotoBusy: false,
      fullDiagnosticSnapshot: null, fullDiagnosticBusy: false, fullDiagnosticProgress: null, fullDiagnosticInterrupted: false, readClock: 0,
      tableData: [], demoMode: false, catalogueOpen: false, migrationBusy: false,
      driveInfo: [], transportInfo: null, infoLoading: false,
      transferStats: null, transferHistory: [], lastDownload: null, runtimeInfo: null, runtimeState: 'unknown', bootInfo: null, bootState: 'unknown', lastDfuReference: '',
      safeUploads: true, recoveryNotes: [], cancellingUploads: false, workflowCancelling: false,
      syncDialog: false, syncRoot: '', syncing: false, syncFileCount: 0,
      syncPlan: null, syncSelected: [], syncStatus: '', syncPage: 1,
      collectionReport:null, collectionStale:false, collectionObservation:null, collectionRevision:0, collectionBusy:false, collectionWriting:false, collectionCatalogue:catalogueBaseline, collectionSelected:null, searchBusy: false, searchQuery: '', typeFilter: 'all', dialogPending: false, backingUp: false,
      page: 1, pageSize: 100, sortKey: 'name', sortOrder: 'ascending',
      cancellingBackup: false, lastBackup: null, transfer: null, browserIssue: '',
      verifyUploads: true, replaceUploads: false,
      connBtnType: "",
      connBtnText: `${this.$t("conn.connect")}`,
      version: "",
      connected: false,
      table_loading: false, listingError: false, backupDriveOpenError: false,
      mutating: false, connecting: false, disconnecting: false, enteringDfu: false, pendingUploads: 0, pendingDownloads: 0,
      sessionGeneration: 0, listingGeneration: 0, firmwareVersion: "",
      current_dir: "",
      upload_diag_visible: false,
      table_selection: [],
      language: "de_DE",
      meta_diag_visible: false,
      figureInspection: null, figureInfoState: 'idle', figureInfoGeneration: 0,
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

  watch: {
    collectionRevision(){this.collectionObservation=null;},
    mutating(value){if(value)++this.collectionRevision;},
    pendingUploads(value,previous){if(value>previous)++this.collectionRevision;},
    syncing(value){if(value)++this.collectionRevision;},
    zipBusy(value){if(value)++this.collectionRevision;},
    migrationBusy(value){if(value)++this.collectionRevision;},
    collectionWriting(value){if(value)++this.collectionRevision;}
  },
  computed: {
    screenAwakeActive() { return this.connected && (this.backingUp || this.fullDiagnosticBusy || this.startupBusy || this.collectionBusy || this.searchBusy || this.migrationBusy || this.syncing || this.zipBusy || this.pendingUploads > 0 || this.pendingDownloads > 0); },
    catalogueObservationHistorical() { return !this.connected && !this.connecting && !this.collectionStale && !!this.collectionObservation; },
    cataloguePresenceReport() { return this.catalogueObservationHistorical ? this.collectionObservation.report : this.collectionReport; },
    catalogueObservationAt() { return this.catalogueObservationHistorical ? this.collectionObservation.checkedAt : ''; },
    dfuPageUrl() { return deploymentPath('dfu/web.html') + (this.lastDfuReference || ''); },
    licensesUrl() { return deploymentPath('licenses/index.html'); },
    archiveLinks() { return projectDownloads(webVersion); },
    guideUrl() { return deploymentPath(this.language.startsWith('de') ? 'guide/index.html' : 'guide/en.html'); },
    uploadHub() { return this.language.startsWith('de') ? { destination:'Zielordner:', folder:'Ordner auswählen', zip:'Sicherungs-ZIP auswählen', files:'Einzelne Dateien', planHint:'Ordner und ZIP öffnen zuerst eine Vorschau. Dort wählst du aus, was übertragen wird. Ordnernamen und Metadaten bleiben erhalten.', queued:'Dateien in der Warteschlange', idle:'Keine laufende Übertragung', close:'Schließen' } : { destination:'Destination folder:', folder:'Choose folder', zip:'Choose backup ZIP', files:'Individual files', planHint:'Folders and ZIPs first open a preview. Choose what to transfer there. Folder names and metadata are preserved.', queued:'Files in the queue', idle:'No transfer running', close:'Close' }; },
    metadataNote() { return metadataNoteInfo(this.meta_form.notes); },
    diagnosticsBusy() { return this.diagnosticsSaving || this.diagnosticsCopying; },
    nativeDiagnosticSaveAvailable() { return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'; },
    elementLocale() { return getElementLocale(this.language) },
    breadcrumbs() { return directoryBreadcrumbs(this.current_dir); },
    figureInfoSupported() { return this.meta_form.row?.type === 'REG' && TAG_LENGTHS.includes(this.meta_form.row?.sizeBytes); },
    busy() { return this.displayPhotoBusy || this.fullDiagnosticBusy || this.collectionBusy || this.previewBusy || this.searchBusy || this.startupBusy || this.migrationBusy || this.table_loading || this.infoLoading || this.mutating || this.dialogPending || this.enteringDfu || this.syncing || this.zipBusy || this.backingUp || this.pendingUploads > 0 || this.pendingDownloads > 0 },
    lastTransfer() { return this.transferHistory.at(-1) || null; },
    connectionDisconnectLocked() { return this.collectionWriting || this.migrationBusy || this.zipBusy || this.syncing || (this.safeUploads && this.pendingUploads > 0); },
    zipPageCount() { return Math.max(1, Math.ceil((this.zipPlan?.entries.length || 0) / 100)); },
    zipPagedEntries() { return (this.zipPlan?.entries || []).slice((this.zipPage - 1) * 100, this.zipPage * 100); },
    syncPageCount() { return Math.max(1,Math.ceil((this.syncPlan?.entries.length || 0)/100)); },
    syncPagedEntries() { return (this.syncPlan?.entries || []).slice((this.syncPage-1)*100,this.syncPage*100); },
    filteredRows() { return filterRows(this.tableData, this.searchQuery, this.typeFilter); },
    nameCollator() { return new Intl.Collator(this.language.replace('_', '-'), { numeric: true, sensitivity: 'base' }); },
    sortedRows() {
      const direction = this.sortOrder === 'descending' ? -1 : 1;
      return [...this.filteredRows].sort((a, b) => direction * (this.sortKey === 'size'
        ? this.sort_table_row_size(a, b) : this.nameCollator.compare(a[this.sortKey] || '', b[this.sortKey] || '')));
    },
    pageCount() { return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize)); },
    pagedRows() { const start = (Math.min(this.page, this.pageCount) - 1) * this.pageSize; return this.sortedRows.slice(start, start + this.pageSize); },
    transferCancelling() { return this.cancellingBackup || this.cancellingUploads || this.workflowCancelling; },
    connectionSummaryKey() { return this.disconnecting ? 'info.disconnecting' : this.connecting ? 'conn.connecting' : this.connected ? 'info.connected' : this.demoMode ? 'tools.previewOpen' : 'info.disconnected'; },
    availableBackupDrives() { return this.driveInfo.filter(drive => drive.status === 0); },
    selectedDriveInfo() { return this.connected ? this.driveInfo.find(d => d.label === this.current_dir[0] && d.status === 0) || null : null; },
    quickFreeSpace() { const info = storageUsage(this.statusDriveInfo); return info ? storageAmount(info.free, this.language) : null; },
    statusDriveInfo() {
      if (this.current_dir) return this.selectedDriveInfo;
      return this.connected ? this.driveInfo.find(d => d.label === 'E' && d.status === 0) || null : null;
    },
    folderEntryCount() {
      return this.connected && this.current_dir && !this.table_loading && !this.listingError ? this.tableData.length : null;
    },
    transferPercent() { return Math.floor(this.transferStats?.percent ?? 0); },
    backupReadTime() {
      const timing = this.backingUp && this.transfer?.timing;
      if (!timing) return null;
      const now = Math.max(timing.updatedAt, this.readClock);
      return { ...readTimeEstimate(timing, now), jobSeconds: Math.floor((now - timing.jobStartedAt) / 1000) };
    },
    backupReadSummary() {
      const backup = this.lastBackup;
      if (!backup?.manifest?.resume || backup.sessionGeneration !== this.sessionGeneration) return null;
      const { files, bytes, resume: { reusedFiles, reusedBytes } } = backup.manifest;
      return { freshFiles: files - reusedFiles, freshBytes: bytes - reusedBytes, reusedFiles, reusedBytes };
    },
    backupCanResume() { return !!this.backupResumeInfo?.files && !this.backingUp && !this.backupResumeInfo.busy; },
    storedBackupMatches() {
      const context = this.storedHead?.context;
      const root = this.current_dir?.length > 3 ? this.current_dir.replace(/\/$/u, '') : this.current_dir;
      return !!(context && this.connected && context.deviceKey === pixl.get_device_key?.() &&
        context.firmwareVersion === this.firmwareVersion && context.rootPath === root && context.preserveLegacyNames === true);
    },
    backupResumeMatches() { return !!(this.connected && this.backupResumeInfo && this._backupCheckpoint?.matchesDevice(pixl.get_device_key?.(), this.firmwareVersion)); }
  },
  methods: {
    memory_sample_key(count) { return memorySampleEvidenceKey(count); },
    select_file_row(index, row) {
      const demo=!this.connected&&this.demoMode&&row.demoFigure===true;
      if ((!this.connected&&!demo) || (this.busy && !this.previewBusy)) return;
      if (row.type !== 'REG') return this.handle_name_click(index,row);
      let path; try { path=demo?'demo:'+row.name:this.append_segment(this.current_dir,row.name); } catch { return; }
      if(this.previewSelection?.row===row&&this.previewSelection.path===path&&this.previewSelection.state!=='failed')return this._previewTail;
      const generation=this.sessionGeneration, serial=++this.previewSerial;
      const selection={row,path,id:null,inspection:null,state:'unknown',source:demo?'demo':'metadata'};
      this.previewSelection=selection;
      const current=()=>this.session_current(generation)&&serial===this.previewSerial&&this.previewSelection?.path===path;
      if(!TAG_LENGTHS.includes(row.sizeBytes)){selection.state='unsupported';return;}
      const id=row.metadataValid===false?null:metadataFigureId(row.amiibo);
      if(id){selection.id=id;selection.state='ready';return;}
      if(demo)return;
      selection.state='reading';selection.source='file';
      this.previewBusy=true;
      const pending=(this._previewTail||Promise.resolve()).then(async()=>{
        if(!current())return;
        try{
          const bytes=await this.read_device_file(path,{max_bytes:row.sizeBytes});
          if(!current())return;
          if(bytes.byteLength!==row.sizeBytes)throw new Error('File size changed');
          const inspection=inspectTagStructure(new Uint8Array(bytes));
          // Never assign an ordinary figure image to a malformed selected file.
          this.previewSelection={...selection,inspection,id:inspection.status==='structure-consistent'?inspection.id:null,
            state:inspection.status==='structure-consistent'?'ready':'invalid'};
        }catch(error){if(current())this.previewSelection={...selection,state:'failed'};}
      });
      this._previewTail=pending.catch(()=>{});
      const tail=this._previewTail;
      void tail.finally(()=>{if(generation===this.sessionGeneration&&tail===this._previewTail)this.previewBusy=false;});
      return pending;
    },
    close_preview_selection() { this.previewSelection=null;++this.previewSerial; },
    preview_selection_current(selection = this.previewSelection) {
      if (!this.connected || !selection || !this.current_dir || selection.row?.type !== 'REG' ||
          this.previewSelection?.row !== selection.row || this.previewSelection.path !== selection.path ||
          !this.tableData.includes(selection.row)) return false;
      // A retained picture must never redirect an action into a new folder or
      // target a newly listed file that merely reuses the previous filename.
      try { return this.append_segment(this.current_dir, selection.row.name) === selection.path; }
      catch { return false; }
    },
    async download_preview_selection() {
      const selection=this.previewSelection,generation=this.sessionGeneration,serial=this.previewSerial;
      if(!this.preview_selection_current(selection))return;
      await this._previewTail;
      if(!this.session_current(generation)||this.busy||serial!==this.previewSerial||!this.preview_selection_current(selection))return;
      return this.handle_name_click(0,selection.row);
    },
    open_preview_properties() {
      const selection=this.previewSelection;
      if(!this.busy&&this.preview_selection_current(selection))return this.on_row_btn_meta(0,selection.row);
    },
    collection_transfer_session() {
      const generation=this.sessionGeneration;this.assert_session(generation);
      return { ...this.transfer_adapters(generation), recoveryOrigin: Object.freeze({
        sessionGeneration:generation, deviceKey:pixl.get_device_key?.() || null
      }) };
    },
    open_figure_import(checkedFile) {
      const assistant = this.$refs.figureImport;
      if (!assistant?.acceptCheckedFigure(checkedFile)) return false;
      this.collectionSelected = assistant.chosen;
      return true;
    },
    on_collection_catalogue(result) {
      this.collectionObservation=null;
      this.collectionCatalogue={...catalogueBaseline,entries:result.entries,checkedDate:result.observedAt.slice(0,10),commit:result.source.commit,sourceUrl:result.source.url};
    },
    on_collection_report(report) {
      this.collectionReport=this.connected ? report : null;
      // Child invalidation emits null after disconnect. Keep only the already
      // completed observation, never a late result from the former session.
      if(!this.connected)return;
      this.collectionObservation=null;
      if(this.collectionStale || this.collectionWriting || this.mutating || this.pendingUploads>0 || this.syncing || this.zipBusy || this.migrationBusy)return;
      if(report?.schema!==1 || !['full','quick'].includes(report.mode) || report.status!=='complete' || report.complete!==true || report.scanComplete!==true || report.cancelled || report.sessionChanged ||
        (report.mode==='full' && report.contentComplete!==true) || !Array.isArray(report.errors) || report.errors.length || !Array.isArray(report.limitsReached) || report.limitsReached.length ||
        report.stats?.readErrors || report.stats?.invalidEntries || !Array.isArray(report.files) || !Array.isArray(report.present) || !Array.isArray(report.missing))return;
      this.collectionObservation=Object.freeze({report,checkedAt:new Date().toISOString()});
    },
    on_collection_stale(stale) { this.collectionStale=stale; if(stale)this.collectionObservation=null; },
    async on_collection_changed(receipt) {
      this.remember_recovery(receipt);
      await this.refresh_current();
    },
    device_search_session() {
      const generation = this.sessionGeneration;
      this.assert_session(generation);
      return { assertSession: () => this.assert_session(generation), readDirectory: async path => {
        this.assert_session(generation);
        const entries = this.checked(await proto.vfs_read_folder(path));
        this.assert_session(generation);
        return entries;
      }, readFile: async (path, { maxBytes }) => {
        this.assert_session(generation);
        const bytes = await this.read_device_file(path, { max_bytes: maxBytes });
        this.assert_session(generation); return bytes;
      } };
    },
    current_search_result(result) {
      if (!result || !this.connected || this.busy || result.generation !== this.sessionGeneration || ![0,1].includes(result.type)) return false;
      try {
        return joinDevicePath(result.parent, result.name) === result.path;
      } catch { return false; }
    },
    download_search_result(result) {
      if (!this.current_search_result(result) || result.type !== 0 || !Number.isSafeInteger(result.size) || result.size < 0) return;
      return this.download_device_file(result.path, result.name, result.size, true);
    },
    async navigate_search_result(result) {
      if (!this.current_search_result(result)) return;
      const generation = this.sessionGeneration, dir = result.type === 1 ? result.path : result.parent;
      this.reset_filters(); this.current_dir = dir;
      await this.reload_folder();
      if (!this.session_current(generation) || this.current_dir !== dir || this.listingError) return;
      if (result.type === 0) {
        const index = this.sortedRows.findIndex(row => row.name === result.name && row.type === 'REG');
        if (index < 0) return;
        this.page = Math.floor(index / this.pageSize) + 1;
        await this.$nextTick();
        if (!this.session_current(generation) || this.current_dir !== dir) return;
        const button = Array.from(this.$refs.fileWorkspace?.querySelectorAll?.('[data-file-name]') || []).find(item => item.getAttribute('data-file-name') === result.name);
        button?.focus?.(); button?.scrollIntoView?.({ block:'nearest' });
      } else this.show_workspace('files');
    },
    on_upload_folder_choice(event) {
      if (this.busy || !this.connected || !this.current_dir || !event.target.files?.length) { event.target.value = ''; return; }
      this.$refs.upload?.clearFiles();
      this.upload_diag_visible = false;
      this.open_sync();
      if (this.syncDialog) this.on_sync_files(event);
    },
    async on_upload_zip_choice(event) {
      if (this.busy || !this.connected || !this.current_dir || !event.target.files?.length) { event.target.value = ''; return; }
      this.$refs.upload?.clearFiles();
      this.upload_diag_visible = false;
      this.open_zip();
      if (this.zipDialog) await this.on_zip_file(event);
    },
    read_display_photo(version) { return proto.get_display_photo(version); },
    read_startup_diagnostics() { this.fullDiagnosticSnapshot = null; return proto.get_startup_diagnostics(this.firmwareVersion); },
    open_startup_report(report) {
      if (this.diagnosticsBusy || !this.connected || this.startupBusy) return;
      this.diagnosticsJson = JSON.stringify(report, null, 2) + '\n';
      this.diagnosticsFilename = 'Allmiibo-Startdiagnose-3.43.0-rc.1.json';
      this.diagnosticsStatus = 'info.diagnosticReady'; this.diagnosticsDialog = true;
    },
    navigate_breadcrumb(path) {
      if (!this.connected || this.busy || path === this.current_dir || !this.breadcrumbs.some(crumb => crumb.path === path)) return;
      this.reset_filters(); this.current_dir = path;
      return this.refresh_current();
    },
    set_page_size(value) {
      if (this.busy) return;
      const size = checkedPageSize(value);
      if (size === this.pageSize) return;
      this.pageSize = size; this.on_filter_change();
    },
    plan_reason(code) { const known = ['PARENT_BLOCKED','NAME_COLLISION','TYPE_CONFLICT','EXISTING_SIZE_LIMIT','READONLY','INVALID_METADATA','UPLOAD_SIZE_LIMIT','INTERNAL_TRANSACTION_JOURNAL','TRANSACTION_PENDING']; const reason = code === 'DIRECTORY_CONFLICT' ? 'TYPE_CONFLICT' : code; return this.$t('workflow.' + (known.includes(reason) ? reason : 'blockedOther')); },
    select_plan(kind, additionsOnly) {
      if (this.busy) return;
      const plan = kind === 'zip' ? this.zipPlan : kind === 'sync' ? this.syncPlan : null;
      if (!plan) return;
      this[kind + 'Selected'] = additionsOnly ? plan.entries.filter(e => e.status === 'add').map(e => e.targetPath) : [];
    },
    show_figure_import() {
      this.show_workspace('catalogue');
      if (this.activeWorkspace !== 'catalogue') return;
      this.figureImportFocusPending = true;
      this.$nextTick(this.focus_pending_figure_import);
    },
    focus_pending_figure_import() {
      if (!this.figureImportFocusPending) return;
      const panel = this.$refs.catalogueWorkspace;
      if (this.activeWorkspace !== 'catalogue' || document.activeElement !== panel) {
        this.figureImportFocusPending = false;
        return;
      }
      const target = panel.querySelector('[aria-labelledby="figure-import-title"]');
      if (!target) return;
      this.figureImportFocusPending = false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    },
    show_workspace(name) {
      const refs = { files: 'fileWorkspace', backup: 'backupWorkspace', update: 'updateWorkspace', remote: 'remoteWorkspace', device: 'devicePanel', catalogue: 'catalogueWorkspace' };
      const panel = Object.hasOwn(refs, name) ? this.$refs[refs[name]] : null;
      if (!panel || (this.migrationBusy && name !== 'backup')) return;
      this.figureImportFocusPending = false;
      this.activeWorkspace = name;
      if (name === 'catalogue') this.catalogueOpen = true;
      if (!['files','catalogue'].includes(name)) panel.open = true;
      panel.scrollIntoView?.({ block: 'start', behavior: 'auto' });
      (['files','catalogue'].includes(name) ? panel : panel.querySelector?.('summary'))?.focus?.({ preventScroll: true });
      this.$nextTick(() => {
        if (this.activeWorkspace !== name) return;
        panel.scrollIntoView?.({ block:'start', behavior:'auto' });
        (['files','catalogue'].includes(name) ? panel : panel.querySelector?.('summary'))?.focus?.({ preventScroll:true });
      });
    },
    on_migration_busy(value) {
      this.migrationBusy = !!value;
      if (this.migrationBusy) this.activeWorkspace = 'backup';
      if (this.migrationBusy && this.$refs.backupWorkspace) this.$refs.backupWorkspace.open = true;
    },
    keep_migration_visible() {
      if (this.migrationBusy && this.$refs.backupWorkspace) this.$refs.backupWorkspace.open = true;
    },
    show_device_panel() { return this.show_workspace('device'); },
    runtime_vfs_detail(code) { return this.$t('info.' + runtimeVfsDetailKey(code)); },
    formatReadDuration(seconds) { return formatReadDuration(seconds); },
    refresh_local_metrics() {
      if (this.fullDiagnosticBusy || this.collectionBusy || this.backingUp) this.readClock = performance.now();
      this.transportInfo = proto.get_transport_diagnostics?.() || null;
      if (this.transfer && this._transferMeter) this.transferStats = this._transferMeter.snapshot();
    },
    set_transfer(value) {
      this.transfer = value;
      this._transferMeter ||= createTransferMeter();
      this.transferStats = value ? this._transferMeter.update(value) : null;
      if (!value) this._transferMeter.reset();
      this.refresh_local_metrics();
    },
    remember_transfer(kind, status, bytes = 0, verified = false) {
      this.transferHistory.push({ kind, status, bytes, verified });
      this.transferHistory = this.transferHistory.slice(-20);
    },
    remember_interruption() {
      const kind = (this.zipBusy || this.syncing) ? 'sync' : this.backingUp ? 'backup' : this.pendingDownloads ? 'download' : this.pendingUploads ? 'upload' : null;
      const intent = this._disconnectIntent?.generation === this.sessionGeneration ? this._disconnectIntent.reason : null;
      if (!kind || intent === 'dfu') return;
      this.remember_transfer(kind, intent === 'cancelled' || this.cancellingBackup ? 'cancelled' : 'interrupted', this.transfer?.done || 0);
    },
    clear_dfu_attempt(attempt = this._dfuAttempt) {
      if (!attempt || this._dfuAttempt !== attempt) return;
      clearTimeout(attempt.timer);
      this._dfuAttempt = null; this.enteringDfu = false;
    },
    clear_migration_restart(attempt = this._migrationRestartAttempt) {
      if (!attempt || this._migrationRestartAttempt !== attempt) return;
      clearTimeout(attempt.timer); this._migrationRestartAttempt = null;
      if (this._disconnectIntent === attempt) this._disconnectIntent = null;
    },
    async request_migration_restart(generation) {
      this.assert_session(generation); this.clear_migration_restart();
      const attempt = { generation, reason: 'migration-restart', timer: null };
      this._migrationRestartAttempt = attempt; this._disconnectIntent = attempt;
      attempt.timer = setTimeout(() => this.clear_migration_restart(attempt), 15000);
      try { return this.checked(await proto.vfs_import_state('E', 2)); }
      catch (error) { this.clear_migration_restart(attempt); throw error; }
    },
    remember_recovery(value) {
      const receipt = value?.recovery;
      const files = receipt?.recoveryFiles || value?.recoveryFiles || [];
      if (!files.length && receipt?.committed !== null && receipt?.restored !== true) return;
      // Recovery locations are shown only here in this browser's memory. They
      // are deliberately excluded from the allowlisted diagnostic export.
      const note = { ...(value?.recoveryOrigin ? { sourceSession: { sessionGeneration:value.recoveryOrigin.sessionGeneration, deviceKey:value.recoveryOrigin.deviceKey } } : {}),
        phase: receipt?.phase || 'complete', failurePhase:receipt?.failurePhase || null,
        targetPath:receipt?.targetPath || value?.path || null, committed: receipt ? receipt.committed : true,
        restored: receipt?.restored === true, files: files.map(file => ({path:file.path, role:file.role, state:file.state})) };
      this.recoveryNotes.push(JSON.stringify(note, null, 2));
      this.recoveryNotes = this.recoveryNotes.slice(-20);
    },
    migration_session() {
      const generation=this.sessionGeneration,deviceKey=pixl.get_device_key?.();this.assert_session(generation);
      if(!deviceKey)throw new Error(this.$t('info.syncIdentity'));
      return {...this.transfer_adapters(generation),deviceKey,firmwareVersion:this.firmwareVersion,
        readStorageInfo:async()=>{this.assert_session(generation);const response=await proto.vfs_storage_info_extended('E');this.assert_session(generation);if(response?.status===255)throw Object.assign(new Error('Raw128 storage capabilities were not confirmed.'),{code:'MIGRATION_PREPARATION_REQUIRED'});return this.checked(response);},
        readStorageLayout:async()=>{this.assert_session(generation);const value=this.checked(await proto.vfs_storage_layout('E'));this.assert_session(generation);return value;},
        readApplicationIdentity:async()=>{this.assert_session(generation);const version=this.checked(await proto.get_version());this.assert_session(generation);const boot=normalizeBootDiagnostics(await proto.get_boot_diagnostics());this.assert_session(generation);if(!boot)throw Object.assign(new Error('Current application counter is unavailable.'),{code:'MIGRATION_IDENTITY'});return {...boot,firmwareVersion:version.ver};},
        readImportState:async()=>{this.assert_session(generation);const state=this.checked(await proto.vfs_import_state('E',0));this.assert_session(generation);return state;},
        bindImport:async hash=>{this.assert_session(generation);const state=this.checked(await proto.vfs_import_state('E',3,hash));this.assert_session(generation);return state;},
        finishImport:async()=>{this.assert_session(generation);const state=this.checked(await proto.vfs_import_state('E',1));this.assert_session(generation);return state;},
        restartDevice:()=>this.request_migration_restart(generation),
        formatStorage:async()=>{this.assert_session(generation);this.checked(await proto.vfs_drive_format('E'));this.assert_session(generation);},
        readRawMetadata:async path=>{this.assert_session(generation);const bytes=this.checked(await proto.vfs_read_raw_meta(path));this.assert_session(generation);return bytes;},
        updateRawMetadata:async(path,bytes)=>{this.assert_session(generation);this.checked(await proto.vfs_write_raw_meta(path,bytes));this.assert_session(generation);}}
    },
    confirm_migration_restore({files,root}) {
      const text=this.language==='de_DE'?`Alle Nutzdaten aus der geprüften Sicherung nach ${root} wiederherstellen (${files} Dateien einschließlich separat ausgeschlossener Journaldateien)? Vorhandene gleichnamige Dateien können ersetzt werden. Es wird nicht formatiert.`:`Restore all user entries from the verified backup to ${root} (${files} files including separately excluded journals)? Existing matching paths may be replaced. No formatting is performed.`;
      return this.ask_dialog(()=>this.$confirm(text,this.language==='de_DE'?'Vollständige Wiederherstellung':'Full restoration',this.confirm_options()));
    },
    confirm_migration_format({archiveSha256,recoveryAttempt=false}) {
      const text=this.language==='de_DE'?`Laufwerk E: auf diesem geprüften Gerät jetzt ausdrücklich löschen und als Packed LittleFS initialisieren? Die Quelldaten wurden mit der gespeicherten ZIP verglichen. Archiv-SHA256: ${archiveSha256}. Anschließend dieselbe ZIP wiederherstellen. Dies ist kein Firmware-Flash.`:`Explicitly erase E: on this checked device and initialize Packed LittleFS? Source data was compared to the saved ZIP. Archive SHA256: ${archiveSha256}. Restore that same ZIP afterwards. This does not flash firmware.`;
      const recovery=this.language==='de_DE'?`Der Ausgang eines früheren Formatversuchs ist in diesem Browser nicht abschließend bestätigt; der Speicher ist jetzt nicht eingebunden. Ein Abschluss auf einem anderen PC oder Handy und später geänderte Daten sind damit nicht ausgeschlossen. E: ausdrücklich erneut löschen und mit genau dieser ZIP initialisieren? Dies ist kein neuer Quellvergleich. SHA256: ${archiveSha256}.`:`This browser has no final confirmation of an earlier format attempt, and storage is now unmounted. Completion on another computer or phone and later data changes cannot be ruled out. Explicitly erase E: again and initialize it for this exact ZIP? This is not a new source comparison. SHA256: ${archiveSha256}.`;
      return this.ask_dialog(()=>this.$confirm(recoveryAttempt?recovery:text,this.language==='de_DE'?'E: ausdrücklich formatieren':'Explicitly format E:',this.confirm_options()));
    },
    confirm_migration_initialize({archiveSha256}) {
      const text=this.language==='de_DE'?`Den bereits leeren, ausstehenden Import fest an diese geprüfte ZIP binden? SHA256: ${archiveSha256}. Es wird nicht erneut formatiert. Diese Wiederaufnahme ersetzt keinen früheren Quellvergleich.`:`Bind this already empty pending import to the checked ZIP? SHA256: ${archiveSha256}. No additional format is performed. Recovery initialization does not replace an earlier source comparison.`;
      return this.ask_dialog(()=>this.$confirm(text,this.language==='de_DE'?'Wiederherstellung initialisieren':'Initialize recovery',this.confirm_options()));
    },
    confirm_migration_restart() {
      return this.ask_dialog(()=>this.$confirm(this.language==='de_DE'?'Die vollständig geprüfte Wiederherstellung ist abgeschlossen. Allmiibo jetzt neu starten?':'The fully verified restoration is complete. Restart Allmiibo now?',this.language==='de_DE'?'Gerät neu starten':'Restart device',this.confirm_options()));
    },
    transfer_adapters(generation) {
      return {
        assertSession: () => this.assert_session(generation),
        readDirectory: async path => { this.assert_session(generation); const data = this.checked(await proto.vfs_read_folder(path)); this.assert_session(generation); return data; },
        readFile: async (path, options = {}) => { this.assert_session(generation); const data = await this.read_device_file(path, {max_bytes:options.maxBytes, progress_cb:options.onProgress}); this.assert_session(generation); return data; },
        writeFile: (path, bytes, options = {}) => new Promise((resolve, reject) => {
          try { this.assert_session(generation); proto.vfs_helper_write_file(path, new Blob([bytes]), options.onProgress || (() => {}), resolve, reject, {rawMeta128:options.rawMeta128}); }
          catch(error) { reject(error); }
        }),
        rename: async (from, to) => { this.assert_session(generation); this.checked(await proto.vfs_rename(from,to)); this.assert_session(generation); },
        remove: async path => { this.assert_session(generation); this.checked(await proto.vfs_remove(path)); this.assert_session(generation); },
        updateMetadata: async (path, meta) => { this.assert_session(generation); this.checked(await proto.vfs_update_meta(path,meta)); this.assert_session(generation); },
        createDirectory: async path => { this.assert_session(generation); this.checked(await proto.vfs_create_folder(path)); this.assert_session(generation); },
        getFreeBytes: async path => { const drives=await this.read_drive_info(generation); const drive=drives.find(item=>item.label===path[0]); if(!drive || drive.status!==0) throw new Error(this.$t('info.driveUnavailable')); return drive.freeBytes; }
      };
    },
    show_safe_progress(progress, path, total, onProgress) {
      const done = Number.isSafeInteger(progress?.done) && progress.done >= 0 ? progress.done : 0;
      const boundedTotal = Number.isSafeInteger(progress?.total) && progress.total >= 0 ? progress.total : total;
      this.set_transfer({phase:progress?.phase || 'uploading', path:progress?.path || path, done, total:boundedTotal, complete:progress?.phase === 'complete'});
      if (progress?.phase === 'uploading') onProgress?.({percent:boundedTotal ? Math.min(99,done / boundedTotal * 100) : 0});
    },
    show_sync_progress(progress) {
      if (['listing','compared','syncing'].includes(progress?.phase)) {
        this.set_transfer(null);
        this.syncStatus = this.$t('info.syncProgress', {done:progress.filesDone || 0,total:progress.filesTotal || 0});
      } else this.show_safe_progress(progress,this.syncRoot,0);
    },
    open_zip() {
      if (this.btn_disabled() || this.upload_diag_visible) return;
      this.invalidate_zip(); this.zipRoot = this.current_dir; this.zipDialog = true;
    },
    invalidate_zip() {
      this.workflowCancelling = false; this._zipController?.abort(); this._zipController = null; this._zipArchive = null;
      this._zipGeneration = null; this._zipDeviceKey = null;
      this.zipDialog = false; this.zipBusy = false; this.zipPlan = null; this.zipSelected = [];
      this.zipFilename = ''; this.zipStatus = ''; this.zipPage = 1;
    },
    close_zip(done) { if (!this.zipBusy) { this.invalidate_zip(); done?.(); } },
    show_zip_progress(progress) {
      if (progress.unit === 'files' || progress.unit === 'entries') {
        this.set_transfer(null);
        this.zipStatus = this.$t('workflow.' + progress.phase, {done:progress.done || 0,total:progress.total || 0});
      } else this.show_safe_progress(progress,this.zipRoot,0);
    },
    async on_zip_file(event) {
      if (!this.connected || this.busy || !this.zipDialog) return;
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      const generation=this.sessionGeneration, controller=new AbortController();
      this.workflowCancelling=false; this._zipController=controller; this.zipBusy=true; this.zipPlan=null; this.zipSelected=[]; this._zipArchive=null; this.zipFilename='';
      this.zipStatus=this.$t('workflow.validating');
      try {
        const archive=await loadBackupZip(file,{signal:controller.signal,
          onProgress:progress=>{if(this.session_current(generation))this.show_zip_progress(progress);}});
        this.assert_session(generation);
        if (controller.signal.aborted) return;
        this._zipArchive=archive; this.zipFilename=file.name; this.zipStatus=this.$t('workflow.validated',{files:archive.fileCount,bytes:this.format_size(archive.byteCount)});
      } catch(error) { if(this.session_current(generation)) {this.zipStatus=this.$t(controller.signal.aborted?'info.syncCancelled':'workflow.invalidZip');if(!controller.signal.aborted)this.show_transfer_error(error);} }
      finally { if(this._zipController===controller)this._zipController=null;if(generation===this.sessionGeneration){this.workflowCancelling=false;this.zipBusy=false;this.workflowCancelling=false;} }
    },
    async preview_zip() {
      if (!this.connected || this.busy || !this._zipArchive || !this.zipDialog) return;
      const generation=this.sessionGeneration, deviceKey=pixl.get_device_key?.();
      if (!deviceKey) {this.show_transfer_error(new Error(this.$t('info.syncIdentity')));return;}
      const controller=new AbortController();this.workflowCancelling=false; this._zipController=controller;this.zipBusy=true;this.zipPlan=null;this.zipSelected=[];
      try {
        const plan=await previewZipImport({archive:this._zipArchive,rootPath:this.zipRoot,deviceKey,...this.transfer_adapters(generation),signal:controller.signal,
          onProgress:progress=>{if(this.session_current(generation))this.show_zip_progress(progress);}});
        this.assert_session(generation);if(controller.signal.aborted)return;
        this.zipPlan=plan;this._zipGeneration=generation;this._zipDeviceKey=deviceKey;this.zipPage=1;
        this.zipSelected=plan.entries.filter(entry=>entry.status==='add').map(entry=>entry.targetPath);
        this.zipStatus=this.$t('info.syncPlanReady');
      } catch(error) {if(this.session_current(generation)){this.zipStatus=this.$t(controller.signal.aborted?'info.syncCancelled':'info.syncFailed');if(!controller.signal.aborted)this.show_transfer_error(error);}}
      finally {if(this._zipController===controller)this._zipController=null;if(generation===this.sessionGeneration){this.workflowCancelling=false;this.zipBusy=false;this.set_transfer(null);}}
    },
    async run_zip() {
      if (!this.connected || this.busy || !this.zipPlan || !this.zipSelected.length) return;
      const generation=this.sessionGeneration, deviceKey=pixl.get_device_key?.(), plan=this.zipPlan, selectedPaths=this.zipSelected.slice();
      if(generation!==this._zipGeneration || !deviceKey || deviceKey!==this._zipDeviceKey){this.invalidate_zip();this.show_transfer_error(new Error(this.$t('info.syncIdentity')));return;}
      const changes=plan.entries.filter(entry=>selectedPaths.includes(entry.targetPath)&&entry.status==='change').length;
      try {await this.ask_dialog(()=>this.$confirm(this.$t('workflow.confirm',{count:selectedPaths.length,changes,root:plan.rootPath}),this.$t('workflow.zipTitle'),this.confirm_options()));}
      catch(error){this.show_transfer_error(error);return;}
      if(!this.session_current(generation)||plan!==this.zipPlan)return;
      const controller=new AbortController();this.workflowCancelling=false; this._zipController=controller;this.zipBusy=true;this.zipStatus=this.$t('workflow.importing');
      try {
        const result=await executeZipImport({plan,deviceKey,selectedPaths,...this.transfer_adapters(generation),signal:controller.signal,
          onProgress:progress=>{if(this.session_current(generation))this.show_zip_progress(progress);}});
        this.assert_session(generation);this.remember_recovery(result);
        this.zipStatus=this.$t('workflow.done',{count:result.completed});
        this.remember_transfer('sync','success',plan.entries.filter(e=>selectedPaths.includes(e.targetPath)).reduce((sum,e)=>sum+(e.size||0),0),true);
        return result;
      } catch(error) {
        this.remember_recovery(error);if(error.importProgress)this.remember_recovery(error.importProgress);
        if(error.importProgress?.attemptedFolders?.length) {
          this.recoveryNotes.push(JSON.stringify({folderAttempts:error.importProgress.attemptedFolders},null,2));
          this.recoveryNotes=this.recoveryNotes.slice(-20);
        }
        if(this.session_current(generation)){
          this.zipStatus=this.$t('workflow.partial',{count:error.importProgress?.completedPaths?.length||0});
          this.remember_transfer('sync',controller.signal.aborted?'cancelled':'failed',0);
          if(!controller.signal.aborted)this.show_transfer_error(error);
        }
      } finally {
        if(this._zipController===controller)this._zipController=null;
        if(generation===this.sessionGeneration){this.workflowCancelling=false;this.zipBusy=false;this.zipPlan=null;this.zipSelected=[];this.set_transfer(null);await this.refresh_current();}
      }
    },
    open_sync() {
      if (this.btn_disabled() || this.upload_diag_visible) return;
      this.invalidate_sync(); this.syncRoot = this.current_dir; this.syncDialog = true;
    },
    invalidate_sync() {
      this.workflowCancelling = false; this._syncController?.abort(); this._syncController = null; this._syncFiles = [];
      this._syncGeneration = null; this._syncDeviceKey = null;
      this.syncDialog = false; this.syncing = false; this.syncFileCount = 0;
      this.syncPlan = null; this.syncSelected = []; this.syncStatus = ''; this.syncPage=1;
    },
    on_sync_files(event) {
      if (!this.connected || !this.syncDialog || this.busy) return;
      const files = Array.from(event.target.files || []); event.target.value = '';
      if (files.length > 4096) { this.show_transfer_error(new Error(this.$t('info.syncTooMany'))); event.target.value = ''; return; }
      this._syncFiles = files; this.syncFileCount = files.length;
      this.syncPlan = null; this.syncSelected = []; this.syncStatus = ''; this.syncPage=1;
    },
    async build_sync_plan() {
      if (!this.connected || this.busy || !this.syncFileCount) return;
      const generation = this.sessionGeneration, deviceKey = pixl.get_device_key?.();
      if (!deviceKey) { this.show_transfer_error(new Error(this.$t('info.syncIdentity'))); return; }
      const controller = new AbortController(); this.workflowCancelling=false; this._syncController = controller; this.syncing = true;
      this.syncStatus = ''; this.syncPlan = null; this.syncSelected = [];
      try {
        const adapters = this.transfer_adapters(generation);
        const plan = await createSyncPlan({rootPath:this.syncRoot, files:this._syncFiles, deviceKey,
          ...adapters, signal:controller.signal, onProgress:progress => {
            if (this.session_current(generation)) this.show_sync_progress(progress);
          }});
        this.assert_session(generation);
        this._syncGeneration = generation; this._syncDeviceKey = deviceKey; this.syncPlan = plan;
        this.syncPage=1; this.syncSelected = plan.entries.filter(entry=>entry.status==='add').map(entry=>entry.targetPath);
        this.syncStatus = this.$t('info.syncPlanReady');
      } catch(error) {
        if (this.session_current(generation)) {
          this.syncStatus = this.$t(controller.signal.aborted ? 'info.syncCancelled' : 'info.syncFailed');
          if (!controller.signal.aborted) this.show_transfer_error(error);
        }
      } finally {
        if (this._syncController === controller) this._syncController = null;
        if (generation === this.sessionGeneration) { this.workflowCancelling=false; this.syncing = false; this.set_transfer(null); }
      }
    },
    async run_sync() {
      if (!this.connected || this.busy || !this.syncPlan || !this.syncSelected.length) return;
      const generation = this.sessionGeneration, deviceKey = pixl.get_device_key?.();
      if (generation !== this._syncGeneration || !deviceKey || deviceKey !== this._syncDeviceKey) {
        this.invalidate_sync(); this.show_transfer_error(new Error(this.$t('info.syncIdentity'))); return;
      }
      const plan = this.syncPlan, selectedPaths = this.syncSelected.slice();
      try { await this.ask_dialog(()=>this.$confirm(this.$t('info.syncConfirm',{count:selectedPaths.length}),this.$t('info.syncOpen'),this.confirm_options())); }
      catch(error) { this.show_transfer_error(error); return; }
      if (!this.session_current(generation) || plan !== this.syncPlan) return;
      const controller = new AbortController(); this.workflowCancelling=false; this._syncController = controller; this.syncing = true;
      this.syncStatus = ''; const adapters = this.transfer_adapters(generation);
      try {
        const job = createSyncJob(plan);
        const result = await executeSyncJob({job,plan,files:this._syncFiles,deviceKey,selectedPaths,
          ...adapters, signal:controller.signal,
          uploadFile: async options => {
            try {
              const receipt = await safeUpload({...options,...adapters,signal:controller.signal,
                getFreeBytes:()=>adapters.getFreeBytes(options.path)});
              this.remember_recovery(receipt); return receipt;
            } catch(error) { this.remember_recovery(error); throw error; }
          },
          onProgress:progress=>{if(this.session_current(generation))this.show_sync_progress(progress);}
        });
        this.assert_session(generation);
        this.syncStatus = this.$t('info.syncDone');
        const bytes=plan.entries.filter(entry=>selectedPaths.includes(entry.targetPath)).reduce((sum,entry)=>sum+entry.size,0);
        this.remember_transfer('sync','success',bytes,true); return result;
      } catch(error) {
        if (this.session_current(generation)) {
          this.syncStatus=this.$t(controller.signal.aborted?'info.syncCancelled':'info.syncFailed');
          this.remember_transfer('sync',controller.signal.aborted?'cancelled':'failed',this.transfer?.done||0);
          if (!controller.signal.aborted) this.show_transfer_error(error);
        }
      } finally {
        if(this._syncController===controller)this._syncController=null;
        if(generation===this.sessionGeneration){this.workflowCancelling=false;this.syncing=false;this.syncPlan=null;this.syncSelected=[];this.set_transfer(null);await this.refresh_current();}
      }
    },
    cancel_sync() { this.workflowCancelling=true; this._syncController?.abort(); this.syncStatus=this.$t('info.finishingCommit'); },
    close_sync(done) { if(this.syncing){this.cancel_sync();return;} this.invalidate_sync(); done?.(); },
    async read_drive_info(generation) {
      this.assert_session(generation);
      const drives = normalizeDrives(this.checked(await proto.vfs_get_drive_list()));
      this.assert_session(generation); this.driveInfo = drives;
      return drives;
    },
    async refresh_device_info() {
      if (!this.connected || this.busy || this.upload_diag_visible) return;
      this.fullDiagnosticSnapshot=null; this.driveInfo=[];
      const generation = this.sessionGeneration; this.infoLoading = true;
      try { await this.read_drive_info(generation); this.refresh_local_metrics(); }
      catch (error) { if (this.session_current(generation)) this.show_transfer_error(error); }
      finally { if (generation === this.sessionGeneration) this.infoLoading = false; }
    },
    async refresh_runtime_info() {
      if (!this.connected || this.busy || this.upload_diag_visible) return;
      this.fullDiagnosticSnapshot=null;
      const generation=this.sessionGeneration; this.infoLoading=true;
      this.runtimeInfo=null; this.runtimeState='loading';
      try {
        const data=await proto.get_runtime_diagnostics?.(); this.assert_session(generation);
        if (data == null) { this.runtimeState='unavailable'; return; }
        const normalized=normalizeRuntimeDiagnostics(data);
        if (!normalized) throw new Error(this.$t('info.runtimeFailed'));
        this.runtimeInfo=normalized; this.runtimeState='available';
      } catch(error) {
        if(this.session_current(generation)) { this.runtimeState='failed'; this.show_transfer_error(error); }
      }
      finally {if(generation===this.sessionGeneration)this.infoLoading=false;}
    },
    async refresh_boot_info() {
      if (!this.connected || this.busy || this.upload_diag_visible) return;
      this.fullDiagnosticSnapshot=null;
      const generation=this.sessionGeneration; this.infoLoading=true;
      this.bootInfo=null; this.bootState='loading'; this.lastDfuReference='';
      try {
        const data=await proto.get_boot_diagnostics?.(); this.assert_session(generation);
        if (data == null) { this.bootState='unavailable'; return; }
        const normalized=normalizeBootDiagnostics(data);
        if (!normalized) throw new Error(this.$t('info.bootFailed'));
        this.bootInfo=normalized; this.bootState='available'; this.lastDfuReference=dfuReference(normalized);
      } catch(error) {
        if(this.session_current(generation)) { this.bootState='failed'; this.show_transfer_error(error); }
      } finally {if(generation===this.sessionGeneration)this.infoLoading=false;}
    },
    async refresh_power_info() {
      if (!this.connected || this.busy || this.upload_diag_visible) return;
      this.fullDiagnosticSnapshot=null;
      const generation=this.sessionGeneration; this.infoLoading=true;
      this.powerInfo=null; this.powerState='loading';
      try {
        const data=await proto.get_power_diagnostics?.(); this.assert_session(generation);
        if(data == null) { this.powerState='unavailable'; return; }
        const normalized=normalizePowerDiagnostics(data);
        if(!normalized) throw new Error(this.$t('workflow.powerFailed'));
        this.powerInfo=normalized; this.powerState='available';
      } catch(error) {
        if(this.session_current(generation)) { this.powerState='failed'; this.show_transfer_error(error); }
      } finally { if(generation===this.sessionGeneration) this.infoLoading=false; }
    },
    format_hex(value) { return formatHexWord(value) ?? this.$t('info.unknown'); },
    format_optional_size(value) { return value === null || value === undefined ? this.$t('info.unknown') : this.format_size(value); },
    async read_all_diagnostics() {
      if (!this.connected || this.busy || this.upload_diag_visible || this.diagnosticsBusy) return;
      const generation=this.sessionGeneration;
      this.fullDiagnosticBusy = true;
      this.fullDiagnosticSnapshot = null;
      this.fullDiagnosticInterrupted = false;
      const startedAt = performance.now();
      this.readClock = startedAt;
      this.fullDiagnosticProgress = { completed: 0, total: DIAGNOSTIC_SECTION_KEYS.length, startedAt, updatedAt: startedAt, sections: {} };
      this.runtimeInfo=null; this.runtimeState='loading'; this.bootInfo=null; this.bootState='loading'; this.lastDfuReference='';
      this.powerInfo=null; this.powerState='loading'; this.driveInfo=[];
      const guard=()=>this.session_current(generation) && !this.disconnecting;
      const read=fn=>async()=>{
        this.assert_session(generation);
        try { const value=await fn(); this.assert_session(generation); return value; }
        catch(error) {
          const code=error?.code || proto.get_transport_diagnostics?.()?.lastErrorCode || 'DIAGNOSTIC_FAILED';
          throw Object.assign(new Error('Diagnostic read failed.'), {code});
        }
      };
      try {
        const snapshot=await collectDiagnosticSnapshot({isCurrent:guard,
          readers:{
            runtime:read(()=>proto.get_runtime_diagnostics?.()), boot:read(()=>proto.get_boot_diagnostics?.()),
            power:read(()=>proto.get_power_diagnostics?.()), startup:read(()=>proto.get_startup_diagnostics?.(this.firmwareVersion)),
            drives:read(async()=>normalizeDrives(this.checked(await proto.vfs_get_drive_list()))),
            storage:read(async()=>{
              const response=await proto.vfs_storage_info_extended('E'); this.assert_session(generation);
              if(response?.status===255) return null;
              const info=this.checked(response);
              let layout=null;
              if(info.backend===3) {
                const result=await proto.vfs_storage_layout('E'); this.assert_session(generation);
                if(result?.status!==255) layout=this.checked(result);
              }
              return {info,layout};
            }),
            mtu:read(()=>proto.get_mtu_diagnostics?.()), ui:read(()=>proto.get_ui_diagnostics?.())
          },
          onProgress: ({ key, index, section }) => {
            if (!guard()) return;
            const progress = this.fullDiagnosticProgress;
            this.fullDiagnosticProgress = { ...progress, completed: index, updatedAt: performance.now(), sections: { ...progress.sections, [key]: section } };
          }
        });
        this.assert_session(generation); this.fullDiagnosticSnapshot=snapshot;
        for(const key of ['runtime','boot','power']) {
          this[key+'Info']=snapshot.sections[key].data; this[key+'State']=snapshot.sections[key].state;
        }
        this.lastDfuReference=dfuReference(this.bootInfo);
        this.driveInfo=snapshot.sections.drives.data || []; this.refresh_local_metrics();
      } catch(error) {
        if(guard()) {
          this.fullDiagnosticInterrupted = true;
          this.runtimeState='failed'; this.bootState='failed'; this.powerState='failed';
          this.show_transfer_error(error);
        }
      } finally {
        if(generation===this.sessionGeneration) {this.fullDiagnosticBusy=false;this.fullDiagnosticProgress=null;}
      }
    },
    save_diagnostics() {
      if (this.diagnosticsBusy || this.fullDiagnosticBusy) return;
      this.refresh_local_metrics();
      const baseReport = createDiagnostics({ firmwareVersion: this.firmwareVersion, connected: this.connected,
        browser: { secureContext: window.isSecureContext, webBluetooth: typeof navigator !== 'undefined' && !!navigator.bluetooth },
        transport: this.transportInfo, drives: this.driveInfo, history: this.transferHistory, runtime:this.runtimeInfo, boot:this.bootInfo, power:this.powerInfo });
      const report=this.fullDiagnosticSnapshot ? createCombinedDiagnosticReport({baseReport,snapshot:this.fullDiagnosticSnapshot}) : baseReport;
      this.diagnosticsJson = JSON.stringify(report, null, 2) + '\n';
      this.diagnosticsFilename = 'Allmiibo-Diagnose-3.43.0-rc.1.json';
      this.diagnosticsStatus = 'info.diagnosticReady';
      this.diagnosticsDialog = true;
    },
    async save_diagnostic_file() {
      if (this.diagnosticsBusy || !this.diagnosticsJson) return;
      this.diagnosticsSaving = true; this.diagnosticsStatus = 'info.diagnosticSaving';
      try {
        // Calling the helper before any await retains this explicit click's
        // activation. Unsupported/cancelled never trigger a hidden download.
        const result = await saveBlobWithPicker(new Blob([this.diagnosticsJson], {type:'application/json'}), this.diagnosticsFilename,
          {types:[{description:this.$t('info.diagnosticJsonFile'),accept:{'application/json':['.json']}}]});
        this.diagnosticsStatus = result?.status === 'saved' ? 'info.diagnosticSaved'
          : result?.status === 'cancelled' ? 'info.diagnosticCancelled'
          : result?.status === 'unsupported' ? 'info.diagnosticPickerUnavailable' : 'info.diagnosticSaveFailed';
      } catch (_) { this.diagnosticsStatus = 'info.diagnosticSaveFailed'; }
      finally { this.diagnosticsSaving = false; }
    },
    select_diagnostic_text() {
      const field = this.$refs.diagnosticsText;
      if (typeof field?.select !== 'function') return false;
      try { field.focus?.(); field.select(); return true; }
      catch (_) { return false; }
    },
    select_diagnostics() {
      if (this.diagnosticsBusy || !this.diagnosticsJson) return;
      this.diagnosticsStatus = this.select_diagnostic_text() ? 'info.diagnosticSelected' : 'info.diagnosticCopyFailed';
    },
    async copy_diagnostics() {
      if (this.diagnosticsBusy || !this.diagnosticsJson) return;
      this.diagnosticsCopying = true;
      try {
        if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(this.diagnosticsJson);
        this.diagnosticsStatus = 'info.diagnosticCopied';
      } catch (_) {
        this.diagnosticsStatus = this.select_diagnostic_text() ? 'info.diagnosticSelected' : 'info.diagnosticCopyFailed';
      } finally { this.diagnosticsCopying = false; }
    },
    download_diagnostics() {
      if (this.diagnosticsBusy || !this.diagnosticsJson) return;
      try {
        saveBlob(new Blob([this.diagnosticsJson], {type:'application/json'}), this.diagnosticsFilename);
        this.diagnosticsStatus = 'info.diagnosticDownloadRequested';
      } catch (_) { this.diagnosticsStatus = 'info.diagnosticDownloadFailed'; }
    },
    save_last_download() {
      if (!this.lastDownload) return;
      try { saveBlob(this.lastDownload.blob, this.lastDownload.filename); }
      catch (error) { this.show_transfer_error(error); }
    },
    toggle_preview() {
      if (this.connected || this.connecting || this.busy) return;
      this.close_preview_selection();
      this.demoMode = !this.demoMode;
      this.current_dir = '';
      this.tableData = this.demoMode ? Array.from({ length: 245 }, (_, index) => ({
        name: (index % 25 === 0 ? 'Demo-Ordner-' : 'Demo-Datei-') + String(index + 1).padStart(3, '0') + (index % 25 === 0 ? '' : '.bin'),
        type: index % 25 === 0 ? 'DIR' : 'REG', sizeBytes: index % 25 === 0 ? 0 : 540,
        size: index % 25 === 0 ? '' : '540 B', notes: this.$t('tools.previewData')
      })) : [];
      if(this.demoMode){
        // Public catalogue identities only, never fabricated tag bytes.
        const examples=[{name:'Mario',head:0,tail:2},{name:'Link',head:0x01000000,tail:0x00040002}];
        for(let i=0;i<examples.length;i++)this.tableData[i+1]={name:`0${i+1}-Demo-${examples[i].name}.bin`,type:'REG',sizeBytes:540,size:'540 B',notes:this.$t('tools.previewData'),demoFigure:true,metadataValid:true,flags:{},amiibo:{head:examples[i].head,tail:examples[i].tail}};
      }
      this.on_filter_change();
    },
    on_filter_change() { this.page = 1; this.table_selection = []; this.$refs.multipleTable?.clearSelection(); },
    reset_filters() { this.searchQuery=''; this.typeFilter='all'; this.on_filter_change(); },
    on_sort_change({ prop, order }) {
      this.sortKey = ['name', 'size', 'type', 'notes'].includes(prop) ? prop : 'name';
      this.sortOrder = order === 'descending' ? order : 'ascending'; this.on_filter_change();
    },
    change_page(page) {
      if (this.busy) return;
      this.on_filter_change(); this.page = Math.max(1, Math.min(page, this.pageCount));
    },
    async ask_dialog(action) {
      const generation = this.sessionGeneration;
      if (this.dialogPending) throw new Error(this.$t('transfer.busy'));
      this.dialogPending = true;
      try { return await action(); }
      finally { if (generation === this.sessionGeneration) this.dialogPending = false; }
    },
    assert_session(generation) { if (!this.session_current(generation)) throw new Error(this.$t('tools.sessionChanged')); },
    read_device_file(path, options = {}) {
      return new Promise((resolve, reject) => {
        try { proto.vfs_helper_read_file(path, resolve, reject, undefined, options); }
        catch (error) { reject(error); }
      });
    },
    refresh_backup_checkpoint() {
      this.backupResumeInfo = this._backupCheckpoint?.summary() || null;
    },
    stored_backup_problem(error) {
      return ({ STORED_BACKUP_QUOTA:'storeQuota', STORED_BACKUP_CHANGED:'storeChanged', STORED_BACKUP_BUSY:'storeBusy',
        BACKUP_CHECKPOINT_IDENTITY:'storeReconnect', STORED_BACKUP_CORRUPT:'storeInvalid' })[error?.code] || 'storeUnavailable';
    },
    async refresh_stored_backup(keepError = false) {
      this.storedBusy = true;
      try {
        const {inspectStoredBackup} = await import('./lib/stored-backup.js');
        this.storedHead = await inspectStoredBackup();
        if (!keepError) this.storedError = '';
      } catch (error) { this.storedHead = null; this.storedError = this.stored_backup_problem(error); }
      finally { this.storedBusy = false; }
    },
    async toggle_stored_backup(enabled, userGesture = true) {
      this.storeBackup = enabled;
      this.storedError = ''; this.persistStatus = '';
      try { if (userGesture) this.storage()?.setItem('allmiibo-folder-checkpoint-enabled', enabled ? '1' : '0'); } catch { /* optional preference */ }
      if (!enabled) { this.storedHead = null; return; }
      this.storedBusy = true;
      try {
        const policy = navigator.storage;
        if (policy?.persisted && await policy.persisted()) this.persistStatus = 'storeGranted';
        else if (userGesture && policy?.persist) this.persistStatus = await policy.persist() ? 'storeGranted' : 'storeNotGranted';
        else this.persistStatus = policy?.persisted ? 'storeNotGranted' : 'storePolicyUnknown';
      } catch { this.persistStatus = 'storePolicyUnknown'; }
      await this.refresh_stored_backup();
    },
    async discard_stored_backup() {
      if (!this.storedHead || this.busy || this.storedBusy) return;
      const expected = this.storedHead;
      try { await this.ask_dialog(() => this.$confirm(this.$t('workflow.storeDiscardConfirm'), this.$t('workflow.discard'), this.confirm_options())); }
      catch { return; }
      this.storedBusy = true; this.storedError = '';
      try {
        const {discardStoredBackup} = await import('./lib/stored-backup.js');
        await discardStoredBackup(expected);
      } catch (error) { this.storedError = this.stored_backup_problem(error); }
      await this.refresh_stored_backup(true);
    },
    discard_backup_checkpoint() {
      if (this.busy || this.backupResumeInfo?.busy) return;
      this._backupCheckpoint?.clear(); this._backupCheckpoint = null; this.backupResumeInfo = null;
    },
    async open_backup_drive(label) {
      if (!this.connected || this.current_dir || this.busy || this.disconnecting || this.upload_diag_visible ||
          !this.availableBackupDrives.some(drive => drive.label === label)) return;
      const generation = this.sessionGeneration, root = label + ':/';
      this.reset_filters();
      this.current_dir = root;
      await this.reload_folder();
      if (this.session_current(generation) && this.current_dir === root && this.listingError) {
        // A successful drive refresh must not erase the failed folder opening.
        this.backupDriveOpenError = true;
        await this.reload_drive();
      }
    },
    async on_backup(resume = false) {
      if (!this.connected || this.busy || this.disconnecting || this.upload_diag_visible) return;
      const persistent = this.storeBackup && resume !== true;
      if (persistent && (this.storedBusy || (resume === 'stored' ? !this.storedBackupMatches : !!this.storedHead || !!this.storedError))) return;
      const expected = resume === 'stored' ? this.storedHead : null;
      const rootPath = resume === true ? this.backupResumeInfo?.rootPath : this.current_dir;
      if (!rootPath) return;
      const generation = this.sessionGeneration;
      if (this.backupResumeInfo?.busy) return;
      const deviceKey = pixl.get_device_key?.();
      if (!deviceKey) { this.show_transfer_error(new Error(this.$t('info.syncIdentity'))); return; }
      if (!persistent && resume !== true) {
        if (this.backupResumeInfo?.files) {
          try { await this.ask_dialog(() => this.$confirm(this.$t('workflow.discardConfirm'), this.$t('tools.backup'), this.confirm_options())); }
          catch(error) { this.show_transfer_error(error); return; }
          if (!this.session_current(generation)) return;
        }
        this.discard_backup_checkpoint();
        this._backupCheckpoint = createBackupCheckpoint({rootPath,deviceKey,firmwareVersion:this.firmwareVersion,preserveLegacyNames:true});
      } else if (!persistent && !this._backupCheckpoint) return;
      const checkpointState = persistent ? undefined : this._backupCheckpoint;
      if (persistent) this.storedError = '';
      // A previous ZIP remains downloadable if this attempt is interrupted.
      if (this.lastBackup) this.lastBackup.sessionGeneration = null;
      this.backingUp = true; this.cancellingBackup = false;
      const controller = new AbortController(); this._backupController = controller;
      this.set_transfer({ phase: 'listing', path: rootPath, done: 0, total: null });
      try {
        const context = {rootPath, deviceKey, firmwareVersion:this.firmwareVersion, preserveLegacyNames:true};
        const run = storedBackup => createBackup({ ...context, checkpointState, storedBackup, signal: controller.signal,
          readDirectory: async path => {
            this.assert_session(generation);
            const entries = this.checked(await proto.vfs_read_folder(path));
            this.assert_session(generation); return entries;
          },
          readFileDigest: async (path, size) => {
            this.assert_session(generation);
            const digest = await proto.vfs_backup_digest(path, size, this.firmwareVersion);
            this.assert_session(generation); return digest;
          },
          readFile: async (path, options) => {
            this.assert_session(generation);
            const bytes = await this.read_device_file(path, { max_bytes: options.maxBytes, progress_cb: options.onProgress });
            this.assert_session(generation); return bytes;
          },
          onProgress: progress => {
            if (this.session_current(generation)) { this.set_transfer({ phase: progress.phase, path: progress.path, done: progress.bytesDone, total: progress.phase === 'reading' || progress.phase === 'complete' ? progress.bytesTotal : null, complete: progress.phase === 'complete',
              timing:progress.timing, foldersListed:progress.foldersListed,
              filesDone:Number.isSafeInteger(progress.filesDone)?progress.filesDone:null,filesTotal:Number.isSafeInteger(progress.filesTotal)?progress.filesTotal:null }); this.refresh_backup_checkpoint(); }
          }
        });
        const result = persistent ? await (await import('./lib/stored-backup.js')).withStoredBackup(context, expected, run) : await run();
        this.assert_session(generation); this.lastBackup = { ...result, sessionGeneration: generation };
        if (result.storedCompletionError) this.storedError = this.stored_backup_problem(result.storedCompletionError);
        this.remember_transfer('backup', 'success', result.manifest.bytes || 0);
        // Keep the archive in memory until the user's explicit Save click.
        // This preserves browser activation and allows a cancelled save to retry.
        this.$message({ type: 'success', message: this.$t('tools.backupReady', { files: result.manifest.files }) });
      } catch (error) {
        if (this.session_current(generation)) {
          this.remember_transfer('backup', controller.signal.aborted ? 'cancelled' : 'failed', this.transfer?.done || 0);
          if (!controller.signal.aborted) {
            if (persistent && (error?.code?.startsWith('STORED_BACKUP_') || error?.code === 'BACKUP_CHECKPOINT_IDENTITY')) this.storedError = this.stored_backup_problem(error);
            else this.show_transfer_error(error);
          }
        }
      } finally {
        if (this._backupController === controller) this._backupController = null;
        if (persistent) await this.refresh_stored_backup(true);
        else if (this._backupCheckpoint === checkpointState) this.refresh_backup_checkpoint();
        if (generation === this.sessionGeneration) { this.backingUp = false; this.cancellingBackup = false; this.set_transfer(null); }
      }
    },
    save_last_backup() {
      if (!this.lastBackup) return;
      try { saveBlob(this.lastBackup.blob, this.lastBackup.filename); }
      catch (error) { this.show_transfer_error(error); }
    },
    cancel_transfer() {
      if (this.zipBusy) { this.workflowCancelling=true; this.zipStatus=this.$t('info.finishingCommit'); this._zipController?.abort(); }
      else if (this.syncing) this.cancel_sync();
      else if (this.backingUp) { this.cancellingBackup = true; this._backupController?.abort(); }
      else if (this.pendingUploads && this.safeUploads) {
        this.cancellingUploads = true; this._cancelUploadGeneration = this.sessionGeneration;
        this._uploadController?.abort();
      }
      else if (this.pendingUploads || this.pendingDownloads) {
        this._disconnectIntent = { generation: this.sessionGeneration, reason: 'cancelled' };
        pixl.disconnect({ immediate: true });
      }
    },
    on_before_unload(event) { if (this.busy || this.backupResumeInfo?.files) { event.preventDefault(); event.returnValue = ''; } },
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
      const known = { SYNC_STALE:'syncStale', SYNC_LOCAL_CHANGED:'syncLocalChanged', SYNC_COLLISION:'syncCollision', NAME_PORTABLE:'namePortable', NAME_NORMALIZATION:'nameNormalization', NAME_LIMIT:'nameLimit', PATH_LIMIT:'pathLimit', UPLOAD_PARENT:'uploadParent', UPLOAD_READONLY:'READONLY', BACKUP_CHECKPOINT_IDENTITY:'checkpointIdentity', BACKUP_CHECKPOINT_BUSY:'checkpointBusy', ZIP_STALE:'zipStale', ZIP_CHANGED:'zipStale', ZIP_LIMIT:'zipLimit', ZIP_CRC:'zipIntegrity', ZIP_HASH:'zipIntegrity', ZIP_STRUCTURE:'zipIntegrity', ZIP_FORMAT:'zipIntegrity', ZIP_MANIFEST:'zipIntegrity', ZIP_PATH:'zipPath', ZIP_COLLISION:'zipPath' };
      const message = Object.hasOwn(known, error?.code) ? this.$t('workflow.' + known[error.code], error.details || {}) : error?.message || String(error);
      this.$message({ type: 'error', message });
    },
    on_remote_file_handoff(session) {
      if (this.connected || this.connecting || this.disconnecting || this.busy) throw new Error('File connection is busy');
      if (this.demoMode) this.toggle_preview();
      const accepted = pixl.adopt_remote_connection(session);
      if (accepted) this.show_workspace('files');
      return accepted;
    },
    on_btn_ble_connect() {
      if (this.remoteActive) return;
      if (this.disconnecting) return;
      if (this.connectionDisconnectLocked) { this.cancel_transfer(); return; }
      if (this.connected || this.connecting) {
        // Keep idle user disconnection distinct from interrupting device work.
        this._disconnectIntent = { generation: this.sessionGeneration, reason: this.busy ? 'cancelled' : 'user-disconnect' };
        pixl.disconnect();
      }
      else {
        this.collectionObservation=null;
        if (this.demoMode) this.toggle_preview();
        this.connecting = true; this.connBtnText = this.$t('conn.connecting'); pixl.connect();
      }
    },
    async on_ble_connected() {
      this.backupDriveOpenError = false;
      this.collectionObservation=null;this.collectionReport=null;this.collectionStale=false;
      this.powerInfo=null; this.powerState='unknown';
      this.fullDiagnosticSnapshot=null;this.fullDiagnosticBusy=false;this.fullDiagnosticProgress=null;this.fullDiagnosticInterrupted=false;
      this.disconnecting = false;
      this.reset_figure_info(); this.meta_diag_visible = false;
      this.clear_dfu_attempt(); this.clear_migration_restart(); this._disconnectIntent = null;
      this.runtimeInfo=null; this.runtimeState='unknown';
      this.bootInfo=null; this.bootState='unknown';
      const generation = ++this.sessionGeneration;
      this.driveInfo = []; this.transferHistory = []; this.infoLoading = false;
      this.lastDfuReference = '';
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
      if(this.collectionStale || this.collectionWriting || this.mutating || this.pendingUploads>0 || this.syncing || this.zipBusy || this.migrationBusy)this.collectionObservation=null;
      this.previewSelection=null;this.previewBusy=false;++this.previewSerial;
      this.searchBusy=false;this.collectionBusy=false;this.collectionWriting=false;this.collectionReport=null;this.collectionStale=false;
      this.powerInfo=null; this.powerState='unknown';
      this.fullDiagnosticSnapshot=null;this.fullDiagnosticBusy=false;this.fullDiagnosticProgress=null;this.fullDiagnosticInterrupted=false;
      this.disconnecting = pixl.get_connection_state?.() === 'disconnecting';
      this.reset_figure_info();
      const expectedDfu = this._disconnectIntent?.generation === this.sessionGeneration && this._disconnectIntent.reason === 'dfu';
      const expectedMigrationRestart = this._disconnectIntent?.generation === this.sessionGeneration && this._disconnectIntent.reason === 'migration-restart';
      const expectedIdleDisconnect = this._disconnectIntent?.generation === this.sessionGeneration && this._disconnectIntent.reason === 'user-disconnect';
      this.remember_interruption(); this.clear_dfu_attempt(); this.clear_migration_restart(); this._disconnectIntent = null;
      this.runtimeInfo=null; this.runtimeState='unknown';
      this.bootInfo=null; this.bootState='unknown';
      ++this.sessionGeneration; ++this.listingGeneration;
      this.driveInfo = []; this.infoLoading = false;
      Promise.resolve().then(() => this.refresh_local_metrics());
      this._uploadTail = Promise.resolve();
      this._backupController?.abort();
      this._uploadController?.abort(); this._uploadController = null; this.cancellingUploads = false;
      this.invalidate_sync(); this.invalidate_zip(); this.refresh_backup_checkpoint();
      this.backingUp = false; this.cancellingBackup = false; this.dialogPending = false; this.set_transfer(null);
      this.pendingUploads = 0; this.pendingDownloads = 0; this.upload_diag_visible = false;
      this.connecting = false; this.connected = false; this.mutating = false;
      this.meta_diag_visible = false; this.table_selection = []; this.firmwareVersion = "";
      this.connBtnType = "";
      this.connected = false;
      this.connBtnText = this.$t(this.disconnecting ? 'info.disconnecting' : 'conn.connect');
      this.version = "";
      this.table_loading = false; this.listingError = false; this.backupDriveOpenError = false;
      this.tableData = [];
      this.current_dir = "";
      this.$notify({
        title: 'Pixl.js',
        type: expectedDfu || expectedMigrationRestart || expectedIdleDisconnect ? 'info' : 'error',
        message: this.$t(expectedDfu ? 'info.dfuDisconnected' : expectedMigrationRestart ? 'info.migrationRestartDisconnected' : 'conn.disconnected'),
        duration: 5000
      });


    },
    on_ble_disconnect_complete() {
      this.disconnecting = false;
      this.connBtnText = this.$t(this.connected ? 'conn.disconnect' : this.connecting ? 'conn.connecting' : 'conn.connect');
    },
    on_ble_connect_error(error) {
      this.collectionObservation=null;
      this.previewSelection=null;this.previewBusy=false;++this.previewSerial;
      this.searchBusy=false;this.collectionBusy=false;this.collectionWriting=false;this.collectionReport=null;this.collectionStale=false;
      this.powerInfo=null; this.powerState='unknown';
      this.fullDiagnosticSnapshot=null;this.fullDiagnosticBusy=false;this.fullDiagnosticProgress=null;this.fullDiagnosticInterrupted=false;
      this.disconnecting = pixl.get_connection_state?.() === 'disconnecting';
      this.reset_figure_info();
      this.remember_interruption(); this.clear_dfu_attempt(); this.clear_migration_restart(); this._disconnectIntent = null;
      this.runtimeInfo=null; this.runtimeState='unknown';
      this.bootInfo=null; this.bootState='unknown';
      ++this.sessionGeneration; ++this.listingGeneration;
      this.driveInfo = []; this.infoLoading = false;
      Promise.resolve().then(() => this.refresh_local_metrics());
      this._uploadTail = Promise.resolve();
      this._backupController?.abort();
      this._uploadController?.abort(); this._uploadController = null; this.cancellingUploads = false;
      this.invalidate_sync(); this.invalidate_zip(); this.refresh_backup_checkpoint();
      this.backingUp = false; this.cancellingBackup = false; this.dialogPending = false; this.set_transfer(null);
      this.pendingUploads = 0; this.pendingDownloads = 0; this.upload_diag_visible = false;
      this.connecting = false; this.connected = false; this.mutating = false;
      this.meta_diag_visible = false; this.table_selection = []; this.firmwareVersion = "";
      this.connBtnType = "";
      this.connBtnText = this.$t(this.disconnecting ? 'info.disconnecting' : 'conn.connect');
      this.version = "";
      this.table_loading = false; this.listingError = false; this.backupDriveOpenError = false;
      this.tableData = [];
      this.current_dir = "";
      this.$notify({
        title: 'Pixl.js',
        type: 'error',
        message: this.$t(error?.code === 'CONNECT_TIMEOUT' ? 'info.connectTimeout' : 'conn.connfailed'),
        duration: 5000
      });
    },

    async on_btn_enter_dfu() {
      if (!this.connected || this.busy) return;
      const generation = this.sessionGeneration;
      let attempt;
      try {
        await this.ask_dialog(() => this.$confirm(this.$t('dfumode.startconfirm'), this.$t('dfumode.title'), this.confirm_options()));
        if (!this.session_current(generation)) return;
        attempt = { generation, timer: null };
        this._dfuAttempt = attempt; this.enteringDfu = true;
        this._disconnectIntent = { generation, reason: 'dfu' };
        attempt.timer = setTimeout(() => {
          if (this._dfuAttempt !== attempt || !this.session_current(generation)) return;
          this.show_transfer_error(new Error(this.$t('info.dfuTimeout')));
          // End this transport before unlocking controls. A late acknowledgement
          // must not race with a new file operation or a replacement session.
          pixl.disconnect({ immediate: true }); this.clear_dfu_attempt(attempt);
        }, 15000);
        this.checked(await proto.enter_dfu());
        if (this._dfuAttempt !== attempt || !this.session_current(generation)) return;
        // The acknowledgement confirms the command, not a bootloader connection
        // or a completed firmware update. The bundled DFU page is a separate link.
        this.$message({ type: 'info', message: this.$t('dfumode.commandaccepted') });
      } catch (error) {
        if (generation !== this.sessionGeneration) return;
        this.clear_dfu_attempt(attempt);
        if (this._disconnectIntent?.generation === generation) this._disconnectIntent = null;
        this.show_transfer_error(error);
      }
    },

    on_btn_up() {
      if (this.btn_disabled()) return;
      this.reset_filters();
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
      if (!this.connected || this.busy) return;
      return this.refresh_current();
    },

    refresh_current() {
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
        const { value } = await this.ask_dialog(() => this.$prompt(this.$t('newfolder.message'), this.$t('newfolder.title'), { ...this.confirm_options(), inputValue: '' }));
        if (!value || !this.session_current(generation)) return;
        await this.mutate(async () => {
          await this.assert_new_entry_available(dir,value,generation);
          this.checked(await proto.vfs_create_folder(this.new_entry_path(dir, value)));
          if (this.session_current(generation)) await this.refresh_current();
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
        await this.ask_dialog(() => this.$confirm(this.$t('del.message') + rows.map(row => row.name).join(', ') + this.$t('del.messageend'), this.$t('del.title'), this.confirm_options()));
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
      const generation = this.sessionGeneration;
      try {
        if (this.pendingUploads > 0) {
          await this.$confirm(this.$t('upload.closemessage'), this.$t('upload.closetitle'), this.confirm_options());
          if (generation !== this.sessionGeneration) return;
          // The disconnect handler closes this session's upload dialog. Do not
          // touch its refs after disconnect: a new session may already exist.
          if (this.safeUploads) {
            this.cancel_transfer(); await this._uploadTail;
            if (generation !== this.sessionGeneration) return;
          } else { pixl.disconnect({ immediate: true }); return; }
        }
        if (generation !== this.sessionGeneration) return;
        this.$refs.upload?.clearFiles();
        done();
        if (this.connected) await this.refresh_current();
      } catch (error) { if (generation === this.sessionGeneration) this.show_transfer_error(error); }
    },

    on_upload_request(options) {
      if (!this.connected || !this.current_dir || this.searchBusy || this.enteringDfu || this.syncing || this.zipBusy || this.backingUp || this.pendingDownloads || this.mutating) return Promise.reject(new Error(this.$t('conn.disconnected')));
      const dir = this.current_dir, generation = this.sessionGeneration, safe = this.safeUploads, verify = safe || this.verifyUploads, replace = this.replaceUploads;
      let controller;
      let path;
      try { path = this.new_entry_path(dir, options.file.name); }
      catch (error) { return Promise.reject(error); }
      if (!Number.isSafeInteger(options.file.size) || options.file.size < 0 || options.file.size > 2 * 1024 * 1024) return Promise.reject(new Error(this.$t('upload.maxsize')));
      ++this.pendingUploads;
      const checkPreflight = () => {
        this.assert_session(generation);
        if (this._cancelUploadGeneration === generation || controller?.signal.aborted) throw Object.assign(new Error(this.$t('info.uploadCancelled')), {name:'AbortError'});
      };
      const run = async () => {
        checkPreflight();
        if (safe) { controller = new AbortController(); this._uploadController = controller; }
        // Refresh the destination before OPEN('w'): uploads in this same batch
        // can have introduced a new conflict since the displayed listing.
        const entries = this.checked(await proto.vfs_read_folder(dir));
        checkPreflight();
        const aliases = entries.filter(entry => portableNameKey(entry.name) === portableNameKey(options.file.name));
        if (aliases.length > 1 || aliases.some(entry => entry.name !== options.file.name)) throw new Error(this.$t('info.portableCollision'));
        const existing = aliases[0];
        if (existing) {
          if (existing.type !== 0) throw new Error(this.$t('tools.conflictDirectory', { name: options.file.name }));
          if (existing.meta?.valid === false) throw new Error(this.$t('properties.invalidmeta'));
          if (existing.meta?.flags?.readonly || (existing.meta?.flags?.raw & 4)) throw new Error(this.$t('info.readonlyTarget'));
          if (!replace) throw new Error(this.$t('tools.exists', { name: options.file.name }));
          await this.ask_dialog(() => this.$confirm(this.$t(safe ? 'info.safeReplaceWarning' : 'tools.replaceWarning', { name: options.file.name }), this.$t('upload.title'), this.confirm_options()));
          checkPreflight();
        }
        const drives = await this.read_drive_info(generation);
        checkPreflight();
        const destination = drives.find(drive => drive.label === dir[0]);
        if (!destination || destination.status !== 0) throw new Error(this.$t('info.driveUnavailable'));
        if (!uploadSpaceAvailable(destination, options.file.size, safe ? 0 : existing?.size || 0)) throw new Error(this.$t('info.notEnoughSpace'));
        if (safe) {
          const adapters = this.transfer_adapters(generation);
          const result = await safeUpload({path, file:options.file, replace:!!existing, ...adapters,
            getFreeBytes: () => adapters.getFreeBytes(path), signal:controller.signal,
            onProgress: progress => { if (this.session_current(generation)) this.show_safe_progress(progress, path, options.file.size, options.onProgress); }
          });
          this.remember_recovery(result); this.assert_session(generation);
          if (result.cancelledAfterCommit) this.$message({type:'info',message:this.$t('info.cancelledAfterCommit')});
          options.onProgress?.({percent:100});
          this.remember_transfer('upload','success',options.file.size,true);
          return {};
        }
        // Hash source bytes before touching the destination so local read or
        // unsupported crypto errors cannot truncate an existing device file.
        const sourceHash = verify ? await sha256(await options.file.arrayBuffer()) : null;
        this.assert_session(generation);
        const adapters = this.transfer_adapters(generation);
        if (!await writableDirectoryPath(dir, adapters.readDirectory, adapters.assertSession)) {
          throw Object.assign(new Error(this.$t('workflow.uploadParent')), { code: 'UPLOAD_PARENT' });
        }
        this.assert_session(generation);
        this.set_transfer({ phase: 'uploading', path, done: 0, total: options.file.size });
        await new Promise((resolve, reject) => {
          try { proto.vfs_helper_write_file(path, options.file, progress => {
            if (this.session_current(generation)) {
              this.set_transfer({ phase: 'uploading', path, done: progress.written_bytes, total: progress.total_bytes });
              options.onProgress?.({ percent: progress.total_bytes ? Math.min(99, progress.written_bytes / progress.total_bytes * 100) : 0 });
            }
          }, resolve, reject); } catch (error) { reject(error); }
        });
        this.assert_session(generation);
        if (verify) {
          this.set_transfer({ phase: 'verifying', path, done: 0, total: options.file.size });
          const bytes = await this.read_device_file(path, { max_bytes: options.file.size, progress_cb: progress => {
            if (this.session_current(generation)) this.set_transfer({ phase: 'verifying', path, done: progress.received_bytes, total: options.file.size });
          } });
          this.assert_session(generation);
          if (bytes.byteLength !== options.file.size || await sha256(bytes) !== sourceHash) throw new Error(this.$t('tools.verificationFailed'));
          this.assert_session(generation);
        }
        options.onProgress?.({ percent: 100 });
        this.remember_transfer('upload', 'success', options.file.size, verify);
        return {};
      };
      // FileReader and overwrite prompts belong to the same ordered queue as
      // the transfer. A rejected entry must not strand the next queued upload.
      const pending = (this._uploadTail || Promise.resolve()).then(run);
      this._uploadTail = pending.catch(() => {});
      return pending.catch(error => {
        this.remember_recovery(error);
        if (generation === this.sessionGeneration) this.remember_transfer('upload', error === 'cancel' || error === 'close' || error?.name === 'AbortError' ? 'cancelled' : 'failed', this.transfer?.done || 0);
        throw error;
      }).finally(() => {
        if (this._uploadController === controller) this._uploadController = null;
        if (generation === this.sessionGeneration) {
          --this.pendingUploads;
          if (!this.pendingUploads) { this.set_transfer(null); this.cancellingUploads = false; this._cancelUploadGeneration = null; }
        }
      });
    },

    on_upload_error(err, file, filelist) {
      if (err?.code === 'NAME_LIMIT' || err?.code === 'PATH_LIMIT') return this.show_transfer_error(err);
      this.$message({
        type: 'error',
        message: file.name + `${this.$t("upload.errupload")}` + err
      });
    },

    async on_row_btn_format(index, row) {
      const generation = this.sessionGeneration;
      try {
        await this.ask_dialog(() => this.$confirm(this.$t('format.messrow1a') + row.name + this.$t('format.messrow1b') + '\n' + this.$t('format.messrow2') + '\n' + this.$t('format.messrow3'), this.$t('format.title'), this.confirm_options()));
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
        await this.ask_dialog(() => this.$confirm(this.$t('del.message') + row.name + this.$t('del.messageend'), this.$t('del.title'), this.confirm_options()));
        if (!this.session_current(generation)) return;
        await this.mutate(async () => {
          this.checked(await proto.vfs_remove(path));
          if (this.session_current(generation)) await this.refresh_current();
        });
      } catch (error) { this.show_transfer_error(error); }
    },

    async on_row_btn_rename(index, row) {
      const dir = this.current_dir, path = this.append_segment(dir, row.name), generation = this.sessionGeneration;
      try {
        const { value } = await this.ask_dialog(() => this.$prompt(this.$t('rename.message'), this.$t('rename.title'), { ...this.confirm_options(), inputValue: row.name }));
        if (!value || value === row.name || !this.session_current(generation)) return;
        await this.mutate(async () => {
          await this.assert_new_entry_available(dir,value,generation,row.name);
          this.checked(await proto.vfs_rename(path, this.new_entry_path(dir, value)));
          if (this.session_current(generation)) await this.refresh_current();
        });
      } catch (error) { this.show_transfer_error(error); }
    },


    on_row_btn_meta(index, row) {
      if (row.metadataValid === false) {
        this.$message({ type: 'warning', message: this.$t('properties.invalidmeta') });
        return;
      }
      this.reset_figure_info();
      this.meta_form = { name: row.name, notes: row.notes || '', flags: { ...row.flags }, amiibo: { ...row.amiibo }, row,
        path: this.append_segment(this.current_dir, row.name) };
      this.meta_diag_visible = true;
    },

    reset_figure_info() {
      ++this.figureInfoGeneration;
      this.figureInspection = null; this.figureInfoState = 'idle';
    },

    async read_figure_info() {
      if (!this.connected || this.busy || !this.meta_diag_visible || !this.figureInfoSupported) return;
      const generation = this.sessionGeneration, dialog = ++this.figureInfoGeneration;
      const form = this.meta_form, path = form.path, size = form.row.sizeBytes;
      const current = () => this.session_current(generation) && this.meta_diag_visible &&
        this.figureInfoGeneration === dialog && this.meta_form === form && this.meta_form.path === path;
      this.figureInspection = null; this.figureInfoState = 'reading';
      ++this.pendingDownloads;
      this.set_transfer({ phase: 'download', path: form.name, done: 0, total: size });
      try {
        // Uses the existing serialized read/open/close transaction, bounded to
        // at most 2048 bytes. It creates no Blob, download or metadata write.
        const data = await this.read_device_file(path, { max_bytes: size, progress_cb: progress => {
          if (current()) this.set_transfer({ phase: 'download', path: form.name, done: progress.received_bytes, total: size });
        } });
        if (!current()) return;
        if (data.byteLength !== size) throw new Error(this.$t('tools.sizeChanged'));
        this.figureInspection = inspectTagStructure(new Uint8Array(data));
        this.figureInfoState = 'ready';
      } catch (error) {
        if (current()) { this.figureInfoState = 'failed'; this.show_transfer_error(error); }
      } finally {
        // Closing the dialog invalidates its result, but the protocol still
        // owns its read until completion. Never unlock a replacement session.
        if (generation === this.sessionGeneration) {
          --this.pendingDownloads;
          if (!this.pendingDownloads) this.set_transfer(null);
        }
      }
    },

    on_diag_meta_close() {
      if (!this.metadataNote.valid) { this.show_transfer_error(new Error(this.metadata_note_hint())); return; }
      const form = this.meta_form, meta = { notes: form.notes, flags: { ...form.flags }, amiibo: { ...form.amiibo } };
      return this.mutate(async generation => {
        this.checked(await proto.vfs_update_meta(form.path, meta));
        if (!this.session_current(generation)) return;
        Object.assign(form.row, meta); this.meta_diag_visible = false;
      });
    },

    metadata_note_hint() {
      const note = this.metadataNote;
      return this.$t(note.reason === 'invalid' ? 'properties.noteinvalid' : note.reason === 'length' ? 'properties.notelimit' : 'properties.notebytes',
        { max: note.maxBytes, actual: note.bytes });
    },

    on_table_selection_change(selected) {
      this.table_selection = selected;
    },

    sort_table_row_name(a, b) {
      return this.nameCollator.compare(a.name, b.name);
    },

    handle_name_click(index, row) {
      if (!this.connected || this.busy) return;
      if (row.type === 'DRIVE' || row.type === 'DIR') {
        if (this.pendingDownloads) return;
        this.current_dir = row.type === 'DRIVE' ? row.name.slice(0, 3) : this.append_segment(this.current_dir, row.name);
        this.reset_filters();
        return this.reload_folder();
      }
      let path;
      try { path = this.append_segment(this.current_dir, row.name); }
      catch (error) { this.show_transfer_error(error); return; }
      return this.download_device_file(path, row.name, row.sizeBytes);
    },
    download_device_file(path, name, size, saveOnRead = false) {
      const generation = this.sessionGeneration;
      ++this.pendingDownloads;
      this.set_transfer({ phase: 'download', path, done: 0, total: size || 0 });
      return proto.vfs_helper_read_file(path, data => {
        if (!this.session_current(generation)) return;
        if (Number.isSafeInteger(size) && data.byteLength !== size) {
          this.remember_transfer('download', 'failed', data.byteLength);
          this.show_transfer_error(new Error(this.$t('tools.sizeChanged'))); return;
        }
        // Retain complete bytes so a blocked browser save can be retried without reading again.
        this.lastDownload = { blob: new Blob([data], { type: 'application/octet-stream' }), filename: name };
        this.remember_transfer('download', 'success', data.byteLength);
        if (saveOnRead) this.save_last_download();
      }, error => { if (this.session_current(generation)) { this.remember_transfer('download', 'failed'); this.show_transfer_error(error); } }, () => {
        if (generation === this.sessionGeneration) { --this.pendingDownloads; if (!this.pendingDownloads) this.set_transfer(null); }
      }, { ...(Number.isSafeInteger(size) ? { max_bytes: size } : {}), progress_cb: progress => {
        if (this.session_current(generation)) this.set_transfer({ phase: 'download', path, done: progress.received_bytes, total: size || 0 });
      } });
    },

    async reload_drive() {
      if (!this.connected) return;
      this.close_preview_selection();
      const listing = ++this.listingGeneration, generation = this.sessionGeneration;
      this.current_dir = ''; this.table_loading = true; this.listingError = false; this.tableData = []; this.table_selection = [];
      this.page = 1;
      try {
        const data = this.checked(await proto.vfs_get_drive_list());
        if (!this.session_current(generation) || listing !== this.listingGeneration) return;
        this.driveInfo = normalizeDrives(data); this.refresh_local_metrics();
        this.tableData = data.map(drive => ({ name: drive.label + ':/ [' + drive.name + ']', type: 'DRIVE', notes: '', sizeBytes: drive.total_size,
          size: drive.status === 0 ? this.$t('drive.free', { free: this.format_size(drive.free_size), total: this.format_size(drive.total_size) }) : this.$t('drive.message') + drive.status + this.$t('drive.messageend') }));
      } catch (error) { if (this.session_current(generation) && listing === this.listingGeneration) { this.listingError = true; this.show_transfer_error(error); } }
      finally { if (listing === this.listingGeneration) this.table_loading = false; }
    },

    async reload_folder() {
      if (!this.connected) return;
      this.backupDriveOpenError = false;
      this.previewSelection=null;++this.previewSerial;
      const dir = this.current_dir, listing = ++this.listingGeneration, generation = this.sessionGeneration;
      this.table_loading = true; this.listingError = false; this.tableData = []; this.table_selection = [];
      try {
        const data = this.checked(await proto.vfs_read_folder(dir));
        if (!this.session_current(generation) || listing !== this.listingGeneration || dir !== this.current_dir) return;
        this.tableData = data.map(file => ({ name: file.name, size: this.format_size(file.size), sizeBytes: file.size,
          type: file.type === 0 ? 'REG' : 'DIR', metadataValid: file.meta.valid !== false,
          notes: file.meta.valid === false ? this.$t('properties.invalidmeta') : file.meta.notes, flags: file.meta.flags, amiibo: file.meta.amiibo }));
        // Filters remain usable while the listing is pending. Preserve the
        // user's current page decision, not the page captured before that edit.
        this.page = Math.min(Math.max(1, this.page), this.pageCount);
      } catch (error) { if (this.session_current(generation) && listing === this.listingGeneration) { this.listingError = true; this.show_transfer_error(error); } }
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

    append_segment(dir, seg) { return joinDevicePath(dir, seg); },
    new_entry_path(dir, name) {
      try { assertPortableEntryName(name); }
      catch (error) {
        if (error.code === 'NAME_LIMIT') throw error;
        throw new Error(this.$t('info.portableName'));
      }
      return this.append_segment(dir, name);
    },
    async assert_new_entry_available(dir,name,generation,sourceName) {
      this.new_entry_path(dir,name);
      const entries=this.checked(await proto.vfs_read_folder(dir)); this.assert_session(generation);
      const key=portableNameKey(name);
      if(entries.some(entry=>entry.name!==sourceName && portableNameKey(entry.name)===key)) {
        throw new Error(this.$t('info.portableCollision'));
      }
    },

    delete_table_row_by_name(name) {
      for (var i = 0; i < this.tableData.length; i++) {
        if (this.tableData[i].name == name) {
          if (this.previewSelection?.row === this.tableData[i]) this.close_preview_selection();
          this.tableData.splice(i, 1);
          this.page = Math.min(this.page, this.pageCount);
          return;
        }
      }
    },

    handle_set_language(lang) {
      if (!this.$i18n.availableLocales.includes(lang)) return;
      this.language = lang; this.$i18n.locale = lang;
      document.documentElement.lang = lang.replace('_', '-');
      save_language(this.storage(), lang);
      this.connBtnText = this.$t(this.disconnecting ? 'info.disconnecting' : this.connected ? 'conn.disconnect' : this.connecting ? 'conn.connecting' : 'conn.connect');
      this.version = this.firmwareVersion ? this.$t('status.connected') + this.firmwareVersion : '';
      this.$message({ message: this.$t('lang.changeok'), type: 'success' });
    }


  }, mounted() {
    try { if (this.storage()?.getItem('allmiibo-folder-checkpoint-enabled') === '1') void this.toggle_stored_backup(true, false); } catch { /* storage disabled */ }
    this._metricsTimer = window.setInterval?.(() => this.refresh_local_metrics(), 500);
    this.browserIssue = typeof navigator !== 'undefined' && !navigator.bluetooth ? 'tools.browserUnavailable' : '';
    if (typeof window !== 'undefined' && window.isSecureContext === false) this.browserIssue = 'tools.insecure';
    window.addEventListener?.('beforeunload', this.on_before_unload);
    var dispatcher = sharedEventDispatcher();
    dispatcher.addListener("ble_connected", this.on_ble_connected);
    dispatcher.addListener("ble_disconnected", this.on_ble_disconnected);
    dispatcher.addListener("ble_disconnect_complete", this.on_ble_disconnect_complete);
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
    this.reset_figure_info();
    this.clear_dfu_attempt(); this.clear_migration_restart(); this._disconnectIntent = null;
    this.invalidate_sync(); this.invalidate_zip(); this._uploadController?.abort(); this._uploadController=null;
    if (this._metricsTimer != null) window.clearInterval?.(this._metricsTimer);
    this._backupController?.abort(); this.lastBackup = null; this.lastDownload = null;
    window.removeEventListener?.('beforeunload', this.on_before_unload);
    ++this.sessionGeneration; ++this.listingGeneration;
    this.connected = false; this.connecting = false;
    const dispatcher = sharedEventDispatcher();
    dispatcher.removeListener('ble_connected', this.on_ble_connected);
    dispatcher.removeListener('ble_disconnected', this.on_ble_disconnected);
    dispatcher.removeListener('ble_disconnect_complete', this.on_ble_disconnect_complete);
    dispatcher.removeListener('ble_connect_error', this.on_ble_connect_error);
    pixl.disconnect({ immediate: true });
  }
}
</script>

<style>
.source-footer { display:flex; flex-wrap:wrap; align-items:center; gap:0 1rem; padding:.5rem 1rem; }
.source-footer a { display:inline-flex; align-items:center; min-height:44px; color:#12565d; text-underline-offset:.18em; }
.el-message--error .el-message__content {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #8f2430;
  font-family: system-ui, sans-serif;
  line-height: 1.45;
}
.upload-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.7rem}.upload-choice{display:flex;flex-direction:column;gap:.6rem;border:1px solid #c9d7e8;border-radius:10px;padding:.8rem;font-weight:600;min-width:0}.upload-choice input{max-width:100%;font:inherit;font-size:.85rem}.upload-destination{overflow-wrap:anywhere}

.diagnostic-export-hint { line-height:1.6; font-size:14px; color:#395c67; }
.diagnostic-json-label { display:block; margin:14px 0 8px; font-size:12px; color:#54737d; }
.diagnostic-json { display:block; box-sizing:border-box; width:100%; max-width:100%; min-height:220px; resize:vertical; padding:12px; border:1px solid #bed3d7; border-radius:8px; background:#f5f9fa; color:#263e47; font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; tab-size:2; }
.diagnostic-json:focus-visible { outline:3px solid #268892; outline-offset:3px; }
.diagnostic-export-status { min-height:2.8em; padding:10px 12px; border-radius:7px; color:#3a6270; background:#edf5f7; font-size:13px; line-height:1.5; }
.diagnostic-export-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.diagnostic-export-actions button { min-height:42px; padding:10px 13px; border:1px solid #b3cdd3; border-radius:7px; background:white; color:#2b6874; font:inherit; font-size:12px; cursor:pointer; }
.diagnostic-export-actions button:disabled { opacity:.5; cursor:default; }
.diagnostic-export-actions button:focus-visible { outline:3px solid #268892; outline-offset:3px; }
@media(max-width:500px) { .diagnostic-export-actions button { flex:1 1 45%; } }
.quick-status { display:flex; align-items:center; flex-wrap:wrap; gap:10px; padding:12px 14px; margin:12px 0; background:#f4f8fc; border:1px solid #d3e0ec; border-radius:10px; clear:both; }
.quick-status-main { display:flex; align-items:center; flex-wrap:wrap; gap:10px; flex:1; min-width:180px; }
.connection-pill { padding:6px 10px; border-radius:18px; color:#536578; background:#e5edf4; font-size:.82rem; white-space:nowrap; }
.connection-pill.online { color:#205e42; background:#dcefe5; }
.quick-location { font-size:.84rem; overflow-wrap:anywhere; min-width:0; }
.quick-storage { color:#486a80; font-size:.8rem; }
.quick-status button,.selection-actions button { padding:9px 12px; min-height:40px; border:1px solid #a7bfd3; border-radius:7px; background:white; color:#24577e; cursor:pointer; }
.selection-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:10px 0; font-size:.82rem; }
.selection-actions button:disabled { opacity:.5; cursor:default; }
.visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
@media(max-width:650px) { .quick-status { align-items:stretch; } .quick-status-main { flex-basis:100%; } .filemanager .el-button--small { min-height:38px; } .row-menu { min-width:36px; min-height:36px; } .sync-pages { display:flex; gap:8px; align-items:center; flex-wrap:wrap; } }

.backup-resume { margin:12px 0; padding:16px; border:1px solid #bfd5e8; border-radius:10px; background:#f3f8fc; line-height:1.5; overflow-wrap:anywhere; }
.backup-resume button { margin:10px 8px 0 0; padding:10px 14px; border:1px solid #9aadc4; border-radius:6px; background:white; color:#2459a6; cursor:pointer; }
.backup-resume button:disabled { opacity:.5; cursor:default; }
.backup-resume summary { cursor:pointer; }

.version-context { display:flex; gap:8px; flex-wrap:wrap; margin:-6px 0 16px; color:#607588; font-size:.76rem; } .version-context span { border:1px solid #dce5ed; background:#f7fafc; border-radius:20px; padding:5px 10px; } .version-context strong { font-weight:600; color:#315c7b; }
.property-filename { overflow-wrap:anywhere; font-size:.85rem; font-weight:600; color:#526575; margin:0 0 12px; }
.figure-file-read { margin:12px 0; padding:12px; border:1px solid #d8e5ee; border-radius:10px; background:#f6f9fc; } .figure-file-read button { min-height:42px; padding:9px 14px; border:1px solid #9fbdd4; border-radius:8px; color:#22577f; background:white; cursor:pointer; } .figure-file-read button:disabled { opacity:.5; cursor:default; } .figure-file-read p { font-size:.8rem; line-height:1.5; margin:8px 0 0; } .figure-file-read .read-only-label { color:#496d62; font-size:.75rem; } .figure-file-read summary,.property-edit summary { cursor:pointer; padding:10px 0; font-size:.8rem; color:#526b80; } .property-edit { margin-top:12px; border-top:1px solid #dce5ed; } .property-edit .el-form { padding-top:8px; }
.catalogue-toggle { margin: 4px 0 12px; padding: 8px 12px; cursor: pointer; }
.sync-picker { display: block; margin: 12px 0; overflow-wrap: anywhere; }
.sync-picker input { display: block; max-width: 100%; margin-top: 6px; }
.sync-entries { max-height: 360px; overflow: auto; margin: 12px 0; border: 1px solid #cad9eb; }
.sync-entry { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; border-bottom: 1px solid #e1e8ef; overflow-wrap: anywhere; }
.sync-entry span { min-width: 0; flex: 1; }
.sync-entry small { width: 100%; }
.recovery-note { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.device-panel { margin: 16px 0; padding: 14px; border: 1px solid #cad9eb; border-radius: 8px; background: #f8fafd; }
.device-panel summary { font-weight: 600; cursor: pointer; }
.device-panel p { line-height: 1.5; }
.device-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
.device-info-grid > div { min-width: 0; overflow-wrap: anywhere; }
.device-info-grid dt { color: #5a687b; font-size: 13px; line-height: 1.4; }
.device-info-grid dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.drive-info { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 0; }
.drive-info progress { accent-color: #2459a6; max-width: 100%; }
.info-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.info-actions button { font: inherit; padding: 7px 12px; color: #2459a6; background: white; border: 1px solid #9aadc4; border-radius: 5px; cursor: pointer; }
.info-actions button:disabled { opacity: .5; cursor: default; }
.transfer-estimate-hint { flex-basis: 100%; color: #5a687b; line-height: 1.4; }
input[type="search"], select { font: inherit; border: 1px solid #c7d1df; border-radius: 6px; padding: 8px; background: white; color: #253047; }
.file-filters { display: flex; align-items: end; flex-wrap: wrap; gap: 16px; margin: 16px 0; }
.search-label { display: grid; gap: 5px; flex: 1; min-width: 210px; }
.entry-count { color: #5a687b; padding-bottom: 8px; }
.backup-hint { font-size: 13px; color: #5a687b; line-height: 1.5; margin: 8px 0; }
.pagination { display: flex; gap: 16px; align-items: center; justify-content: flex-end; padding: 16px 0; }
.pagination button { font: inherit; padding: 6px 12px; border: 1px solid #9aadc4; border-radius: 5px; background: white; cursor: pointer; }
.pagination button:disabled { cursor: default; opacity: .45; }
.notice, .transfer-panel, .backup-ready { padding: 14px; background: #eff5fc; border: 1px solid #cad9eb; border-radius: 8px; margin: 12px 0; }
.notice.error { background: #fff6e8; border-color: #e4c692; }
.transfer-panel, .backup-ready { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.transfer-path { overflow-wrap: anywhere; flex: 1; min-width: 160px; }
.transfer-panel progress { width: 180px; accent-color: #2459a6; }
.transfer-panel button, .backup-ready button { padding: 7px 12px; cursor: pointer; border: 1px solid #9aadc4; border-radius: 5px; background: white; color: #253047; }
.backup-ready { background: #edf8f1; border-color: #b6dbc3; }
.backup-ready span { overflow-wrap: anywhere; flex: 1; }
.backup-archive small { display: block; margin-top: 4px; }
.preview-controls { padding: 12px; background: #eff5fc; border-radius: 8px; margin: 12px 0; }
.preview-controls button { font: inherit; padding: 7px 12px; color: #2459a6; background: white; border: 1px solid #9aadc4; border-radius: 5px; cursor: pointer; }
.preview-controls p { font-size: 14px; line-height: 1.5; margin: 10px 0 0; }
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
  clear: both;
  padding-top: 18px;
  text-align: center;
  margin: 30px auto;
}
@media (max-width: 650px) {
  body { margin: 8px; } .filemanager { padding: 12px; }
  .filemanager > .el-row > .el-col { max-width: 100%; flex-basis: 100%; }
  .filemanager > .el-row .action-right, .filemanager > .el-row .action-left { float: none; }
  .filemanager h2 { font-size: 23px; }
}
/* 3.26: task-focused shell. Existing transfer dialogs and confirmation gates
 * stay mounted; navigation only opens and focuses their surrounding areas. */
:root { --el-color-primary:#176b73; --el-color-primary-light-3:#53969b; --el-color-primary-light-5:#83b3b7; --el-color-primary-light-7:#b4d0d3; --el-color-primary-light-8:#cce0e2; --el-color-primary-light-9:#e8f2f3; --el-color-primary-dark-2:#11545b; }
body { box-sizing:border-box; margin:0; padding:28px 20px; background:#eef3f3; color:#22363d; }
.filemanager { box-sizing:border-box; max-width:1180px; padding:30px; border:1px solid #dae4e5; border-radius:20px; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; box-shadow:0 8px 40px #17383f08; }
.filemanager *, .filemanager *::before, .filemanager *::after { box-sizing:border-box; }
.filemanager button, .filemanager input, .filemanager select { font-family:inherit; }
.filemanager :where(button,a,input,select,summary,[tabindex]):focus-visible { outline:3px solid #268892; outline-offset:4px; }
.skip-link { position:absolute; top:8px; left:12px; transform:translateY(-200%); padding:12px 18px; z-index:100; color:white; background:#144e55; border-radius:8px; }
.skip-link:focus { transform:translateY(0); }
.app-header { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.brand-lockup { display:flex; align-items:center; gap:15px; min-width:0; }
.brand-mark { width:54px; height:54px; display:grid; place-items:center; flex:none; border-radius:16px; color:#d6f5f1; background:#183f48; }
.brand-mark svg { width:36px; height:36px; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; }
.app-eyebrow,.section-eyebrow { margin:0 0 5px; color:#51757c; font-size:10px; font-weight:700; letter-spacing:.15em; }
.app-header h1 { margin:0; font-size:clamp(26px,3vw,34px); font-weight:700; line-height:1.15; letter-spacing:-.04em; color:#203e47; }
.app-subtitle { margin:7px 0 0; color:#627b82; font-size:12px; line-height:1.5; }
.header-tools { display:flex; align-items:center; flex-wrap:wrap; gap:10px; justify-content:flex-end; flex:none; }
.header-tools>.el-button { min-width:112px; min-height:42px; font-weight:600; border-radius:9px; }
.header-language .el-button { min-height:38px; color:#43656f; background:#fff; border-color:#d1dfe1; border-radius:9px; }
.version-context { margin:18px 0 12px; font-size:11px; }
.version-context span { border-color:#dfe8e9; background:#f7fafa; }
.version-context strong { color:#31545d; }
.quick-status { margin:0 0 22px; padding:12px 14px; background:#f7fafa; border-color:#dfe8e9; border-radius:11px; }
.connection-pill { display:inline-flex; align-items:center; gap:7px; background:#e8edef; color:#576a72; font-weight:600; font-size:12px; }
.connection-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
.connection-pill.online { background:#e1f0e8; color:#276a4e; }
.quick-status button { min-height:36px; padding:7px 11px; border-color:#cadadd; color:#35646c; font-size:12px; }
.quick-location,.quick-storage { color:#486771; font-size:12px; }
.workspace-nav { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:0 0 20px; }
.workspace-nav button { display:flex; align-items:center; gap:12px; width:100%; min-height:88px; padding:16px 14px; text-align:left; background:#fff; border:1px solid #d6e2e3; border-radius:12px; color:#234851; cursor:pointer; }
.workspace-nav button:hover { border-color:#74a9ae; background:#f2f8f8; }
.workspace-nav strong { display:block; font-size:13px; line-height:1.4; }
.remote-workspace { margin:16px 0; border:1px solid #d4e1e4; border-radius:12px; padding:14px; scroll-margin-top:12px; }
.remote-workspace>summary { cursor:pointer; font-weight:600; min-height:32px; }
.remote-workspace[open]>summary { margin-bottom:12px; }
.workspace-nav small { display:block; margin-top:5px; color:#617b82; font-size:11px; line-height:1.5; }
.workspace-icon { display:grid; place-items:center; width:35px; height:38px; flex:none; border-radius:9px; background:#eaf3f3; color:#26747c; font-size:22px; }
.workspace-arrow { margin-left:auto; font-size:18px; color:#6a8e94; }
.workspace-panel { margin:10px 0; border:1px solid #dce6e7; border-radius:12px; background:#fafcfc; scroll-margin-top:20px; }
.workspace-panel>summary { padding:14px 16px; font-size:13px; font-weight:650; color:#355c65; cursor:pointer; }
.workspace-panel>summary>span { margin-left:12px; color:#71878d; font-size:11px; font-weight:400; }
.workspace-panel[open]>summary { border-bottom:1px solid #e1e9ea; }
.workspace-content { padding:16px; }
.workspace-description { margin:0 0 12px; color:#5a737c; font-size:13px; line-height:1.6; max-width:85ch; }
.workspace-location { font-size:12px; color:#627b82; overflow-wrap:anywhere; }
.workspace-location strong { color:#2b555e; }
.workspace-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.workspace-actions .el-button { margin:0; min-height:40px; }
.update-steps { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:14px 0; }
.update-steps>div { padding:16px; background:white; border:1px solid #dce6e7; border-radius:10px; }
.update-steps>div>span { display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:#e8f3f3; color:#1c6972; font-size:12px; font-weight:700; }
.update-steps p { font-size:12px; color:#536f78; line-height:1.6; }
.update-steps .el-button,.dfu-page-link { min-height:40px; }
.dfu-page-link { display:inline-flex; align-items:center; gap:10px; margin:0; padding:10px 14px; border:1px solid #c3d7da; border-radius:8px; color:#176b73; font-size:12px; text-decoration:none; background:#fff; }
.files-workspace { margin:24px 0; padding-top:4px; scroll-margin-top:18px; outline-offset:7px; }
.section-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:0 0 16px; }
.filemanager .section-heading h2 { font-size:23px; letter-spacing:-.025em; margin:0; color:#23434c; }
.file-navigation,.file-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.file-toolbar { justify-content:flex-start; margin:0 0 12px; }
.filemanager .el-button--small { min-height:38px; font-size:12px; }
.file-navigation .el-button+.el-button { margin-left:0; }
.el-button-group { margin:0; }
.selection-counter { padding:5px 8px; color:#54717a; font-size:12px; }
.folder-path { margin:12px 0; padding:12px 14px; border:1px solid #e0e8e9; border-radius:9px; background:#f8fafa; overflow-wrap:anywhere; }
.folder-path .el-breadcrumb { line-height:1.6; }
.file-filters { gap:12px; margin:16px 0; font-size:12px; }
.file-filters input,.file-filters select { min-height:40px; border-color:#ccdce0; }
.search-label { min-width:180px; }
.file-filters>button { min-height:40px; padding:8px 12px; border:1px solid #cbdcdf; background:white; color:#276873; border-radius:7px; cursor:pointer; }
.connection-guide { display:flex; align-items:flex-start; gap:14px; padding:20px; margin:15px 0 0; background:#f1f7f7; border:1px dashed #b8d2d6; border-radius:11px; }
.connection-guide-symbol { font-size:26px; color:#387b84; }
.connection-guide h3 { margin:0 0 7px; font-size:14px; color:#284e58; }
.connection-guide p { margin:0; color:#617a83; font-size:12px; line-height:1.7; max-width:75ch; }
.preview-controls { padding:10px 0; background:transparent; }
.preview-controls button { font-size:12px; min-height:40px; color:#34727c; border-color:#c2d9dc; }
.device-panel { margin:24px 0 0; padding:16px; background:#f8fafa; border-color:#dbe5e6; border-radius:12px; scroll-margin-top:20px; }
.device-panel>summary { font-size:13px; color:#466670; }
.device-panel>p,.device-panel .backup-hint { font-size:12px; }
.device-info-grid { gap:18px; margin:20px 0; }
.device-info-grid dt { font-size:11px; color:#6a8189; }
.device-info-grid dd { font-size:13px; color:#31535d; }
.extra-tools { margin:22px 0 0; padding:20px 0 0; border-top:1px solid #e0e9ea; }
.filemanager .extra-tools h2 { margin:0 0 7px; font-size:15px; color:#355760; }
.extra-tools>p { margin:0 0 12px; font-size:12px; color:#6b8189; }
.catalogue-toggle { padding:10px 14px; min-height:40px; border:1px solid #cadde0; border-radius:8px; background:white; color:#2e6974; font:inherit; font-size:12px; }
.transfer-panel,.backup-resume,.backup-ready { scroll-margin-top:18px; }
.transfer-panel { border-left:4px solid #348992; background:#eff7f7; }
.filemanager .el-table { --el-table-header-bg-color:#f4f8f8; --el-table-border-color:#e0e9ea; --el-table-row-hover-bg-color:#f1f7f7; border:1px solid #e0e9ea; border-radius:10px; font-size:12px; }
.filemanager .el-table th.el-table__cell { color:#58747d; font-weight:600; }
.filemanager .el-table td.el-table__cell { padding:9px 0; }
.file-name-action { min-height:30px; }
@media(max-width:850px) { .workspace-nav { gap:8px; } .workspace-nav button { padding:13px 10px; gap:8px; } .workspace-icon { display:none; } .app-subtitle { max-width:35ch; } }
@media(max-width:650px) { body { padding:10px; } .filemanager { padding:18px 14px; border-radius:14px; } .app-header { flex-wrap:wrap; gap:16px; } .header-tools { justify-content:space-between; width:100%; } .brand-mark { width:46px; height:46px; border-radius:13px; } .app-subtitle { max-width:none; font-size:11px; } .version-context { margin-top:14px; } .workspace-nav { grid-template-columns:1fr; gap:8px; } .workspace-nav button { min-height:64px; padding:11px 13px; } .workspace-icon { display:grid; } .workspace-nav small { margin-top:2px; } .workspace-panel>summary>span { display:block; margin:5px 0 0 15px; } .workspace-content { padding:12px; } .update-steps { grid-template-columns:1fr; } .section-heading { align-items:flex-start; flex-wrap:wrap; } .file-navigation { width:100%; } .file-navigation .el-button { flex:1; } .filemanager .el-button--small { min-height:42px; } .search-label { flex-basis:100%; min-width:0; } .entry-count { padding-bottom:0; } .quick-status-main { min-width:0; } .quick-status button { min-height:42px; } .info-actions button { min-height:42px; } .connection-guide { padding:14px; } }
@media(prefers-reduced-motion:reduce) { .filemanager *, .filemanager *::before, .filemanager *::after { scroll-behavior:auto!important; transition:none!important; animation:none!important; } }
/* Compact navigation and explicit path controls, without hiding file actions. */
.folder-breadcrumbs ol { display:flex; flex-wrap:wrap; gap:4px 8px; align-items:center; list-style:none; margin:0; padding:0; font-size:12px; }
.folder-breadcrumbs li { display:flex; align-items:center; gap:8px; min-width:0; max-width:100%; overflow-wrap:anywhere; }
.folder-breadcrumbs button { border:0; border-radius:6px; padding:8px 6px; background:transparent; color:#176b73; text-align:left; font:inherit; cursor:pointer; overflow-wrap:anywhere; min-height:36px; }
.folder-breadcrumbs button:hover { background:#e3f0f0; text-decoration:underline; text-underline-offset:3px; }
.folder-breadcrumbs button:disabled { opacity:.5; cursor:default; }
.folder-breadcrumbs [aria-current] { padding:8px 0; color:#254e59; font-weight:650; }
.metadata-note-hint { width:100%; margin:6px 0 0; font-size:12px; line-height:1.5; color:#536b80; overflow-wrap:anywhere; }
.metadata-note-hint.invalid { color:#a12a2a; }
.path-separator { color:#92a8ad; }
.table-footer { display:flex; align-items:center; flex-wrap:wrap; justify-content:space-between; gap:12px; padding:12px 0; }
.table-footer .pagination { padding:0; flex-wrap:wrap; gap:10px; }
.page-size { display:flex; gap:10px; align-items:center; color:#5b767e; font-size:12px; }
.page-size select { min-height:40px; }
@media(max-width:650px) {
  .workspace-nav { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-bottom:16px; }
  .workspace-nav button { min-height:74px; padding:10px 4px; display:flex; flex-direction:column; justify-content:center; text-align:center; gap:5px; }
  .workspace-nav strong { font-size:11px; overflow-wrap:anywhere; }
  .workspace-nav small,.workspace-arrow { display:none; }
  .workspace-icon { width:26px; height:26px; font-size:19px; border-radius:7px; }
  .quick-status { margin-bottom:14px; }
  .files-workspace { margin-top:16px; }
  .folder-path { padding:7px 9px; }
  .folder-breadcrumbs button { min-height:42px; }
  .table-footer { align-items:flex-start; }
  .table-footer .pagination button { min-height:42px; }
}

/* 3.32: persistent workspaces, quiet navigation and a selection context. */
:root{--el-color-primary:#26333d;--el-color-primary-dark-2:#16232d;--el-color-primary-light-3:#596772;--el-color-primary-light-5:#89949c;--el-color-primary-light-7:#b9c1c7;--el-color-primary-light-8:#d6dce0;--el-color-primary-light-9:#eef1f3}
body{padding:0;background:#f5f6f8;color:#2d3943}.filemanager{max-width:1680px;min-height:100vh;border:0;border-radius:0;margin:0 auto;padding:0;background:#fafbfc;box-shadow:none}.app-header{height:76px;padding:14px 28px;background:white;border-bottom:1px solid #e5e8ec;gap:16px}.brand-mark{width:38px;height:38px;border-radius:11px;background:#293942;color:#fff}.brand-mark svg{width:26px;height:26px}.brand-lockup{gap:11px}.app-header h1{font-size:21px;letter-spacing:-.03em;color:#27333d}.app-eyebrow{font-size:8px;letter-spacing:.15em;color:#8b959e;margin:0 0 3px}.app-subtitle{display:none}.header-tools>.el-button{min-height:36px}.header-language .el-button{min-height:34px}.version-context{margin:0;padding:10px 28px 0;background:white;font-size:10px}.version-context span{border:0;padding:0 16px 0 0;background:transparent;border-radius:0}.version-context strong{color:#65717b}.quick-status{margin:0;border:0;border-bottom:1px solid #e5e8ec;border-radius:0;padding:12px 28px;background:white;gap:10px}.quick-status button{min-height:30px;border:0;background:transparent;color:#5d6e7a;padding:6px}.quick-location{font-size:12px}.connection-pill{font-size:10px;padding:5px 9px}.quick-storage{font-size:11px}.app-layout{display:grid;grid-template-columns:210px minmax(0,1fr);align-items:start;min-height:calc(100vh - 135px)}.workspace-nav{display:flex;flex-direction:column;gap:7px;margin:0;padding:26px 14px;position:sticky;top:0;max-height:100vh;overflow:auto;align-self:start;border-right:1px solid #e5e8ec;min-height:calc(100vh - 135px);background:#fafbfc}.workspace-nav button{display:flex;align-items:center;text-align:left;width:100%;border:0;border-radius:8px;box-shadow:none;background:transparent;padding:12px 10px;gap:10px;min-height:52px}.workspace-nav button:hover{background:#edf0f3;transform:none}.workspace-nav button[aria-current="page"]{background:#e8ecef;color:#263c49}.workspace-nav button strong{font-size:12px;font-weight:600;color:#34444f}.workspace-nav button small{font-size:10px;line-height:1.4;margin-top:3px;color:#8b959e}.workspace-nav .workspace-icon{width:25px;height:25px;background:transparent;color:#607583;font-size:20px}.workspace-arrow{display:none}.workspace-body{min-width:0;padding:24px}.files-workspace{padding:0;border:1px solid #e3e7eb;border-radius:12px;background:white;box-shadow:0 2px 8px #20303a04;overflow:hidden}.collection-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px}.collection-main{min-width:0;padding:24px}.selection-context{min-width:0;border-left:1px solid #e5e8ec;background:#fdfefe;align-self:stretch}.selection-context .selection-preview{position:sticky;top:0}.section-heading{gap:12px;flex-wrap:wrap;margin-bottom:18px}.filemanager .section-heading h2{font-size:21px;letter-spacing:-.03em;margin:0}.section-eyebrow{font-size:9px;color:#98a1a9;margin-bottom:5px}.file-toolbar{margin-bottom:10px}.file-toolbar .el-button{min-height:34px}.folder-path{margin:15px 0}.file-filters{gap:9px;margin:16px 0}.file-filters label{font-size:11px;color:#657783}.search-label{min-width:130px}.file-filters input,.file-filters select{min-height:36px;font-size:12px;border-color:#dde3e8}.entry-count{font-size:10px}.connection-guide{background:#fafbfc;border:1px dashed #d3dbe1;border-radius:10px;margin:12px 0}.connection-guide h3{font-size:14px}.connection-guide p{font-size:12px}.connection-guide-symbol{color:#6d7d88;background:#eef1f4}.preview-controls{background:transparent;padding:6px 0}.preview-controls button{font-size:11px;background:white;border-color:#dce3e8;color:#5c707d}.device-search{font-size:12px}.filemanager .el-table{font-size:12px;--el-table-header-bg-color:#fafbfc;--el-table-border-color:#edf0f3;--el-table-row-hover-bg-color:#f5f8fa}.filemanager .el-table th.el-table__cell{font-size:10px;font-weight:600;color:#8b959e;height:38px}.filemanager .el-table td.el-table__cell{height:44px}.file-name-action{font-size:12px}.file-name-action:hover{color:#12725f}.file-symbol{color:#9ba7af}.table-footer{margin-top:14px}.page-size,.pagination{font-size:11px}.workspace-body>.workspace-panel,.workspace-body>.device-panel,.workspace-body>.remote-workspace,.workspace-body>.extra-tools{margin:0;padding:24px;border:1px solid #e3e7eb;border-radius:12px;background:white;box-shadow:0 2px 8px #20303a04}.workspace-body>.workspace-panel>summary,.workspace-body>.device-panel>summary,.workspace-body>.remote-workspace>summary{padding:0 0 18px;font-size:18px;list-style:none;pointer-events:none}.workspace-content{padding:0}.transfer-panel,.backup-ready,.backup-resume{margin:0 0 16px;background:white;border-color:#e0e6eb}.transfer-panel{position:sticky;top:8px;z-index:4;box-shadow:0 5px 18px #22333f0b}.workspace-body>.backup-hint{font-size:10px;margin-bottom:10px}.workspace-body .extra-tools h2{font-size:20px}.workspace-body .extra-tools .catalogue-toggle{font-size:12px}.device-info-grid{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.device-info-grid dt{font-size:11px}.device-info-grid dd{font-size:13px}.filemanager>.notice{margin:12px 28px}.upload-choices input::file-selector-button{border:1px solid #d1dbe1;padding:8px;border-radius:6px;background:#fff;color:#394d5b}.el-upload-dragger{background:#fafbfc;border-color:#cbd5dd}.upload-symbol{color:#9aa9b5}
@media(max-width:1200px){.app-layout{grid-template-columns:175px minmax(0,1fr)}.workspace-body{padding:18px}.collection-layout{grid-template-columns:minmax(0,1fr) 225px}.collection-main{padding:18px}.workspace-nav{padding:20px 9px}.workspace-nav button small{display:none}.workspace-nav button{min-height:44px}.file-navigation{gap:4px}.filemanager .el-button--small{font-size:11px}}
@media(max-width:960px){.collection-layout{grid-template-columns:minmax(0,1fr)}.selection-context{border-left:0;border-top:1px solid #e5e8ec}.selection-context .selection-preview{position:static}.selection-preview .preview-picture{float:left;width:150px;margin:0 20px 15px 0;height:150px}.selection-preview .preview-picture img{max-height:140px}.selection-preview .preview-actions{clear:both;grid-template-columns:1fr 1fr}.selection-preview .preview-empty{padding:12px 0}.selection-preview dl{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}}
@media(max-width:650px){body{padding:0}.filemanager{padding:0;border-radius:0}.app-header{height:auto;min-height:70px;padding:14px 16px;align-items:center}.brand-lockup{gap:8px}.brand-mark{width:33px;height:33px}.app-header h1{font-size:18px}.header-tools{gap:5px;flex:none}.header-tools>.el-button{min-width:80px;min-height:36px;font-size:11px}.header-language .el-button{font-size:10px;max-width:100px;padding:8px}.version-context{padding:7px 16px 0}.quick-status{padding:10px 16px;gap:7px}.quick-status-main{min-width:0;flex-basis:auto}.quick-location{display:none}.quick-storage{font-size:10px}.app-layout{display:block;min-height:0}.workspace-nav{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:8px 10px;min-height:0;max-height:none;border-right:0;border-bottom:1px solid #e1e6ea;background:#fafbfdf5;backdrop-filter:blur(10px)}.workspace-nav button{justify-content:center;min-height:42px;padding:8px 4px;gap:5px;text-align:center}.workspace-nav button strong{font-size:10px}.workspace-nav .workspace-icon{width:17px;height:20px;font-size:17px}.workspace-body{padding:12px 10px}.collection-main{padding:16px 12px}.filemanager .section-heading h2{font-size:19px}.workspace-body>.workspace-panel,.workspace-body>.device-panel,.workspace-body>.remote-workspace,.workspace-body>.extra-tools{padding:16px}.file-toolbar .el-button{font-size:11px}.file-filters{gap:8px}.file-filters .search-label{flex-basis:100%}.selection-preview .preview-picture{width:120px;height:145px;margin-right:15px}.selection-preview .preview-picture img{max-height:130px}.transfer-panel{position:static}.device-info-grid{grid-template-columns:1fr 1fr}.filemanager>.notice{margin:10px}.workspace-body>.workspace-panel>summary,.workspace-body>.device-panel>summary,.workspace-body>.remote-workspace>summary{font-size:17px}.el-dialog{max-width:96vw}.filemanager .file-navigation .el-button{min-height:32px}.filemanager .page-size select{min-height:34px}.filemanager .backup-hint{font-size:11px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}

.sidebar-device{padding:22px 10px;margin-top:15px;border-top:1px solid #e3e8ec;font-size:11px;color:#6c7984}.sidebar-caption{font-size:9px;letter-spacing:.13em;color:#99a3ab}.sidebar-device strong{font-size:12px;color:#485b68}.sidebar-device p{line-height:1.6}.sidebar-path{overflow-wrap:anywhere}.sidebar-device progress{width:100%;height:5px;accent-color:#748e84;display:block;margin:12px 0}.workspace-nav .sidebar-upload{border:1px dashed #b7c5ce;background:white;justify-content:center;text-align:center;font-size:12px;margin-top:15px}.workspace-nav .sidebar-upload:disabled{opacity:.5;cursor:default}.background-work{padding:12px 16px;margin:0 0 12px;background:#eef5f2;border-radius:8px;font-size:12px}.background-work button{border:0;background:transparent;color:#397262;cursor:pointer;text-decoration:underline}@media(max-width:650px){.sidebar-device{display:none}}
.mobile-preview-close{display:none}@media(max-width:960px){.selection-context.has-selection{position:fixed;bottom:0;left:0;right:0;z-index:20;max-height:50svh;overflow:auto;border:1px solid #d7e0e5;border-radius:16px 16px 0 0;background:white;box-shadow:0 -10px 40px #20313e24;padding-bottom:env(safe-area-inset-bottom)}.selection-context.has-selection .mobile-preview-close{display:block;position:sticky;top:0;z-index:1;margin:0 0 0 auto;padding:12px 18px;border:0;background:white;color:#506b7a;font:inherit;font-size:12px;cursor:pointer}.selection-context.has-selection .selection-preview{padding-top:4px}.selection-context.has-selection .preview-caption{font-size:10px}.selection-context.has-selection .preview-eyebrow{margin-bottom:10px}}
.sample-note{padding:10px 12px;border-left:3px solid #7596ac;background:#edf4f8;color:#294c64;font-size:.8rem;line-height:1.5;overflow-wrap:anywhere}
:root {
  --shell-paper:#f6f5ef; --shell-rule:#d7dfd7; --shell-teal:#185c52; --shell-teal-wash:#e6f2eb;
  --shell-indigo:#484571; --shell-indigo-wash:#eeedf7;
  --el-color-primary:#21675b; --el-color-primary-dark-2:#194e45; --el-color-primary-light-3:#548a7f;
  --el-color-primary-light-5:#86aca2; --el-color-primary-light-7:#b6cec5;
  --el-color-primary-light-8:#d1e1d9; --el-color-primary-light-9:#ebf3ee;
}
body,.filemanager { background:var(--shell-paper); }
.app-header,.version-context,.quick-status { background:#fffdf7; border-color:var(--shell-rule); }
.app-header h1 { color:#173c37; }
.app-eyebrow,.section-eyebrow,.sidebar-caption { color:#536961; }
.brand-mark { background:#23594e; color:#f1f6dc; }
.workspace-nav { background:#faf9f3; border-color:var(--shell-rule); }
.workspace-nav button strong { color:#31453f; font-size:13px; }
.workspace-nav button small { color:#54695f; font-size:11px; }
.workspace-nav button:not(:disabled):hover { background:#edf2e9; }
.workspace-nav button[aria-current="page"] { background:#dfede3; color:var(--shell-teal); box-shadow:inset 3px 0 var(--shell-teal); }
.workspace-nav button[aria-current="page"] strong,.workspace-nav button[aria-current="page"] .workspace-icon { color:#174b42; }
.workspace-nav .workspace-icon { color:#537069; }
.files-workspace,.workspace-body>.workspace-panel,.workspace-body>.device-panel,.workspace-body>.remote-workspace,.workspace-body>.extra-tools { border-color:var(--shell-rule); }
.filemanager .section-heading h2,.workspace-body .extra-tools h2 { color:#20473d; }
.filemanager .el-table { --el-table-header-bg-color:#f0f5ee; --el-table-row-hover-bg-color:#f0f7f1; }
.filemanager .el-table th.el-table__cell { color:#4a6359; font-size:12px; }
.file-symbol { color:#52796c; }
.connection-guide { background:#f1f7f0; border-style:solid; border-color:#c7dbcb; }
.connection-guide-symbol { color:#266353; background:transparent; }
.connection-guide p,.extra-tools>p { color:#536860; }
#update-workspace>summary,#device-overview>summary { color:var(--shell-indigo); }
.update-steps>div>span { color:var(--shell-indigo); background:var(--shell-indigo-wash); }
.start-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:14px 24px; }
.start-actions button {
  --action-ink:#194f43; --action-border:#accbbb; --action-wash:var(--shell-teal-wash);
  display:grid; grid-template-columns:72px minmax(0,1fr) auto; align-items:center; gap:12px;
  padding:12px 17px 12px 10px; text-align:start; border:1px solid var(--action-border); border-radius:13px;
  background:var(--action-wash); color:var(--action-ink); cursor:pointer; font:inherit;
}
.start-actions .start-firmware { --action-ink:#45436c; --action-border:#c7c5db; --action-wash:var(--shell-indigo-wash); }
.start-actions button::after { content:""; width:7px; height:7px; border:solid currentColor; border-width:2px 2px 0 0; transform:rotate(45deg); }
.start-actions button:hover { border-color:var(--action-ink); box-shadow:0 2px 6px #243e3b12; }
.start-actions button:focus-visible { outline:3px solid var(--action-ink); outline-offset:3px; }
.action-art { display:block; width:72px; height:54px; image-rendering:pixelated; }
.action-copy { min-width:0; display:grid; gap:4px; overflow-wrap:anywhere; }
.action-copy strong { font-size:1rem; line-height:1.25; }
.action-copy>span { font-size:.82rem; line-height:1.45; color:#4e6058; }
.start-firmware .action-copy>span { color:#58576e; }
@media(max-width:650px) {
  .app-header { gap:8px; }
  .header-tools { width:auto; min-width:0; max-width:100%; margin-inline-start:auto; justify-content:flex-end; flex-wrap:wrap; }
  .header-language,.header-language .el-dropdown,.header-language .el-tooltip__trigger { min-width:0; max-width:100%; }
  .header-language .el-button,.header-tools>.el-button { max-width:100%; height:auto; white-space:normal; overflow-wrap:anywhere; line-height:1.25; }
  .header-language .el-button,.header-tools>.el-button,.quick-status button { min-height:44px; }
  .workspace-nav { gap:4px; padding:6px 8px; background:#faf9f3; }
  .workspace-nav button { min-height:46px; padding:5px 3px; gap:3px; }
  .workspace-nav button strong { font-size:12px; line-height:1.25; }
  .workspace-nav button[aria-current="page"] { box-shadow:inset 0 -3px var(--shell-teal); }
  .start-actions { grid-template-columns:1fr; margin:10px; gap:7px; }
  .start-actions button { grid-template-columns:48px minmax(0,1fr) auto; padding:9px 13px 9px 7px; gap:8px; }
  .action-art { width:48px; height:36px; }
  .action-copy { gap:2px; }
  .action-copy strong { font-size:.91rem; }
  .action-copy>span { font-size:.78rem; line-height:1.35; }
  .figure-import { scroll-margin-top:8rem; }
}
@media(max-width:430px) {
  .app-header { flex-direction:column; align-items:stretch; padding:10px 14px 6px; }
  .header-tools { flex-direction:row-reverse; justify-content:flex-end; align-self:start; margin-inline-start:0; gap:7px; }
}
.status-links { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; }
.guide-link { color:#285d58; font-size:.875rem; font-weight:600; line-height:1.45; text-underline-offset:.18em; }
.guide-link:hover { color:#16443b; }
.guide-link:focus-visible { outline:3px solid #317b67; outline-offset:3px; }
.status-links .guide-link { font-size:.8rem; }
</style>
<style src="./styles/workspaces.css"></style>
