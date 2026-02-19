import assert from 'node:assert/strict'
import { getMidiClient, clearMidiClientCache } from '../../src/api-server/client-factory'
import { LocalClient } from '../../src/api-server/local-client'
import { RemoteClient } from '../../src/api-server/remote-client'

function testFactorySelectionAndCaching(): void {
  clearMidiClientCache()

  const localA = getMidiClient('local', 19001)
  const localB = getMidiClient('local', 19001)
  const localC = getMidiClient('local', 19002)

  assert.ok(localA instanceof LocalClient)
  assert.ok(localB instanceof LocalClient)
  assert.ok(localC instanceof LocalClient)
  assert.equal(localA, localB)
  assert.notEqual(localA, localC)

  const remoteA = getMidiClient('http://localhost:3010', 19001)
  const remoteB = getMidiClient('http://localhost:3010', 19002)
  const remoteC = getMidiClient('http://localhost:3011', 19001)

  assert.ok(remoteA instanceof RemoteClient)
  assert.ok(remoteB instanceof RemoteClient)
  assert.ok(remoteC instanceof RemoteClient)
  assert.equal(remoteA, remoteB)
  assert.notEqual(remoteA, remoteC)
}

function main(): void {
  testFactorySelectionAndCaching()
  console.log('client-factory tests passed')
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}

