/**
 * Swagger UI for api/openapi.yaml, served with swagger-ui-express. Development only.
 *
 *   pnpm doc:api    runs this file with Node (native TypeScript) in watch mode
 *
 * Every operation gets one LIVE/OFFLINE badge per architecture from its `x-status` map, and
 * a header shows how many operations each architecture has made LIVE.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { parse } from 'yaml'

const PORT = Number(process.env.PORT ?? 8090)
const SPEC_PATH = fileURLToPath(new URL('./openapi.yaml', import.meta.url))

/**
 * Browser code, injected with `customJsStr`. It runs before Swagger's window.onload init, so
 * it can wrap SwaggerUIBundle and register the x-status plugin without a build step.
 */
const browserScript = /* js */ `
(function () {
  var SHORT = { monolith: 'Mono', microservices: 'Micro', hybrid: 'Hybrid' }
  var METHODS = ['get', 'put', 'post', 'patch', 'delete']

  function entries(raw) {
    var value = raw && typeof raw.toJS === 'function' ? raw.toJS() : raw
    if (typeof value === 'string') return [['', value]]
    return value && typeof value === 'object' ? Object.entries(value) : []
  }

  function XStatusPlugin(system) {
    var h = system.React.createElement
    function badges(raw) {
      var children = entries(raw).map(function (e) {
        return h('span', {
          key: e[0] || 'all',
          className: 'mh-badge',
          'data-status': e[1] === 'LIVE' ? 'live' : 'offline',
          title: e[0] ? e[0] + ': ' + e[1] : e[1],
        }, e[0] ? h('span', { className: 'mh-badge__arch' }, SHORT[e[0]] || e[0]) : null, e[1])
      })
      return h.apply(null, ['span', { className: 'mh-badges' }].concat(children))
    }
    return {
      wrapComponents: {
        // operationProps.op stays empty until an operation is expanded (Swagger resolves lazily),
        // so x-status is read from the raw spec by path and method.
        OperationSummaryPath: function (Original, sys) {
          return function (props) {
            var path = props.operationProps.get('path')
            var method = props.operationProps.get('method')
            var status = sys.specSelectors.specJson().getIn(['paths', path, method, 'x-status'])
            return h(sys.React.Fragment, null, h(Original, props), badges(status))
          }
        },
      },
    }
  }

  var original = window.SwaggerUIBundle
  window.SwaggerUIBundle = Object.assign(function (options) {
    options.plugins = (options.plugins || []).concat([XStatusPlugin])
    return original(options)
  }, original)

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  window.addEventListener('DOMContentLoaded', function () {
    fetch('/openapi.json').then(function (r) { return r.json() }).then(function (spec) {
      var ops = []
      Object.values(spec.paths).forEach(function (item) {
        METHODS.forEach(function (m) { if (item[m]) ops.push(item[m]) })
      })
      var header = el('header', 'mh-coverage')
      Object.entries(spec['x-architectures'] || {}).forEach(function (a) {
        var live = ops.filter(function (op) { return op['x-status'] && op['x-status'][a[0]] === 'LIVE' }).length
        var card = el('article', 'mh-card')
        card.dataset.arch = a[0]
        var count = el('p', 'mh-card__count', String(live))
        count.append(el('span', 'mh-card__total', ' / ' + ops.length + ' live'))
        var bar = el('div', 'mh-card__bar')
        var fill = el('div', 'mh-card__fill')
        fill.style.width = (live / ops.length) * 100 + '%'
        bar.append(fill)
        card.append(el('p', 'mh-card__name', a[1].label), count, bar)
        header.append(card)
      })
      document.getElementById('swagger-ui').before(header)
    })
  })
})()
`

const css = /* css */ `
  .swagger-ui .topbar { display: none; }
  body { margin: 0; background: #f4f6fa; }
  #swagger-ui { max-width: 1200px; margin: 0 auto 48px; background: #fff; border: 1px solid #d9e1ec; border-radius: 16px; }
  .swagger-ui .opblock .opblock-summary { flex-wrap: wrap; row-gap: 4px; }

  .mh-coverage { max-width: 1200px; margin: 0 auto; padding: 24px 0 16px; display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); font-family: system-ui, sans-serif; color: #142238; }
  .mh-card { --arch: #1d4a8f; background: #fff; border: 1px solid #d9e1ec; border-radius: 14px; padding: 14px 16px; }
  .mh-card[data-arch='monolith'] { --arch: #2f5ba8; }
  .mh-card[data-arch='microservices'] { --arch: #0e7f81; }
  .mh-card[data-arch='hybrid'] { --arch: #b5561f; }
  .mh-card p { margin: 0; }
  .mh-card__name { color: var(--arch); font-weight: 600; }
  .mh-card__count { margin-top: 4px !important; font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .mh-card__total { color: #5a6a82; font-size: 0.95rem; font-weight: 500; }
  .mh-card__bar { height: 6px; margin-top: 8px; overflow: hidden; border-radius: 99px; background: #e7eef8; }
  .mh-card__fill { height: 100%; border-radius: 99px; background: var(--arch); }

  .mh-badges { display: inline-flex; flex-wrap: wrap; gap: 4px; margin-left: 10px; vertical-align: middle; }
  .mh-badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px;
    font: 700 10.5px/18px system-ui, sans-serif; letter-spacing: 0.02em; white-space: nowrap; }
  .mh-badge[data-status='live'] { background: rgba(29, 127, 84, 0.14); color: #1d7f54; }
  .mh-badge[data-status='offline'] { background: rgba(107, 118, 134, 0.14); color: #5d6878; }
  .mh-badge__arch { font-weight: 500; opacity: 0.8; }
`

/** Read the spec on every request, so editing x-status shows up on the next refresh. */
async function loadSpec(): Promise<unknown> {
  return parse(await readFile(SPEC_PATH, 'utf8'))
}

const app = express()

app.get('/openapi.json', async (_req, res, next) => {
  try {
    res.json(await loadSpec())
  } catch (err) {
    next(err)
  }
})

app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').sendFile(SPEC_PATH))

// swagger-ui-express 5 supports `customJsStr`; @types/swagger-ui-express has not caught up.
const uiOptions: swaggerUi.SwaggerUiOptions & { customJsStr: string } = {
  customSiteTitle: 'Z API',
  customCss: css,
  customJsStr: browserScript,
  swaggerOptions: {
    url: '/openapi.json',
    docExpansion: 'list',
    defaultModelsExpandDepth: 0,
    filter: true,
    displayRequestDuration: true,
    persistAuthorization: true,
  },
}

app.use('/', swaggerUi.serve, swaggerUi.setup(undefined, uiOptions))

app.listen(PORT, () => {
  console.log(`Z API docs → http://localhost:${PORT}`)
})
