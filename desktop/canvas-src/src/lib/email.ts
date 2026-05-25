import { Resend } from "resend";
import { logger } from "./logger";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FROM = process.env.EMAIL_FROM || "noreply@xinyuai.app";
const FROM_VERIFY = process.env.EMAIL_FROM_VERIFY || "verify@xinyuai.app";

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  locale: string = "en",
) {
  const isZh = locale.startsWith("zh");

  const subject = isZh
    ? "验证您的 XinYu AI 邮箱"
    : "Verify your XinYu AI email";

  const year = new Date().getFullYear();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header with brand accent -->
    <div style="background:linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 100%);padding:36px 32px 28px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 6px;letter-spacing:-0.3px;">XinYu AI</h1>
      <div style="width:40px;height:3px;background:#CCFF00;border-radius:2px;margin:0 auto;"></div>
    </div>

    <!-- Body -->
    <div style="padding:36px 32px 40px;">

      <!-- Icon -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:#f0f7e6;line-height:56px;text-align:center;">
          <span style="font-size:28px;">✉️</span>
        </div>
      </div>

      <h2 style="color:#1a1a1a;font-size:18px;font-weight:600;text-align:center;margin:0 0 12px;">
        ${isZh ? "验证您的邮箱" : "Verify Your Email"}
      </h2>

      <p style="color:#555;font-size:14px;line-height:1.7;text-align:center;margin:0 0 28px;">
        ${isZh
          ? "感谢注册 XinYu AI！<br/>请点击下方按钮验证您的邮箱地址。"
          : "Thanks for signing up for XinYu AI!<br/>Please click the button below to verify your email address."}
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${verifyUrl}" style="display:inline-block;padding:14px 48px;background:#CCFF00;color:#0a0a0a;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">
          ${isZh ? "验证邮箱" : "Verify Email"}
        </a>
      </div>

      <!-- Security notice -->
      <div style="background:#fafafa;border-radius:10px;padding:16px 20px;margin-bottom:0;">
        <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
          ⏱ ${isZh ? "此链接将在 <strong style=\"color:#555;\">1 小时</strong>后过期。" : "This link expires in <strong style=\"color:#555;\">1 hour</strong>."}
          <br/>
          🛡 ${isZh ? "如果您没有注册 XinYu AI，请忽略此邮件。" : "If you didn't sign up for XinYu AI, please ignore this email."}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #eee;padding:20px 32px;text-align:center;">
      <p style="color:#bbb;font-size:11px;margin:0;">
        © ${year} XinYu AI · <a href="https://xinyuai.app" style="color:#bbb;text-decoration:none;">xinyuai.app</a>
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_VERIFY,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error({ error, to }, "Failed to send verification email");
      throw new Error(error.message);
    }

    logger.info({ emailId: data?.id, to }, "Verification email sent");
    return data;
  } catch (err) {
    logger.error({ err, to }, "Verification email send error");
    throw err;
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  locale: string = "en",
) {
  const isZh = locale.startsWith("zh");

  const subject = isZh
    ? "重置您的 XinYu AI 密码"
    : "Reset your XinYu AI password";

  const year = new Date().getFullYear();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header with brand accent -->
    <div style="background:linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 100%);padding:36px 32px 28px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 6px;letter-spacing:-0.3px;">XinYu AI</h1>
      <div style="width:40px;height:3px;background:#CCFF00;border-radius:2px;margin:0 auto;"></div>
    </div>

    <!-- Body -->
    <div style="padding:36px 32px 40px;">

      <!-- Icon -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:#f0f7e6;line-height:56px;text-align:center;">
          <span style="font-size:28px;">🔐</span>
        </div>
      </div>

      <h2 style="color:#1a1a1a;font-size:18px;font-weight:600;text-align:center;margin:0 0 12px;">
        ${isZh ? "重置您的密码" : "Reset Your Password"}
      </h2>

      <p style="color:#555;font-size:14px;line-height:1.7;text-align:center;margin:0 0 28px;">
        ${isZh
          ? "我们收到了重置您账户密码的请求。<br/>点击下方按钮设置新密码。"
          : "We received a request to reset your account password.<br/>Click the button below to set a new one."}
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 48px;background:#CCFF00;color:#0a0a0a;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">
          ${isZh ? "重置密码" : "Reset Password"}
        </a>
      </div>

      <!-- Security notice -->
      <div style="background:#fafafa;border-radius:10px;padding:16px 20px;margin-bottom:0;">
        <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
          ⏱ ${isZh ? "此链接将在 <strong style=\"color:#555;\">1 小时</strong>后过期。" : "This link expires in <strong style=\"color:#555;\">1 hour</strong>."}
          <br/>
          🛡 ${isZh ? "如果您没有请求重置密码，请忽略此邮件，您的账户不会受到影响。" : "If you didn't request this, please ignore this email. Your account is safe."}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #eee;padding:20px 32px;text-align:center;">
      <p style="color:#bbb;font-size:11px;margin:0;">
        © ${year} XinYu AI · <a href="https://xinyuai.app" style="color:#bbb;text-decoration:none;">xinyuai.app</a>
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error({ error, to }, "Failed to send password reset email");
      throw new Error(error.message);
    }

    logger.info({ emailId: data?.id, to }, "Password reset email sent");
    return data;
  } catch (err) {
    logger.error({ err, to }, "Email send error");
    throw err;
  }
}
