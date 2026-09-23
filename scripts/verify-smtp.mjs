// Checks connection, TLS and authentication only. Never sends an email.
import nodemailer from "nodemailer";
import { mailConfigSchema } from "../src/lib/mail-config.ts";

const result = mailConfigSchema.safeParse({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ?? "465",
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  from: process.env.SMTP_FROM,
});
if (!result.success) {
  console.error(
    "SMTP configuration is incomplete or invalid. Check the SMTP environment variables.",
  );
  process.exitCode = 1;
} else {
  const v = result.data;
  const transport = nodemailer.createTransport({
    host: v.host,
    port: v.port,
    secure: v.port === 465,
    requireTLS: true,
    auth: { user: v.user, pass: v.password },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await transport.verify();
    console.log(
      "SMTP connection, TLS and authentication verified. No email was sent.",
    );
  } catch (error) {
    const allowed = [
      "EAUTH",
      "EDNS",
      "ECONNECTION",
      "ETIMEDOUT",
      "ESOCKET",
      "ETLS",
    ];
    const code = allowed.includes(error?.code)
      ? error.code
      : "CONNECTION_FAILED";
    console.error(
      `SMTP verification failed (${code}). No credentials or server response were logged.`,
    );
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
