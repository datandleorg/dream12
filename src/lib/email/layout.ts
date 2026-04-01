import { EMAIL_THEME } from "./theme";
import { escapeHtml } from "./escape-html";

export type WrapEmailBodyOptions = {
  innerHtml: string;
  /** Shown in inbox preview; hidden in body. */
  preheader?: string;
  /** <title> for the HTML document. */
  documentTitle: string;
  /** Absolute base URL (no trailing slash), e.g. https://app.example.com */
  appBaseUrl: string;
};

/**
 * Shared Dream12 email shell: navy field, red/gold accents, Bebas + Source Sans 3.
 */
export function wrapEmailBody({
  innerHtml,
  preheader = "",
  documentTitle,
  appBaseUrl,
}: WrapEmailBodyOptions): string {
  const logoUrl = `${appBaseUrl}/brand-logo.png`;
  const safeTitle = escapeHtml(documentTitle);
  const pre = escapeHtml(preheader.slice(0, 140));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="x-ua-compatible" content="ie=edge" />
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&amp;family=Source+Sans+3:wght@400;600;700&amp;display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_THEME.bg};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${EMAIL_THEME.bg};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:28px 16px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:20px;text-align:center;">
            <a href="${escapeHtml(appBaseUrl)}" style="text-decoration:none;display:inline-block;" target="_blank" rel="noopener noreferrer">
              <img src="${escapeHtml(logoUrl)}" width="200" height="auto" alt="Dream12" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;outline:none;" />
            </a>
          </td>
        </tr>
        <tr>
          <td style="height:3px;background:linear-gradient(90deg,${EMAIL_THEME.primary} 0%,${EMAIL_THEME.accent} 50%,${EMAIL_THEME.primary} 100%);border-radius:2px;line-height:3px;font-size:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding-top:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${EMAIL_THEME.card};border:1px solid ${EMAIL_THEME.cardBorder};border-radius:12px;border-collapse:separate;">
              <tr>
                <td style="padding:28px 24px 32px;font-family:'Source Sans 3',Source Sans 3,ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.55;color:${EMAIL_THEME.foreground};">
                  ${innerHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:24px;text-align:center;font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;font-size:12px;line-height:1.5;color:${EMAIL_THEME.muted};">
            Dream12 — Fantasy Cricket League<br />
            <span style="color:${EMAIL_THEME.muted};opacity:0.85;">You received this because you have an account with us.</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
