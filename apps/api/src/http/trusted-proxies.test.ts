import Fastify from 'fastify';
import { trustedProxiesFromEnv } from '@copalibre/auth';

// The policy main.ts and the events role hand to Fastify, exercised through a
// real Fastify instance: what reaches the rate limits as request.ip.
describe('client address behind the default policy', () => {
  async function clientIp(remoteAddress: string, forwardedFor: string): Promise<string> {
    const app = Fastify({ trustProxy: trustedProxiesFromEnv({}) as string[] });
    app.get('/', (request) => ({ ip: request.ip }));
    const response = await app.inject({
      method: 'GET',
      url: '/',
      remoteAddress,
      headers: { 'x-forwarded-for': forwardedFor },
    });
    await app.close();
    return (response.json() as { ip: string }).ip;
  }

  it('believes the forwarded address from a private-network proxy', async () => {
    await expect(clientIp('172.18.0.5', '198.51.100.7')).resolves.toBe('198.51.100.7');
  });

  it('ignores a forwarded address sent by a public client', async () => {
    await expect(clientIp('198.51.100.9', '10.0.0.1')).resolves.toBe('198.51.100.9');
  });

  it('stops at the first untrusted hop of a forged chain', async () => {
    await expect(clientIp('172.18.0.5', '10.9.9.9, 198.51.100.7')).resolves.toBe('198.51.100.7');
  });
});
