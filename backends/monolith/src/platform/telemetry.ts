import 'dotenv/config'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { config } from './config.js'
import { register } from 'node:module'

register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
export const telemetry = new NodeSDK({
  serviceName: config.OTEL_SERVICE_NAME,
  traceExporter: new OTLPTraceExporter({ url: config.OTEL_EXPORTER }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
})

telemetry.start()
