import nodemailer from "nodemailer";
import { slog } from "./logger.js";

interface EmailUser {
  email: string;
  name?: string;
}

let _transporter: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;

  const host = process.env.QUILLBY_SMTP_HOST;
  const port = parseInt(process.env.QUILLBY_SMTP_PORT ?? "587", 10);
  const user = process.env.QUILLBY_SMTP_USER;
  const pass = process.env.QUILLBY_SMTP_PASS;
  const from = process.env.QUILLBY_SMTP_FROM;

  if (!host || !user || !pass || !from) {
    _transporter = null;
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return _transporter;
}

export async function sendVerificationEmail(user: EmailUser, url: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    slog("warn", "SMTP not configured — verification email not sent", { email: user.email, url });
    return;
  }

  // getTransporter() already verified QUILLBY_SMTP_FROM is set
  const from = process.env.QUILLBY_SMTP_FROM!;

  try {
    await transporter.sendMail({
      from,
      to: user.email,
      subject: "Verify your Quillby account",
      text: `Welcome to Quillby!\n\nClick the link below to verify your email address:\n${url}`,
      html: `<p>Welcome to Quillby!</p><p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p>`,
    });
    slog("info", "Verification email sent", { email: user.email });
  } catch (err) {
    slog("error", "Failed to send verification email", { email: user.email, error: String(err) });
  }
}

export async function sendResetPasswordEmail(user: EmailUser, url: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    slog("warn", "SMTP not configured — password reset email not sent", { email: user.email, url });
    return;
  }

  // getTransporter() already verified QUILLBY_SMTP_FROM is set
  const from = process.env.QUILLBY_SMTP_FROM!;

  try {
    await transporter.sendMail({
      from,
      to: user.email,
      subject: "Reset your Quillby password",
      text: `You requested a password reset.\n\nClick the link below to reset your password:\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<p>You requested a password reset.</p><p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
    });
    slog("info", "Password reset email sent", { email: user.email });
  } catch (err) {
    slog("error", "Failed to send password reset email", { email: user.email, error: String(err) });
  }
}
