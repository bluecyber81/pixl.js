import { createApp } from 'vue'
import 'element-plus/es/components/breadcrumb/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/checkbox/style/css'
import 'element-plus/es/components/col/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/dropdown/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/loading/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'
import 'element-plus/es/components/row/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/upload/style/css'
import App from './App.vue'
import i18n from './i18n'
import { amiiboDeepLink } from './deep-link'
import { installUiComponents } from './ui-components'

// Preserve the original QR-link behavior without a router.
// Only complete hexadecimal NFC identifiers become an external URL.
const redirect = amiiboDeepLink(window.location.pathname)
if (redirect) {
  window.location.replace(redirect)
} else {
  const app = createApp(App).use(i18n)
  installUiComponents(app)
  app.mount('#app')
}

