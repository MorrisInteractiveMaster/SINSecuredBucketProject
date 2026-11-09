import assert from 'node:assert/strict';
if(process.versions.node.split('.')[0]!=='22')throw new Error('Use Node 22 for the deploy-package verification.');
// Discovery only. Demo project, no invocation, no credentials or network access required.
process.env.GCLOUD_PROJECT='demo-mi-sin-portal';
const functions=await import('../.deploy/functions/index.mjs');
assert.deepEqual(Object.keys(functions),['miSinSynthetic']);
const endpoint=functions.miSinSynthetic.__endpoint;
assert.equal(endpoint.platform,'gcfv2');assert.equal(endpoint.availableMemoryMb,256);assert.equal(endpoint.maxInstances,1);assert.equal(endpoint.minInstances,0);assert.equal(endpoint.concurrency,1);assert.equal(endpoint.serviceAccountEmail,'mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com');
console.log('PASS: isolated deploy package loads in Node 22 with one bounded Gen 2 HTTPS endpoint and dedicated runtime SA. No cloud invocation.');
