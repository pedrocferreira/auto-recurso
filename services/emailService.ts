export interface EmailOptions {
    to: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    attachmentContent?: string;
    attachmentName?: string;
}

const BREVO_API_URL = '/api-brevo/v3/smtp/email';

const getAPIKey = () => {
    return import.meta.env.VITE_BREVO_API_KEY;
};

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
    console.log('🔵 [EmailService] Starting sendEmail...');
    const apiKey = getAPIKey();

    console.log('🔵 [EmailService] API Key check:', apiKey ? 'Found' : 'NOT FOUND');

    if (!apiKey) {
        console.error('❌ [EmailService] BREVO_API_KEY not configured');
        throw new Error('Serviço de email não configurado');
    }

    try {
        console.log('🔵 [EmailService] Preparing email data for:', options.to);

        const emailData: any = {
            sender: {
                name: 'AUTO RECURSO',
                email: 'contato@autorecurso.online'
            },
            to: [
                {
                    email: options.to,
                    name: options.to.split('@')[0]
                }
            ],
            subject: options.subject,
            htmlContent: options.htmlContent
        };

        if (options.textContent) {
            emailData.textContent = options.textContent;
        }

        console.log('🔵 [EmailService] Email data prepared:', {
            to: options.to,
            subject: options.subject,
            hasHtml: !!options.htmlContent,
            hasText: !!options.textContent
        });

        console.log('🔵 [EmailService] Sending request to Brevo API...');
        const response = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        console.log('🔵 [EmailService] Response status:', response.status);

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ [EmailService] Brevo API error:', error);
            throw new Error(`Brevo API error: ${JSON.stringify(error)}`);
        }

        const result = await response.json();
        console.log('✅ [EmailService] Email sent successfully!', result);
        return true;
    } catch (error) {
        console.error('❌ [EmailService] Error sending email:', error);
        throw error;
    }
};

export const sendResourceEmail = async (
    customerEmail: string,
    customerName: string,
    resourceContent: string,
    ticketPlate: string
): Promise<boolean> => {
    // Escape HTML in resource content
    const escapedContent = resourceContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; }
        .header { background: #2563eb; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .resource-box { background: #f8fafc; border: 2px solid #e2e8f0; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .resource-content { font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.8; white-space: pre-wrap; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
        .steps { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .steps ol { margin: 10px 0; padding-left: 20px; }
        .steps li { margin: 10px 0; }
        .footer { text-align: center; padding: 20px; background: #f8fafc; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Seu Recurso Está Pronto!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Veículo ${ticketPlate}</p>
        </div>
        
        <div class="content">
          <p>Olá <strong>${customerName}</strong>,</p>
          <p>Seu recurso de multa foi gerado com sucesso! Abaixo está o conteúdo completo do documento.</p>
          
          <div class="alert">
            <strong>⚠️ Importante:</strong> Copie todo o texto abaixo, cole em um editor de texto (Word, Google Docs, etc.), revise, imprima, assine e protocole junto ao órgão autuador.
          </div>

          <div class="steps">
            <strong>📋 Próximos Passos:</strong>
            <ol>
              <li><strong>Copie o texto:</strong> Selecione todo o conteúdo abaixo e copie (Ctrl+C ou Cmd+C)</li>
              <li><strong>Cole em um editor:</strong> Abra Word, Google Docs ou outro editor e cole o texto</li>
              <li><strong>Revise:</strong> Verifique se todos os dados estão corretos</li>
              <li><strong>Imprima e assine:</strong> Imprima o documento e assine no final</li>
              <li><strong>Protocole:</strong> Entregue no órgão autuador dentro do prazo</li>
            </ol>
          </div>

          <div class="resource-box">
            <h3 style="margin-top: 0;">📄 Conteúdo do Recurso</h3>
            <div class="resource-content">${escapedContent}</div>
          </div>

          <p style="text-align: center; margin-top: 30px;">
            <strong>Boa sorte com seu recurso!</strong>
          </p>
        </div>
        
        <div class="footer">
          <p><strong>© 2026 AUTO RECURSO</strong></p>
          <p>Inteligência Artificial para Condutores</p>
          <p style="margin-top: 10px;">Este é um email automático, por favor não responda.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    const textContent = `
Olá ${customerName},

Seu recurso de multa para o veículo ${ticketPlate} foi gerado com sucesso!

CONTEÚDO DO RECURSO:
${'-'.repeat(80)}

${resourceContent}

${'-'.repeat(80)}

PRÓXIMOS PASSOS:
1. Copie todo o texto acima
2. Cole em um editor de texto (Word, Google Docs, etc.)
3. Revise os dados
4. Imprima e assine
5. Protocole junto ao órgão autuador dentro do prazo

Boa sorte com seu recurso!

© 2026 AUTO RECURSO
  `;

    return sendEmail({
        to: customerEmail,
        subject: `✅ Seu Recurso de Multa - Veículo ${ticketPlate}`,
        htmlContent,
        textContent
    });
};

export const sendCartRecoveryEmail = async (
    customerEmail: string,
    customerName: string,
    ticketPlate?: string
): Promise<boolean> => {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .highlight { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; padding: 20px; background: #f8fafc; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Seu Recurso Está Quase Pronto!</h1>
        </div>
        
        <div class="content">
          <p>Olá <strong>${customerName}</strong>,</p>
          <p>Notamos que você começou a gerar seu recurso de multa${ticketPlate ? ` para o veículo <strong>${ticketPlate}</strong>` : ''}, mas não finalizou o processo.</p>
          
          <div class="highlight">
            <strong>🎯 Não perca essa oportunidade!</strong><br>
            Complete seu recurso agora e tenha mais chances de cancelar sua multa.
          </div>

          <p><strong>Por que finalizar agora?</strong></p>
          <ul>
            <li>✅ Recurso gerado por IA especializada em trânsito</li>
            <li>✅ Argumentos jurídicos sólidos e personalizados</li>
            <li>✅ Processo rápido - menos de 5 minutos</li>
            <li>✅ Receba por email e protocole imediatamente</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://autorecurso.online'}" class="button">
              FINALIZAR MEU RECURSO AGORA
            </a>
          </div>

          <p style="font-size: 14px; color: #64748b;">
            Tem dúvidas? Estamos aqui para ajudar!
          </p>
        </div>
        
        <div class="footer">
          <p><strong>© 2026 AUTO RECURSO</strong></p>
          <p>Inteligência Artificial para Condutores</p>
        </div>
      </div>
    </body>
    </html>
  `;

    const textContent = `
Olá ${customerName},

Notamos que você começou a gerar seu recurso de multa${ticketPlate ? ` para o veículo ${ticketPlate}` : ''}, mas não finalizou o processo.

🎯 NÃO PERCA ESSA OPORTUNIDADE!
Complete seu recurso agora e tenha mais chances de cancelar sua multa.

Por que finalizar agora?
✅ Recurso gerado por IA especializada em trânsito
✅ Argumentos jurídicos sólidos e personalizados
✅ Processo rápido - menos de 5 minutos
✅ Receba por email e protocole imediatamente

Acesse: ${typeof window !== 'undefined' ? window.location.origin : 'https://autorecurso.online'}

© 2026 AUTO RECURSO
  `;

    return sendEmail({
        to: customerEmail,
        subject: `⏰ Complete seu Recurso de Multa${ticketPlate ? ` - ${ticketPlate}` : ''}`,
        htmlContent,
        textContent
    });
};
