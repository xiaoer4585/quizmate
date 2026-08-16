import tls from "node:tls";
import type { AppConfig } from "../config.js";
import { PublicError } from "../errors.js";

type EmailSettingLoader = () => Promise<Record<string, unknown>>;

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function sendSmtpMessage(config: AppConfig, setting: Record<string, unknown>, to: string, subject: string, textBody: string, htmlBody: string): Promise<void> {
  const host = String(setting.smtpHost ?? config.SMTP_HOST ?? "").trim();
  const user = String(setting.smtpUser ?? config.SMTP_USER ?? "").trim();
  const pass = String(setting.smtpPass ?? config.SMTP_PASS ?? "");
  const from = String(setting.smtpFrom ?? config.SMTP_FROM ?? "").trim() || user;
  const port = Number(setting.smtpPort ?? config.SMTP_PORT);
  if (!host || !user || !pass || !from) throw new PublicError("邮件服务尚未配置。", "SMTP_NOT_CONFIGURED", 503);

  const socket = tls.connect({ host, port: Number.isInteger(port) ? port : 465, servername: host, rejectUnauthorized: true });
  socket.setEncoding("utf8");
  socket.setTimeout(15_000);

  let buffer = "";
  const pending: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    while (buffer.includes("\r\n")) {
      const index = buffer.indexOf("\r\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (/^\d{3} /.test(line)) pending.shift()?.resolve(line);
    }
  });
  socket.on("error", (error) => pending.splice(0).forEach((item) => item.reject(error)));
  socket.on("timeout", () => socket.destroy(new Error("SMTP timeout")));

  const read = () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject }));
  const command = async (value: string, expected: string) => {
    socket.write(`${value}\r\n`);
    const response = await read();
    if (!response.startsWith(expected)) throw new Error(`SMTP ${expected} expected`);
  };

  const boundary = `quizmate-${Date.now().toString(16)}`;
  const message = [
    `From: QuizMate <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(textBody, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody, "utf8").toString("base64"),
    `--${boundary}--`,
    "."
  ].join("\r\n");

  try {
    const greeting = await read();
    if (!greeting.startsWith("220")) throw new Error("SMTP greeting rejected");
    await command(`EHLO ${host}`, "250");
    await command("AUTH LOGIN", "334");
    await command(Buffer.from(user).toString("base64"), "334");
    await command(Buffer.from(pass).toString("base64"), "235");
    await command(`MAIL FROM:<${from}>`, "250");
    await command(`RCPT TO:<${to}>`, "250");
    await command("DATA", "354");
    await command(message, "250");
    socket.write("QUIT\r\n");
  } finally {
    socket.end();
  }
}

export function createVerificationCodeSender(config: AppConfig, loadSetting?: EmailSettingLoader) {
  return async (email: string, code: string, purpose: "register" | "reset_password") => {
    const subject = purpose === "register" ? "QuizMate 注册验证码" : "QuizMate 密码重置验证码";
    const setting = loadSetting ? await loadSetting() : {};
    const textBody = `您的 QuizMate 验证码是：${code}。验证码将在 10 分钟后失效，请勿转发。`;
    const htmlBody = `<p>您的 QuizMate 验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码将在 10 分钟后失效，请勿转发。</p>`;
    await sendSmtpMessage(config, setting, email, subject, textBody, htmlBody);
  };
}

export type NotificationSender = (to: string, subject: string, textBody: string, htmlBody: string) => Promise<void>;

export function createNotificationSender(config: AppConfig, loadSetting?: EmailSettingLoader): NotificationSender {
  return async (to, subject, textBody, htmlBody) => {
    const setting = loadSetting ? await loadSetting() : {};
    await sendSmtpMessage(config, setting, to, subject, textBody, htmlBody);
  };
}
