import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || 'Support@arcanaadventure.com',
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Resend not connected: missing RESEND_API_KEY and no Replit connector available');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

export async function sendPasswordResetEmail(to: string, resetToken: string, baseUrl: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  
  const senderEmail = fromEmail || 'Support@arcanaadventure.com';
  
  const { data, error } = await client.emails.send({
    from: senderEmail,
    to: [to],
    subject: 'Reset Your Arcana Adventure Password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: 'Inter', Arial, sans-serif;
              background-color: #0c0a09;
              color: #e7e5e4;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #1c1917;
              border: 1px solid #44403c;
              border-radius: 8px;
              padding: 40px;
              color: #e7e5e4;
            }
            .logo {
              text-align: center;
              font-family: 'Cinzel', serif;
              font-size: 28px;
              color: #f59e0b;
              margin-bottom: 30px;
            }
            .content {
              line-height: 1.6;
              margin-bottom: 30px;
              color: #e7e5e4;
            }
            .content p {
              color: #e7e5e4;
              margin: 16px 0;
            }
            .button {
              display: inline-block;
              background-color: #f59e0b;
              color: #0c0a09 !important;
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
            .button:hover {
              background-color: #d97706;
            }
            .button-container {
              text-align: center;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #44403c;
              font-size: 14px;
              color: #a8a29e;
            }
            .footer p {
              color: #a8a29e;
            }
            .warning {
              background-color: #292524;
              border-left: 4px solid #f59e0b;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
              color: #e7e5e4;
            }
          </style>
        </head>
        <body style="background-color: #0c0a09; color: #e7e5e4;">
          <div class="container" style="background-color: #1c1917; color: #e7e5e4;">
            <div class="logo" style="color: #f59e0b;">⚔️ Arcana Adventure</div>
            
            <div class="content" style="color: #e7e5e4;">
              <h2 style="color: #f59e0b;">Password Reset Request</h2>
              <p style="color: #e7e5e4;">We received a request to reset your password for your Arcana Adventure account.</p>
              
              <div class="button-container">
                <a href="${resetLink}" class="button" style="background-color: #f59e0b; color: #0c0a09; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Your Password</a>
              </div>
              
              <div class="warning" style="background-color: #292524; border-left: 4px solid #f59e0b; padding: 12px; color: #e7e5e4;">
                <strong style="color: #e7e5e4;">⚠️ This link expires in 1 hour.</strong><br>
                <span style="color: #e7e5e4;">If you didn't request this password reset, you can safely ignore this email.</span>
              </div>
              
              <p style="color: #e7e5e4;">If the button above doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #f59e0b; font-size: 12px;">${resetLink}</p>
            </div>
            
            <div class="footer" style="border-top: 1px solid #44403c; color: #a8a29e;">
              <p style="color: #a8a29e;">This email was sent from Arcana Adventure.</p>
              <p style="color: #a8a29e;">For security reasons, this link will expire in 1 hour.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
