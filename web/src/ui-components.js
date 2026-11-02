import {
  ElButton, ElButtonGroup, ElCheckbox, ElCol,
  ElConfigProvider, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu,
  ElForm, ElFormItem, ElInput, ElRow, ElTable, ElTableColumn, ElUpload,
  ElLoading, ElMessage, ElMessageBox, ElNotification
} from 'element-plus'

// Register the components actually used by App.vue. Avoid installing the
// complete component catalogue, while keeping official service/context hooks.
export function installUiComponents(app) {
  for (const component of [
    ElButton, ElButtonGroup, ElCheckbox, ElCol,
    ElConfigProvider, ElDialog, ElDropdown, ElDropdownItem, ElDropdownMenu,
    ElForm, ElFormItem, ElInput, ElRow, ElTable, ElTableColumn, ElUpload
  ]) app.component(component.name, component)
  for (const service of [ElLoading, ElMessage, ElMessageBox, ElNotification]) app.use(service)
}
