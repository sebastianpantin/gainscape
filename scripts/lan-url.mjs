import { networkInterfaces } from 'node:os';

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === 'IPv4' && !address.internal)
  .map((address) => `https://${address.address}:5173`);

console.log(
  ['Open on this machine: https://localhost:5173', ...lanAddresses.map((url) => `Open on your phone:   ${url}`)].join(
    '\n',
  ),
);
