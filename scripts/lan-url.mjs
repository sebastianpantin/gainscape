import { networkInterfaces } from 'node:os';
import { previewPort, webPort } from '../web/build/ports.ts';

const port = process.argv.includes('--preview') ? previewPort() : webPort();

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === 'IPv4' && !address.internal)
  .map((address) => `https://${address.address}:${port}`);

console.log(
  [
    `Open on this machine: https://localhost:${port}`,
    ...lanAddresses.map((url) => `Open on your phone:   ${url}`),
  ].join('\n'),
);
