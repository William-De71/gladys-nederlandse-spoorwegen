// -----------------------------------------------------------------------------
// Entry point of the Nederlandse Spoorwegen external integration.
//
// Brings the Dutch trains (NS) into Gladys, through the official API of NS
// (a free personal key from apiportal.ns.nl):
//   - devices: one per followed station, with the next train, the waits, the
//     delay, the platform and the disruptions about the station
//     (src/device.js);
//   - scene triggers: departure soon, train cancelled, train delayed,
//     platform changed, disruption started, disruption over;
//   - scene actions: read the next trains of a station, read its disruptions;
//   - dashboard widgets: departures, disruptions.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Nederlandse Spoorwegen integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
