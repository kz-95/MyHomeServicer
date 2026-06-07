import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!transporter && env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject} | Body: ${html}`);
    return;
  }
  await t.sendMail({
    from: env.SMTP_FROM || 'noreply@myhomeservicer.com',
    to, subject, html,
  });
}
