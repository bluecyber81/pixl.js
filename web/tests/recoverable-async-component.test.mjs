import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'
import { createRenderer, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { defineRecoverableAsyncComponent } from '../src/lib/recoverable-async-component.js'
import { hostNode, nodes, text } from './helpers/vue-component-host.mjs'

// Actual Vue async loading, component lifecycle and i18n. The host deliberately
// does not claim to simulate browser network caching, layout or Bluetooth.
const renderer = createRenderer({
  createElement: hostNode, createText: value => hostNode('#text', value), createComment: value => hostNode('#comment', value),
  setText: (node, value) => { node.text = value },
  setElementText: (node, value) => { node.text = value; node.children = [] },
  patchProp: (node, key, _old, value) => { node.props[key] = value },
  insert(node, parent, anchor = null) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = parent
    const at = parent.children.indexOf(anchor)
    at < 0 ? parent.children.push(node) : parent.children.splice(at, 0, node)
  },
  remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null
})
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await nextTick() }
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function mount(t, render, locale = 'de_DE') {
  const root = hostNode('root'), errors = []
  const i18n = createI18n({ legacy: false, locale, messages: { de_DE: {}, en: {} } })
  const app = renderer.createApp({ render })
  app.config.errorHandler = error => errors.push(error)
  app.use(i18n).mount(root)
  t.after(() => app.unmount())
  return { root, errors, i18n, app }
}
const role = (root, value) => nodes(root).filter(node => node.props.role === value)
const loadedView = defineComponent({ render: () => h('article', 'Loaded content') })

test('loading is deferred until first use and a delayed import has an accessible status', async t => {
  const load = deferred(), state = reactive({ opened: false })
  let calls = 0
  const Lazy = defineRecoverableAsyncComponent(() => { calls++; return load.promise })
  const { root, errors } = mount(t, () => state.opened ? h(Lazy) : null)
  await settle()
  assert.equal(calls, 0)
  state.opened = true
  await wait(220)
  assert.equal(calls, 1)
  assert.equal(role(root, 'status').length, 1)
  assert.match(text(root), /Bereich wird geladen/)
  assert.equal(nodes(root, 'button').length, 0)
  load.resolve(loadedView)
  await settle()
  assert.equal(text(root), 'Loaded content')
  assert.equal(role(root, 'status').length, 0)
  assert.deepEqual(errors, [])
})

test('a failed chunk offers explicit retry; double clicks never repeat device actions', async t => {
  const recovered = deferred()
  let calls = 0, deviceReads = 0, writes = 0, connected = 0
  const Lazy = defineRecoverableAsyncComponent(() => {
    calls++
    return calls === 1 ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : recovered.promise
  })
  const { root, errors } = mount(t, () => h(Lazy, {
    readPhoto: () => deviceReads++, getSession: () => connected++,
    confirmRestore: () => writes++, onRead: () => deviceReads++
  }), 'en')
  await wait(220)
  assert.match(text(root), /This section could not be loaded/)
  assert.equal(role(root, 'alert').length, 1)
  const button = nodes(root, 'button')[0]
  assert.ok(button, 'a failed lazy import must offer a retry button')
  assert.equal(button.props.type, 'button')
  assert.equal(text(button), 'Try again')
  assert.equal(button.props.disabled, undefined)
  assert.equal(calls, 1)
  await settle()
  assert.equal(calls, 1, 'no automatic retry')
  button.props.onClick()
  button.props.onClick()
  await settle()
  assert.equal(calls, 2)
  assert.match(text(root), /Loading section/)
  assert.equal(role(root, 'alert').length, 0)
  recovered.resolve(loadedView)
  await settle()
  assert.equal(text(root), 'Loaded content')
  assert.deepEqual([deviceReads, writes, connected], [0, 0, 0])
  assert.deepEqual(errors, [])
})

test('success keeps props, slots, events, public refs and state while a workspace is hidden', async t => {
  const load = deferred(), exposed = ref(), state = reactive({ hidden: false, label: 'One' })
  let calls = 0, mounts = 0, selections = 0
  const Child = defineComponent({
    props: { label: String }, emits: ['select'],
    setup(props, { slots, emit, expose }) {
      mounts++
      const count = ref(0)
      expose({ increment: () => count.value++, count })
      return () => h('article', [h('b', props.label), h('span', String(count.value)), slots.default?.(),
        h('button', { onClick: () => emit('select', props.label) }, 'Select')])
    }
  })
  const Lazy = defineRecoverableAsyncComponent(() => { calls++; return load.promise })
  const { root, errors } = mount(t, () => h('div', { style: { display: state.hidden ? 'none' : '' } }, [
    h(Lazy, { ref: exposed, label: state.label, onSelect: value => { assert.equal(value, 'Two'); selections++ } },
      { default: () => h('em', 'Passed slot') })
  ]))
  await settle()
  load.resolve({ __esModule: true, default: Child })
  await settle()
  assert.equal(typeof exposed.value.increment, 'function')
  exposed.value.increment()
  state.hidden = true
  state.label = 'Two'
  await nextTick()
  state.hidden = false
  await nextTick()
  assert.equal(exposed.value.count, 1)
  assert.match(text(root), /Two1Passed slot/)
  nodes(root, 'button')[0].props.onClick()
  assert.equal(selections, 1)
  assert.equal(calls, 1)
  assert.equal(mounts, 1)
  assert.deepEqual(errors, [])
})

test('a second failure requires a second explicit retry, including synchronous loader errors', async t => {
  let calls = 0
  const Lazy = defineRecoverableAsyncComponent(() => {
    if (++calls < 3) throw new Error('Temporary chunk failure')
    return Promise.resolve(loadedView)
  })
  const { root, errors } = mount(t, () => h(Lazy))
  await wait(220)
  for (const expected of [1, 2]) {
    assert.equal(calls, expected)
    assert.equal(role(root, 'alert').length, 1)
    assert.equal(text(root).includes('Beende laufende Vorgänge'), expected > 1)
    nodes(root, 'button')[0].props.onClick()
    await settle()
  }
  assert.equal(calls, 3)
  assert.equal(text(root), 'Loaded content')
  assert.deepEqual(errors, [])
})

test('failure and loading messages follow global language and locale/language overrides', async t => {
  const state = reactive({}), load = deferred()
  const Lazy = defineRecoverableAsyncComponent(() => load.promise)
  const { root, i18n } = mount(t, () => h(Lazy, state))
  await wait(220)
  assert.match(text(root), /Bereich wird geladen/)
  i18n.global.locale.value = 'en'
  await nextTick()
  assert.match(text(root), /Loading section/)
  load.reject(new Error('Offline'))
  await settle()
  assert.match(text(root), /This section could not be loaded/)
  assert.doesNotMatch(text(root), /save your results/)
  nodes(root, 'button')[0].props.onClick()
  await settle()
  assert.match(text(root), /save your results before reloading the page/)
  state.language = 'de_DE'
  await nextTick()
  assert.match(text(root), /Dieser Bereich konnte nicht geladen werden/)
  assert.match(text(root), /sichere Ergebnisse, bevor du die Seite neu lädst/)
  assert.equal(text(nodes(root, 'button')[0]), 'Erneut laden')
  state.locale = 'en'
  await nextTick()
  assert.equal(text(nodes(root, 'button')[0]), 'Try again')
  delete state.locale
  delete state.language
  i18n.global.locale.value = 'de_DE'
  await nextTick()
  assert.equal(text(nodes(root, 'button')[0]), 'Erneut laden')
})

test('shared instances and remounts keep one pending import and one explicit retry', async t => {
  const state = reactive({ first: true, second: false }), recovered = deferred()
  let calls = 0, mounts = 0
  const Child = defineComponent({ setup() { mounts++; return () => h('article', 'Ready') } })
  const Lazy = defineRecoverableAsyncComponent(() => ++calls === 1 ? Promise.reject(new Error('Offline')) : recovered.promise)
  const { root, errors } = mount(t, () => h('main', [state.first ? h(Lazy, { key: 'first' }) : null,
    state.second ? h(Lazy, { key: 'second' }) : null]))
  await wait(220)
  state.first = false
  await settle()
  state.first = true
  state.second = true
  await wait(220)
  assert.equal(calls, 1)
  const buttons = nodes(root, 'button')
  assert.equal(buttons.length, 2)
  buttons[0].props.onClick()
  buttons[1].props.onClick()
  await settle()
  assert.equal(calls, 2)
  state.first = false
  await settle()
  recovered.resolve(Child)
  await settle()
  assert.equal(mounts, 1)
  state.first = true
  await settle()
  assert.equal(calls, 2)
  assert.equal(mounts, 2)
  assert.equal(nodes(root, 'article').length, 2)
  assert.deepEqual(errors, [])
})
