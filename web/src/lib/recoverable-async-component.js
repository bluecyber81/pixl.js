import { defineAsyncComponent, defineComponent, h, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

/** Keep Vue's async-component prop, slot and ref forwarding, with an explicit retry. */
export function defineRecoverableAsyncComponent(loader) {
  // The state belongs to the component definition, just like Vue's shared import.
  // Several mounted instances therefore retry the same request only once.
  const retryAction = shallowRef(null)
  const failedAttempts = shallowRef(0)
  const retry = () => {
    const action = retryAction.value
    if (!action) return
    retryAction.value = null
    action()
  }
  const feedback = defineComponent({
    name: 'AsyncComponentFeedback',
    inheritAttrs: false,
    props: { locale: String, language: String },
    setup(props) {
      const { locale } = useI18n({ useScope: 'global' })
      return () => {
        const de = String(props.locale || props.language || locale.value).startsWith('de')
        const failed = !!retryAction.value
        return h('div', { class: ['async-component-feedback', { 'is-error': failed }] }, [
          h('p', { role: failed ? 'alert' : 'status', 'aria-atomic': 'true' }, failed
            ? [
                h('strong', de ? 'Dieser Bereich konnte nicht geladen werden.' : 'This section could not be loaded.'),
                h('span', de ? 'Prüfe die Verbindung und versuche es erneut.' : 'Check your connection and try again.'),
                failedAttempts.value > 1 ? h('span', de
                  ? 'Auch das erneute Laden ist fehlgeschlagen. Beende laufende Vorgänge und sichere Ergebnisse, bevor du die Seite neu lädst.'
                  : 'Loading failed again. End any running operations and save your results before reloading the page.') : null
              ]
            : de ? 'Bereich wird geladen …' : 'Loading section …'),
          failed ? h('button', { type: 'button', onClick: retry }, de ? 'Erneut laden' : 'Try again') : null
        ])
      }
    }
  })
  return defineAsyncComponent({
    // Normalize synchronous failures too; retries must follow the same path.
    loader: () => Promise.resolve().then(loader),
    delay: 200,
    loadingComponent: feedback,
    onError(_error, retryLoad, _fail, attempts) {
      // Leave Vue's import pending until the user chooses to retry. Calling fail()
      // would end that load and a subsequent click could no longer resolve it.
      // Retrying loads code only: it does not call any device-action props.
      // A repeated import cannot repair every browser/network/module failure;
      // the feedback offers manual next steps without reloading the page.
      failedAttempts.value = attempts
      retryAction.value = retryLoad
    }
  })
}
