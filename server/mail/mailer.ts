import nodemailer from "nodemailer";
import type { Logger } from "pino";
import type { AppConfig } from "../config";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Collects mail in memory (tests / local development). Never used in staging/production. */
export class OutboxMailer implements Mailer {
  readonly outbox: Mail[] = [];
  constructor(
    private readonly log?: Logger,
    private readonly echo = false,
  ) {}
  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
    // Development convenience: print the message so links can be followed locally.
    if (this.echo) this.log?.info({ mail: { to: mail.to, subject: mail.subject }, body: mail.text }, "dev outbox email");
  }
  last(to?: string): Mail | undefined {
    return [...this.outbox].reverse().find((m) => !to || m.to === to);
  }
}

export class SmtpMailer implements Mailer {
  private readonly transport;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({ url, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 15_000 });
  }
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}

export function createMailer(config: AppConfig, log: Logger): Mailer {
  if (config.mail.smtpUrl) return new SmtpMailer(config.mail.smtpUrl, config.mail.from);
  if (config.hardened) throw new Error("SMTP_URL is required in staging/production");
  return new OutboxMailer(log, config.deployEnv === "development");
}
