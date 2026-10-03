import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Brevo email provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.resetModules();
  });

  async function loadWithBrevo() {
    vi.resetModules();
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.EMAIL_FROM = 'alerts@example.com';
    return import('../src/services/emailService.js');
  }

  it('sends over HTTPS with the API key and verified sender', async () => {
    const fetchMock = vi.fn(async () => new Response('{"messageId":"1"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { isEmailConfigured, sendEmail } = await loadWithBrevo();

    expect(isEmailConfigured()).toBe(true);
    expect(await sendEmail({ to: 'a@example.com, b@example.com', subject: 'Hi', text: 'T', html: '<p>T</p>' })).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body)).toMatchObject({
      sender: { email: 'alerts@example.com' },
      to: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
      subject: 'Hi',
      textContent: 'T',
      htmlContent: '<p>T</p>',
    });
  });

  it('reports failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 })));
    const { sendEmail } = await loadWithBrevo();
    expect(await sendEmail({ to: 'a@example.com', subject: 'Hi', text: 'T' })).toBe(false);
  });
});
