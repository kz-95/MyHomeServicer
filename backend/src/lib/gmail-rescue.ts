import { google } from 'googleapis';
import { env } from '../config/env';
import { logger } from './logger';

const RESCUE_EMAIL_TO = 'coffeeinveins@gmail.com';

let gmailClient: ReturnType<typeof google.gmail>['users']['messages'] | null = null;

function getGmailClient() {
  if (gmailClient) return gmailClient;
  if (!env.GOOGLE_GMAIL_CLIENT_ID || !env.GOOGLE_GMAIL_CLIENT_SECRET || !env.GOOGLE_GMAIL_REFRESH_TOKEN) {
    return null;
  }
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_GMAIL_CLIENT_ID,
    env.GOOGLE_GMAIL_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: env.GOOGLE_GMAIL_REFRESH_TOKEN });
  gmailClient = google.gmail({ version: 'v1', auth: oauth2Client }).users.messages;
  return gmailClient;
}

export async function sendRescueEmail(subject: string, body: string): Promise<void> {
  const client = getGmailClient();
  if (!client) {
    console.log(`\n[DEV GMAIL FALLBACK] To: ${RESCUE_EMAIL_TO}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}\n`);
    return;
  }

  const utf8Subject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: MyHomeServicer Security <${env.GOOGLE_GMAIL_CLIENT_ID?.split('@')[0] || 'noreply'}@gmail.com>`,
    `To: ${RESCUE_EMAIL_TO}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ];
  const encoded = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    await client.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
    logger.info('Super admin rescue email sent via Gmail API');
  } catch (err) {
    logger.error('Failed to send rescue email via Gmail API', { error: (err as Error).message });
    console.log(`\n[GMAIL API FAILED — DEV FALLBACK] To: ${RESCUE_EMAIL_TO}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}\n`);
  }
}
