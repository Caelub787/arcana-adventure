import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
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
  
  const senderEmail = fromEmail || 'caleb@arcanaadventure.com';
  
  const { data, error } = await client.emails.send({
    from: senderEmail,
    to: [to],
    subject: 'Reset Your Arcana Adventures Password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: 'Inter', Arial, sans-serif;
              background-color: #0f0f1a;
              color: #e0e0e0;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #1a1a2e;
              border: 1px solid #2d2d44;
              border-radius: 8px;
              padding: 40px;
            }
            .logo {
              text-align: center;
              font-family: 'Cinzel', serif;
              font-size: 28px;
              color: #d4af37;
              margin-bottom: 30px;
            }
            .content {
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              background-color: #d4af37;
              color: #0f0f1a;
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
            .button-container {
              text-align: center;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #2d2d44;
              font-size: 14px;
              color: #888;
            }
            .warning {
              background-color: #2d1f1f;
              border-left: 4px solid #d4af37;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">⚔️ Arcana Adventures</div>
            
            <div class="content">
              <h2 style="color: #d4af37;">Password Reset Request</h2>
              <p>We received a request to reset your password for your Arcana Adventures account.</p>
              
              <div class="button-container">
                <a href="${resetLink}" class="button">Reset Your Password</a>
              </div>
              
              <div class="warning">
                <strong>⚠️ This link expires in 1 hour.</strong><br>
                If you didn't request this password reset, you can safely ignore this email.
              </div>
              
              <p>If the button above doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #d4af37; font-size: 12px;">${resetLink}</p>
            </div>
            
            <div class="footer">
              <p>This email was sent from Arcana Adventures.</p>
              <p>For security reasons, this link will expire in 1 hour.</p>
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
