// Deployment-time, portal-only networking. Missing configuration never opens
// the scanner: its internal ingress remains mandatory and calls fail closed.
export function scannerNetworkOptions(value) {
  if (!value) return {};
  if (typeof value !== 'string' || value.trim() !== value || !/^projects\/gen-lang-client-0948635471\/locations\/northamerica-northeast1\/connectors\/mi-bucket-[a-z0-9-]+$/.test(value))
    throw new Error('A reviewed dedicated Montreal portal connector is required.');
  return { vpcConnector: value, vpcConnectorEgressSettings: 'ALL_TRAFFIC' };
}
