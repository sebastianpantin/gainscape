import { networkInterfaces } from 'node:os';

const webPort = process.env.GAINSCAPE_WEB_PORT ?? 5173;

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === 'IPv4' && !address.internal)
  .map((address) => `https://${address.address}:${webPort}`);

console.log(
  [
    `Open on this machine: https://localhost:${webPort}`,
    ...lanAddresses.map((url) => `Open on your phone:   ${url}`),
  ].join('\n'),
);
