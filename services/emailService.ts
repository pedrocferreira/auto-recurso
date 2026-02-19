export interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const response = await fetch('/auto-api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'AUTO RECURSO', email: 'contato@autorecurso.online' },
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.htmlContent,
      textContent: options.textContent
    })
  });
  if (!response.ok) throw new Error("Erro ao enviar email pelo servidor.");
  return true;
};

export const sendResourceEmail = async (
  customerEmail: string,
  customerName: string,
  resourceContent: string,
  ticketPlate: string
): Promise<boolean> => {
  // Escape HTML (same logic as before, but calling the generic sendEmail)
  const escapedContent = resourceContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #2563eb;">Seu Recurso Está Pronto!</h2>
            <p>Olá ${customerName},</p>
            <p>Seu recurso para o veículo <strong>${ticketPlate}</strong> foi gerado.</p>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; font-family: monospace;">${escapedContent}</div>
        </div>
    `;
  return sendEmail({ to: customerEmail, subject: `✅ Seu Recurso de Multa - ${ticketPlate}`, htmlContent });
};

export const sendCartRecoveryEmail = async (email: string, name: string, plate?: string) => {
  return sendEmail({
    to: email,
    subject: "⏰ Recupere seu Recurso de Multa",
    htmlContent: `<p>Olá ${name}, percebemos que você não terminou...</p>`
  });
};

export const sendPdfEmail = async (
  email: string,
  name: string,
  documentContent: string,
  subject?: string
): Promise<boolean> => {
  const response = await fetch('/auto-api/email/send-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      name,
      documentContent,
      subject
    })
  });
  if (!response.ok) throw new Error("Erro ao enviar PDF por email.");
  return true;
};
