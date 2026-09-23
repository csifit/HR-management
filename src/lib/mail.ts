import "server-only";
import nodemailer from "nodemailer";
import { mailConfigSchema } from "./mail-config";
export function mailConfig() {
  return mailConfigSchema.safeParse({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ?? "465",
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? "admin@mkdir.space",
  });
}
export async function sendEmployeeDocument({
  recipient,
  filename,
  bytes,
  company,
}: {
  recipient: string;
  filename: string;
  bytes: Uint8Array;
  company: string;
}): Promise<"accepted" | "failed" | "uncertain"> {
  const config = mailConfig();
  if (!config.success) return "failed";
  const v = config.data;
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
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: { name: company, address: v.from },
      to: recipient,
      subject: "Document de la angajator / Document from your employer",
      text: `${company}\n\nAveți un document confidențial de la angajator în atașament.\nA confidential document from your employer is attached.\n\nAcest mesaj nu confirmă efectuarea unei plăți. / This message does not confirm a payment.`,
      attachments: [
        {
          filename,
          content: Buffer.from(bytes),
          contentType: "application/pdf",
        },
      ],
    });
    return result.accepted.length === 1 ? "accepted" : "failed";
  } catch (error) {
    // Timeouts after DATA may mean the server accepted the message. Never retry automatically.
    const e = error as { code?: string; responseCode?: number };
    return (e.responseCode && e.responseCode >= 400) ||
      ["EAUTH", "EDNS", "ECONNECTION"].includes(e.code ?? "")
      ? "failed"
      : "uncertain";
  } finally {
    transport.close();
  }
}
