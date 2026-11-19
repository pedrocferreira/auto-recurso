#!/usr/bin/env python3
"""
Gerador de Relatório de Auditoria de Segurança — AutoRecurso
Uso: python3 generate_report.py
Dependências: reportlab, matplotlib (instalar via pip)
"""

import os
import io
import textwrap
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, HRFlowable, KeepTogether
)
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics import renderPDF

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def esc(text):
    """Escape HTML special chars for ReportLab Paragraph."""
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ──────────────────── CORES ────────────────────
CORES = {
    'critica': '#B91C1C',
    'alta': '#EA580C',
    'media': '#D97706',
    'baixa': '#2563EB',
    'informativa': '#6B7280',
    'forte': '#059669',
}

COR_HEX = {
    'critica': colors.HexColor('#B91C1C'),
    'alta': colors.HexColor('#EA580C'),
    'media': colors.HexColor('#D97706'),
    'baixa': colors.HexColor('#2563EB'),
    'informativa': colors.HexColor('#6B7280'),
    'forte': colors.HexColor('#059669'),
}

BADGE_BG = {
    'critica': colors.HexColor('#FEE2E2'),
    'alta': colors.HexColor('#FFEDD5'),
    'media': colors.HexColor('#FEF3C7'),
    'baixa': colors.HexColor('#DBEAFE'),
    'informativa': colors.HexColor('#F3F4F6'),
}

# ──────────────────── ACHADOS ────────────────────

achados = [
    # CAT 1 — Banco sem tranca
    {
        'cat': '1. Banco sem Tranca',
        'sev': 'alta',
        'arquivo': 'server/index.ts',
        'linhas': '502-509',
        'titulo': 'Rota register-resource sem autenticação',
        'descricao': (
            'POST /auto-api/admin/register-resource NÃO usa authMiddleware. '
            'Qualquer pessoa pode inserir recursos falsos no banco.'
        ),
        'trecho': "app.post('/auto-api/admin/register-resource', (req, res) => { ... })",
        'impacto': 'Inserção arbitrária de dados no banco; poluição do dashboard admin.',
    },
    {
        'cat': '1. Banco sem Tranca',
        'sev': 'alta',
        'titulo': 'Rota analytics/event sem autenticação',
        'arquivo': 'server/index.ts',
        'linhas': '492-500',
        'descricao': (
            'POST /auto-api/analytics/event aceita qualquer payload sem token. '
            'Um atacante pode injetar eventos falsos (payment_completed, etc.) '
            'que inflam métricas de receita e distorcem o dashboard.'
        ),
        'trecho': "app.post('/auto-api/analytics/event', (req, res) => { addEvent(req.body); ... })",
        'impacto': 'Fraude de métricas; o admin vê receita fictícia e toma decisões erradas.',
    },
    {
        'cat': '1. Banco sem Tranca',
        'sev': 'media',
        'titulo': 'Busca de recursos por CPF/placa/email sem autenticação',
        'arquivo': 'server/index.ts',
        'linhas': '512-525',
        'descricao': (
            'POST /auto-api/resource/recover permite buscar recursos de QUALQUER '
            'cliente informando CPF, e-mail ou placa. Não há rate-limiting nem verificação '
            'de que o chamador é o dono dos dados.'
        ),
        'trecho': "app.post('/auto-api/resource/recover', (req, res) => { const { query } = req.body; ... })",
        'impacto': 'Enumeração de dados pessoais (LGPD). Permite descobrir CPFs, nomes e documentos de outros clientes.',
    },

    # CAT 2 — Permissão no navegador
    {
        'cat': '2. Permissão Definida no Navegador',
        'sev': 'alta',
        'titulo': 'Bypass de pagamento via parâmetro dev=true / email com "test"',
        'arquivo': 'server/index.ts',
        'linhas': '396-405',
        'descricao': (
            'GET /auto-api/payment/verify/:email auto-aprova pagamento se '
            'req.query.dev === "true" OU se o email contém "teste"/"test"/"dev". '
            'Em produção (APP_MODE != dev), o parâmetro ?dev=true AINDA funciona. '
            'Um atacante usa email "teste@x.com" ou ?dev=true para obter PAID sem pagar.'
        ),
        'trecho': (
            "const isDev = process.env.APP_MODE === 'dev' || "
            "req.query.dev === 'true' || "
            "email.toLowerCase().includes('teste') || ..."
        ),
        'impacto': 'Bypass completo do fluxo de pagamento; perda de receita direta.',
    },

    # CAT 3 — IDOR
    {
        'cat': '3. IDOR',
        'sev': 'media',
        'titulo': 'Verificação de pagamento por email sem autenticação',
        'arquivo': 'server/index.ts',
        'linhas': '391-452',
        'descricao': (
            'GET /auto-api/payment/verify/:email consulta status de pagamento '
            'de qualquer email. Não requer autenticação. Permite enumerar '
            'quais emails já pagaram.'
        ),
        'trecho': "app.get('/auto-api/payment/verify/:email', async (req, res) => { ... })",
        'impacto': 'Exposição de informação de pagamento de terceiros.',
    },

    # CAT 4 — Chaves expostas
    {
        'cat': '4. Chaves Expostas',
        'sev': 'critica',
        'titulo': 'JWT_SECRET hardcoded com valor default inseguro',
        'arquivo': 'server/index.ts',
        'linhas': '97',
        'descricao': (
            "JWT_SECRET recebe fallback 'supersecretkey_change_me_in_production'. "
            "Se a variável de ambiente não for definida (ou for esquecida), "
            "TODOS os tokens admin podem ser forjados por qualquer pessoa."
        ),
        'trecho': "const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_me_in_production';",
        'impacto': 'Forja de token admin → acesso total ao painel administrativo.',
    },
    {
        'cat': '4. Chaves Expostas',
        'sev': 'critica',
        'titulo': 'Chaves de API reais nos arquivos .env (no disco do projeto)',
        'arquivo': '.env + server/.env',
        'linhas': '1-12 / 1-9',
        'descricao': (
            'Ambos os arquivos .env contêm chaves REAIS de produção: '
            'GEMINI_API_KEY (AIzaSy…), BREVO_API_KEY (xkeysib-…), '
            'KIWIFY_CLIENT_SECRET, ADMIN_PASSWORD=admin123, JWT_SECRET. '
            'Embora estejam no .gitignore, qualquer acesso ao servidor expõe tudo. '
            'Além disso, o .env.example contém uma chave real do AbacatePay.'
        ),
        'trecho': (
            "GEMINI_API_KEY=AIzaSyA3pJn...\n"
            "ADMIN_PASSWORD=admin123\n"
            "JWT_SECRET=supersecretkey_change_me_in_production"
        ),
        'impacto': 'Comprometimento de todas as APIs externas e acesso admin.',
    },
    {
        'cat': '4. Chaves Expostas',
        'sev': 'alta',
        'titulo': 'ADMIN_PASSWORD trivial (admin123)',
        'arquivo': 'server/.env',
        'linhas': '3',
        'descricao': (
            'A senha de admin é "admin123", um dos valores mais comuns em '
            'ataques de dicionário. Não há proteção contra brute-force no endpoint de login.'
        ),
        'trecho': "ADMIN_PASSWORD=admin123",
        'impacto': 'Login admin trivial por força bruta ou tentativa direta.',
    },
    {
        'cat': '4. Chaves Expostas',
        'sev': 'alta',
        'titulo': 'Chave AbacatePay real no .env.example (versionado no git)',
        'arquivo': '.env.example',
        'linhas': '4',
        'descricao': (
            '.env.example está rastreado no git e contém '
            'VITE_ABACATE_PAY_API_KEY=abc_dev_kqAuKtPpgq5XgUwRNCggq0BQ. '
            'Mesmo sendo "dev", é uma credencial real exposta publicamente.'
        ),
        'trecho': "VITE_ABACATE_PAY_API_KEY=abc_dev_kqAuKtPpgq5XgUwRNCggq0BQ",
        'impacto': 'Chave de gateway de pagamento exposta no repositório.',
    },
    {
        'cat': '4. Chaves Expostas',
        'sev': 'alta',
        'titulo': 'Senha admin commitada no histórico git (Admin.tsx)',
        'arquivo': 'Admin.tsx (histórico git)',
        'linhas': 'commit cdcfff7 / 687d0b2',
        'descricao': (
            'O histórico git contém commits com ADMIN_PASSWORD hardcoded: '
            '"admin123" e depois "9cce22f2". Ambas as senhas são recuperáveis '
            'por qualquer pessoa com acesso ao repositório.'
        ),
        'trecho': "const ADMIN_PASSWORD = 'admin123'; → '9cce22f2';",
        'impacto': 'Exposição permanente de senhas no histórico do repositório.',
    },
    {
        'cat': '4. Chaves Expostas',
        'sev': 'media',
        'titulo': 'Ausência de validação de startup para segredos default',
        'arquivo': 'server/index.ts',
        'linhas': '97',
        'descricao': (
            'O servidor inicia sem verificar se JWT_SECRET e ADMIN_PASSWORD '
            'são valores default. Deveria rejeitar iniciar com valores inseguros.'
        ),
        'trecho': "const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_me_in_production';",
        'impacto': 'Deploy acidental em produção com segredos fracos.',
    },
    {
        'cat': '4. Chaves Expostas',
        'sev': 'media',
        'titulo': 'URL de checkout Kiwify hardcoded no código-fonte',
        'arquivo': 'server/index.ts + services/paymentService.ts',
        'linhas': '383 / 3',
        'descricao': (
            'A URL de checkout "https://pay.kiwify.com.br/YtpRqSE" está '
            'hardcoded no backend e no frontend. Embora não seja um segredo, '
            'dificulta rotação e permite identificar o produto.'
        ),
        'trecho': "const checkoutUrl = `https://pay.kiwify.com.br/YtpRqSE`;",
        'impacto': 'Baixo; mas viola princípio de configuração externalizada.',
    },

    # CAT 5 — XSS
    {
        'cat': '5. Inputs sem Tratamento (XSS)',
        'sev': 'alta',
        'titulo': 'Injeção de HTML em emails via template literal (nome do cliente)',
        'arquivo': 'server/index.ts',
        'linhas': '605, 658',
        'descricao': (
            'Nas rotas /auto-api/email/send-pdf e /auto-api/email/checkout, '
            'o nome do cliente (${name}) é interpolado diretamente no htmlContent '
            'do email SEM escape. Um atacante pode usar um nome como '
            '"<script>alert(1)</script>" ou "<img src=x onerror=...>" '
            'para injetar HTML/JS no corpo do email.'
        ),
        'trecho': '<p>Olá <strong>${name}</strong>,</p>',
        'impacto': 'XSS em clientes de email que renderizam HTML; phishing sofisticado.',
    },
    {
        'cat': '5. Inputs sem Tratamento (XSS)',
        'sev': 'alta',
        'titulo': 'Proxy aberto de email — /auto-api/email/send repassa body inteiro',
        'arquivo': 'server/index.ts',
        'linhas': '528-545',
        'descricao': (
            'POST /auto-api/email/send faz JSON.stringify(req.body) e envia '
            'direto para a API do Brevo sem autenticação nem sanitização. '
            'Qualquer pessoa pode enviar emails arbitrários usando a chave Brevo do projeto.'
        ),
        'trecho': "body: JSON.stringify(req.body)",
        'impacto': 'Abuso da API de email para spam/phishing; consumo da cota Brevo; reputação do domínio.',
    },
    {
        'cat': '5. Inputs sem Tratamento (XSS)',
        'sev': 'media',
        'titulo': 'checkoutUrl controlada pelo cliente em email de checkout',
        'arquivo': 'server/index.ts',
        'linhas': '649, 662',
        'descricao': (
            'Na rota /auto-api/email/checkout, o campo checkoutUrl vem do '
            'req.body e é inserido diretamente como href no email: '
            'href="${checkoutUrl}". Um atacante pode enviar uma URL javascript: '
            'ou de phishing que será renderizada no email do cliente.'
        ),
        'trecho': '<a href="${checkoutUrl}" ...>Concluir Pagamento</a>',
        'impacto': 'Phishing via email com URL controlada pelo atacante.',
    },
    {
        'cat': '5. Inputs sem Tratamento (XSS)',
        'sev': 'media',
        'titulo': 'Dados pessoais (PII) no data.json legado versionável',
        'arquivo': 'server/data.json',
        'linhas': '8-12',
        'descricao': (
            'data.json contém dados pessoais reais (nome, CPF, email, telefone, placa) '
            'de clientes em texto claro. Não está no .gitignore.'
        ),
        'trecho': '"customerName": "PEDRO DA COSTA FERREIRA", "customerCpf": "01414397003"',
        'impacto': 'Violação de LGPD; dados pessoais expostos em arquivo não protegido.',
    },
]

pontos_fortes = [
    {
        'titulo': 'Rotas admin protegidas por authMiddleware (JWT)',
        'descricao': (
            'As rotas /auto-api/admin/data, /admin/settings e /admin/clear '
            'usam corretamente o authMiddleware que valida JWT.'
        ),
        'arquivos': 'server/index.ts:464, 474, 483',
    },
    {
        'titulo': 'Arquivos .env no .gitignore',
        'descricao': (
            'Os arquivos .env e server/.env estão no .gitignore e '
            'NÃO aparecem no git ls-files. Impede commit acidental.'
        ),
        'arquivos': '.gitignore:25',
    },
    {
        'titulo': 'CORS habilitado (embora aberto)',
        'descricao': 'O servidor usa cors() — protege contra CSRF simples mas aceita todas as origens.',
        'arquivos': 'server/index.ts:57',
    },
    {
        'titulo': 'Sanitização de HTML no emailService (sendResourceEmail)',
        'descricao': (
            'A função sendResourceEmail faz escape de &, < e > no conteúdo do recurso '
            'antes de inserir no template HTML do email.'
        ),
        'arquivos': 'services/emailService.ts:31',
    },
    {
        'titulo': 'Headers de segurança no Nginx',
        'descricao': 'X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff e X-XSS-Protection configurados.',
        'arquivos': 'nginx.conf:38-40',
    },
    {
        'titulo': 'Sem dangerouslySetInnerHTML no frontend',
        'descricao': (
            'Nenhum uso de dangerouslySetInnerHTML, innerHTML direto, eval() ou '
            'new Function() foi encontrado nos componentes React.'
        ),
        'arquivos': 'App.tsx, Admin.tsx — verificação completa',
    },
    {
        'titulo': 'ReactMarkdown sem rehype-raw',
        'descricao': (
            'Embora rehype-raw esteja no package.json, NÃO é importado nem '
            'usado no ReactMarkdown do Admin.tsx. Assim, HTML cru não é renderizado.'
        ),
        'arquivos': 'Admin.tsx:687',
    },
    {
        'titulo': 'SQLite com WAL e busy_timeout',
        'descricao': 'Configuração de concorrência adequada para o porte do projeto.',
        'arquivos': 'server/db.ts:21-23',
    },
]

issues_github = [
    {
        'num': 1,
        'titulo': '[Segurança] JWT_SECRET com fallback inseguro permite forja de tokens admin',
        'labels': 'security, critica',
        'descricao': (
            '## Problema\n'
            'Em `server/index.ts:97`, o `JWT_SECRET` tem um fallback hardcoded:\n'
            '```ts\n'
            "const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_me_in_production';\n"
            '```\n'
            'Se a variável de ambiente `JWT_SECRET` não estiver definida (deploy esquecido, container mal configurado), '
            'qualquer pessoa que conheça esse valor pode forjar tokens JWT válidos com role "admin".\n\n'
            '## Impacto\n'
            'Acesso total ao painel administrativo: visualização de dados de clientes, '
            'alteração de configurações, limpeza de dados.\n\n'
            '## Sugestão de Correção\n'
            '1. Remover o fallback: `const JWT_SECRET = process.env.JWT_SECRET;`\n'
            '2. Adicionar validação na inicialização:\n'
            '```ts\n'
            "if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change_me')) {\n"
            "  console.error('FATAL: JWT_SECRET não configurado. Encerrando.');\n"
            '  process.exit(1);\n'
            '}\n'
            '```\n'
            '3. Gerar um segredo forte: `openssl rand -base64 48`\n\n'
            '## Critérios de Aceite\n'
            '- [ ] JWT_SECRET sem valor default\n'
            '- [ ] Servidor recusa iniciar sem JWT_SECRET configurado\n'
            '- [ ] Segredo em produção tem >= 32 caracteres aleatórios\n'
        ),
    },
    {
        'num': 2,
        'titulo': '[Segurança] Bypass de pagamento via ?dev=true e emails com "test"',
        'labels': 'security, alta',
        'descricao': (
            '## Problema\n'
            'Em `server/index.ts:396-405`, a verificação de pagamento auto-aprova quando:\n'
            '- `req.query.dev === "true"` (funciona em qualquer ambiente)\n'
            '- Email contém "teste", "test" ou "dev"\n\n'
            '```ts\n'
            "const isDev = process.env.APP_MODE === 'dev' ||\n"
            "              req.query.dev === 'true' ||\n"
            "              email.toLowerCase().includes('teste');\n"
            '```\n\n'
            '## Impacto\n'
            'Qualquer pessoa consegue gerar documentos sem pagar.\n\n'
            '## Sugestão de Correção\n'
            '1. Condicionar bypass APENAS a `APP_MODE === "dev"`\n'
            '2. Remover `req.query.dev` e filtros por substring de email\n'
            '3. Considerar uma allowlist de emails de teste\n\n'
            '## Critérios de Aceite\n'
            '- [ ] `?dev=true` não funciona em produção\n'
            '- [ ] Email com "test" não auto-aprova em produção\n'
            '- [ ] Teste manual confirma que pagamento real é exigido\n'
        ),
    },
    {
        'num': 3,
        'titulo': '[Segurança] Rotas sensíveis sem autenticação (register-resource, analytics/event, email/send)',
        'labels': 'security, alta',
        'descricao': (
            '## Problema\n'
            'Três rotas aceitam dados de qualquer chamador sem token:\n\n'
            '| Rota | Linha | Risco |\n'
            '|------|-------|-------|\n'
            '| `POST /auto-api/admin/register-resource` | 502 | Inserção de recursos falsos |\n'
            '| `POST /auto-api/analytics/event` | 492 | Injeção de eventos falsos |\n'
            '| `POST /auto-api/email/send` | 528 | Proxy aberto de email |\n\n'
            '## Impacto\n'
            '- Poluição do dashboard com dados fictícios\n'
            '- Envio de spam/phishing usando a chave Brevo do projeto\n'
            '- Consumo de cota de API\n\n'
            '## Sugestão de Correção\n'
            '1. Adicionar `authMiddleware` em register-resource e email/send\n'
            '2. Implementar rate-limiting ou CAPTCHA em analytics/event\n'
            '3. Na rota de email, validar campos obrigatórios e restringir destinatários\n\n'
            '## Critérios de Aceite\n'
            '- [ ] register-resource exige token admin\n'
            '- [ ] email/send exige token admin ou validação de destinatário\n'
            '- [ ] analytics/event tem rate-limiting\n'
        ),
    },
    {
        'num': 4,
        'titulo': '[Segurança] Chaves de API e senhas fracas nos arquivos de configuração',
        'labels': 'security, critica',
        'descricao': (
            '## Problema\n'
            'Múltiplas credenciais reais presentes em arquivos no disco:\n\n'
            '| Arquivo | Segredo |\n'
            '|---------|--------|\n'
            '| `.env:1` | GEMINI_API_KEY (real) |\n'
            '| `.env:3-5` | DEEPSEEK_API_KEY, BREVO_API_KEY (reais) |\n'
            '| `.env:7` | ADMIN_PASSWORD=admin123 |\n'
            '| `.env:8-9` | KIWIFY_CLIENT_ID + SECRET (reais) |\n'
            '| `.env.example:4` | AbacatePay key real (versionado!) |\n'
            '| `git history` | Senhas admin hardcoded |\n\n'
            '## Sugestão de Correção\n'
            '1. Rotacionar TODAS as chaves imediatamente\n'
            '2. Usar gerenciador de segredos (Docker secrets, Vault, etc.)\n'
            '3. Remover chave real do .env.example\n'
            '4. Fazer `git filter-branch` ou BFG para limpar histórico\n'
            '5. Forçar ADMIN_PASSWORD >= 16 chars\n\n'
            '## Critérios de Aceite\n'
            '- [ ] Todas as chaves atuais rotacionadas\n'
            '- [ ] .env.example contém apenas placeholders\n'
            '- [ ] Histórico git limpo de credenciais\n'
            '- [ ] ADMIN_PASSWORD com policy de complexidade\n'
        ),
    },
    {
        'num': 5,
        'titulo': '[Segurança] XSS e phishing em templates de email — input sem sanitização',
        'labels': 'security, alta',
        'descricao': (
            '## Problema\n'
            'Dados do usuário são interpolados em HTML de email sem escape:\n\n'
            '1. **server/index.ts:605** — `${name}` em `<strong>${name}</strong>` (send-pdf)\n'
            '2. **server/index.ts:658** — `${name}` em email de checkout\n'
            '3. **server/index.ts:662** — `${checkoutUrl}` em `href="${checkoutUrl}"` '
            '(URL controlada pelo chamador)\n\n'
            '## Impacto\n'
            'Injeção de HTML/JS em emails; links de phishing enviados em nome do AutoRecurso.\n\n'
            '## Sugestão de Correção\n'
            '1. Criar helper de escape HTML:\n'
            '```ts\n'
            'function escapeHtml(s: string): string {\n'
            "  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')\n"
            "    .replace(/>/g,'&gt;').replace(/\"/g,'&quot;');\n"
            '}\n'
            '```\n'
            '2. Aplicar em todos os valores interpolados nos templates\n'
            '3. Validar checkoutUrl contra allowlist de domínios\n\n'
            '## Critérios de Aceite\n'
            '- [ ] Todos os campos interpolados em HTML são escaped\n'
            '- [ ] checkoutUrl validada contra domínios permitidos\n'
            '- [ ] Teste com payload `<img src=x onerror=alert(1)>` no campo name\n'
        ),
    },
    {
        'num': 6,
        'titulo': '[Segurança] Endpoint de busca de recursos expõe dados pessoais (LGPD)',
        'labels': 'security, media, lgpd',
        'descricao': (
            '## Problema\n'
            'POST /auto-api/resource/recover (server/index.ts:512-525) permite '
            'buscar recursos de qualquer cliente por CPF parcial (>= 7 dígitos), '
            'email ou placa. Não há autenticação, rate-limiting ou CAPTCHA.\n\n'
            '## Impacto\n'
            'Enumeração de dados pessoais protegidos pela LGPD: nomes, CPFs, emails, '
            'placas e conteúdo de documentos jurídicos.\n\n'
            '## Sugestão de Correção\n'
            '1. Exigir verificação (código OTP por email/SMS) antes de retornar dados\n'
            '2. Implementar rate-limiting agressivo (5 req/min por IP)\n'
            '3. Não retornar dados completos na listagem — apenas confirmar existência\n\n'
            '## Critérios de Aceite\n'
            '- [ ] Busca exige verificação de identidade\n'
            '- [ ] Rate-limiting implementado\n'
            '- [ ] Dados sensíveis mascarados na resposta\n'
        ),
    },
]

# ──────────────────── CONTADORES ────────────────────

def contar_severidades(lista):
    c = {'critica': 0, 'alta': 0, 'media': 0, 'baixa': 0, 'informativa': 0}
    for a in lista:
        c[a['sev']] = c.get(a['sev'], 0) + 1
    return c

def contar_categorias(lista):
    c = {}
    for a in lista:
        cat = a['cat'].split('.')[0].strip()
        c[cat] = c.get(cat, 0) + 1
    return c

# ──────────────────── GRÁFICOS ────────────────────

def gerar_grafico_rosca(contagem, filepath):
    labels = []
    sizes = []
    clrs = []
    for sev in ['critica', 'alta', 'media', 'baixa', 'informativa']:
        if contagem.get(sev, 0) > 0:
            nomes = {'critica': 'Crítica', 'alta': 'Alta', 'media': 'Média', 'baixa': 'Baixa', 'informativa': 'Informativa'}
            labels.append(f"{nomes[sev]} ({contagem[sev]})")
            sizes.append(contagem[sev])
            clrs.append(CORES[sev])

    fig, ax = plt.subplots(figsize=(4.5, 3.5))
    wedges, texts, autotexts = ax.pie(
        sizes, labels=labels, colors=clrs, autopct='%1.0f%%',
        startangle=90, pctdistance=0.75, wedgeprops=dict(width=0.35, edgecolor='white', linewidth=2)
    )
    for t in texts:
        t.set_fontsize(8)
    for t in autotexts:
        t.set_fontsize(7)
        t.set_fontweight('bold')
        t.set_color('white')
    ax.set_title('Achados por Severidade', fontsize=11, fontweight='bold', pad=12)
    fig.tight_layout()
    fig.savefig(filepath, dpi=180, bbox_inches='tight', transparent=False, facecolor='white')
    plt.close(fig)

def gerar_grafico_barras(achados_lista, filepath):
    cat_map = {}
    for a in achados_lista:
        cat_label = a['cat']
        sev = a['sev']
        if cat_label not in cat_map:
            cat_map[cat_label] = {'critica': 0, 'alta': 0, 'media': 0, 'baixa': 0, 'informativa': 0}
        cat_map[cat_label][sev] += 1

    cats = list(cat_map.keys())
    short_labels = [c.split('—')[0].strip() if '—' in c else c[:20] for c in cats]

    fig, ax = plt.subplots(figsize=(6, 3.5))
    bottom = [0] * len(cats)
    for sev in ['critica', 'alta', 'media', 'baixa', 'informativa']:
        nomes = {'critica': 'Crítica', 'alta': 'Alta', 'media': 'Média', 'baixa': 'Baixa', 'informativa': 'Informativa'}
        vals = [cat_map[c][sev] for c in cats]
        if any(v > 0 for v in vals):
            ax.barh(short_labels, vals, left=bottom, color=CORES[sev], label=nomes[sev], edgecolor='white', linewidth=0.5)
            bottom = [b + v for b, v in zip(bottom, vals)]

    ax.set_xlabel('Nº de achados', fontsize=9)
    ax.set_title('Achados por Categoria', fontsize=11, fontweight='bold')
    ax.legend(fontsize=7, loc='lower right')
    ax.invert_yaxis()
    fig.tight_layout()
    fig.savefig(filepath, dpi=180, bbox_inches='tight', transparent=False, facecolor='white')
    plt.close(fig)

# ──────────────────── PDF ────────────────────

def build_pdf(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
        title='Relatório de Auditoria de Segurança — AutoRecurso',
        author='Auditoria Automatizada'
    )

    styles = getSampleStyleSheet()

    # Custom styles
    styles.add(ParagraphStyle('CoverTitle', parent=styles['Title'], fontSize=24, leading=30,
                              textColor=colors.HexColor('#1E293B'), alignment=TA_CENTER, spaceAfter=8))
    styles.add(ParagraphStyle('CoverSub', parent=styles['Normal'], fontSize=12, leading=16,
                              textColor=colors.HexColor('#64748B'), alignment=TA_CENTER, spaceAfter=4))
    styles.add(ParagraphStyle('SectionTitle', parent=styles['Heading1'], fontSize=16, leading=20,
                              textColor=colors.HexColor('#1E293B'), spaceBefore=18, spaceAfter=8,
                              borderPadding=(0, 0, 4, 0)))
    styles.add(ParagraphStyle('SubSection', parent=styles['Heading2'], fontSize=13, leading=17,
                              textColor=colors.HexColor('#334155'), spaceBefore=12, spaceAfter=6))
    styles.add(ParagraphStyle('BodyText2', parent=styles['Normal'], fontSize=9.5, leading=13,
                              textColor=colors.HexColor('#334155'), alignment=TA_JUSTIFY, spaceAfter=4))
    styles.add(ParagraphStyle('SmallBody', parent=styles['Normal'], fontSize=8.5, leading=11,
                              textColor=colors.HexColor('#475569'), spaceAfter=2))
    styles.add(ParagraphStyle('CodeBlock', parent=styles['Normal'], fontSize=8, leading=10,
                              fontName='Courier', textColor=colors.HexColor('#1E293B'),
                              backColor=colors.HexColor('#F1F5F9'),
                              borderPadding=(4, 6, 4, 6), spaceAfter=4, spaceBefore=2))
    styles.add(ParagraphStyle('IssueBlock', parent=styles['Normal'], fontSize=8.5, leading=11,
                              fontName='Courier', textColor=colors.HexColor('#1E293B'),
                              backColor=colors.HexColor('#F8FAFC'),
                              borderPadding=(6, 8, 6, 8), spaceAfter=6, spaceBefore=4))
    styles.add(ParagraphStyle('ForteTitle', parent=styles['Normal'], fontSize=10, leading=13,
                              textColor=COR_HEX['forte'], spaceAfter=2))

    story = []
    contagem = contar_severidades(achados)
    total = sum(contagem.values())

    # ─── CAPA ───
    story.append(Spacer(1, 3 * cm))
    story.append(HRFlowable(width='100%', thickness=2, color=colors.HexColor('#2563EB'), spaceAfter=20))
    story.append(Paragraph('Relatório de Auditoria<br/>de Segurança', styles['CoverTitle']))
    story.append(Paragraph('<b>AutoRecurso</b>', ParagraphStyle('ProjName', parent=styles['CoverTitle'],
                            fontSize=20, textColor=colors.HexColor('#2563EB'))))
    story.append(Spacer(1, 0.8 * cm))
    story.append(HRFlowable(width='60%', thickness=1, color=colors.HexColor('#CBD5E1'), spaceAfter=16))
    story.append(Paragraph(f'Data: {datetime.now().strftime("%d/%m/%Y")}', styles['CoverSub']))
    story.append(Paragraph('Escopo: Código-fonte completo (frontend React + backend Express + deploy Docker)', styles['CoverSub']))
    story.append(Spacer(1, 1.2 * cm))

    # Nota metodológica
    story.append(Paragraph('<b>Nota Metodológica</b>', ParagraphStyle('MetaTitle', parent=styles['CoverSub'],
                            fontSize=11, textColor=colors.HexColor('#334155'))))
    story.append(Spacer(1, 4))
    metodo = (
        '<b>Stack detectada:</b> TypeScript • Express 5 (backend) • React 19 + Vite (frontend) • '
        'SQLite/better-sqlite3 (banco) • JWT + senha fixa (auth admin) • Docker Compose + Nginx (deploy).<br/><br/>'
        '<b>Mapeamento das categorias:</b><br/>'
        '1. <i>Banco sem Tranca</i> → Filtro manual por user inexistente (sem RLS, sem ORM com scoping).<br/>'
        '2. <i>Permissão no Navegador</i> → Gate de admin via token local vs. authMiddleware no backend.<br/>'
        '3. <i>IDOR</i> → Handlers que operam por ID/email sem verificação de posse.<br/>'
        '4. <i>Chaves Expostas</i> → .env, .env.example, fallbacks em código, histórico git.<br/>'
        '5. <i>XSS</i> → Templates de email com interpolação, ReactMarkdown, dangerouslySetInnerHTML.'
    )
    story.append(Paragraph(metodo, ParagraphStyle('MetaBody', parent=styles['BodyText2'],
                            fontSize=9, alignment=TA_LEFT)))

    story.append(PageBreak())

    # ─── RESUMO EXECUTIVO ───
    story.append(Paragraph('Resumo Executivo', styles['SectionTitle']))
    story.append(Paragraph(
        f'Foram identificados <b>{total} achados</b> de segurança e <b>{len(pontos_fortes)} pontos fortes</b> '
        f'na análise completa do código-fonte do projeto AutoRecurso.',
        styles['BodyText2']
    ))

    # Tabela resumo
    resumo_data = [
        ['Severidade', 'Quantidade'],
    ]
    for sev, nome in [('critica', 'Crítica'), ('alta', 'Alta'), ('media', 'Média'),
                       ('baixa', 'Baixa'), ('informativa', 'Informativa')]:
        if contagem.get(sev, 0) > 0:
            resumo_data.append([nome, str(contagem[sev])])
    resumo_data.append(['TOTAL', str(total)])

    t = Table(resumo_data, colWidths=[4*cm, 3*cm])
    t_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F1F5F9')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    # Color rows by severity
    row_idx = 1
    for sev in ['critica', 'alta', 'media', 'baixa', 'informativa']:
        if contagem.get(sev, 0) > 0:
            t_style.append(('TEXTCOLOR', (0, row_idx), (0, row_idx), COR_HEX[sev]))
            row_idx += 1
    t.setStyle(TableStyle(t_style))
    story.append(t)
    story.append(Spacer(1, 0.5 * cm))

    # Gráficos
    chart_dir = os.path.dirname(output_path)
    rosca_path = os.path.join(chart_dir, 'chart_rosca.png')
    barras_path = os.path.join(chart_dir, 'chart_barras.png')
    gerar_grafico_rosca(contagem, rosca_path)
    gerar_grafico_barras(achados, barras_path)

    story.append(Image(rosca_path, width=10*cm, height=7.5*cm))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Image(barras_path, width=14*cm, height=7.5*cm))

    story.append(PageBreak())

    # ─── PONTOS FORTES ───
    story.append(Paragraph('Pontos Fortes (Controles Verificados)', styles['SectionTitle']))
    for pf in pontos_fortes:
        story.append(Paragraph(f'✅ <b>{pf["titulo"]}</b>', styles['ForteTitle']))
        story.append(Paragraph(pf['descricao'], styles['SmallBody']))
        story.append(Paragraph(f'<i>Evidência: {pf["arquivos"]}</i>', ParagraphStyle(
            'Evidence', parent=styles['SmallBody'], textColor=colors.HexColor('#64748B'), fontSize=8)))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 0.5*cm))

    # ─── PONTOS FRACOS ───
    story.append(Paragraph('Pontos Fracos (Riscos Centrais)', styles['SectionTitle']))
    riscos = [
        'Segredos (JWT, senhas, API keys) com valores default inseguros e sem validação de startup.',
        'Múltiplas rotas sensíveis acessíveis sem autenticação (register-resource, analytics, email/send).',
        'Bypass de pagamento trivial via parâmetro de query ou substring no email.',
        'Dados pessoais (LGPD) expostos via busca sem autenticação.',
        'Templates de email vulneráveis a XSS/phishing por falta de escape nos inputs.',
    ]
    for r in riscos:
        story.append(Paragraph(f'⚠️ {r}', styles['BodyText2']))

    story.append(PageBreak())

    # ─── TABELA DETALHADA ───
    story.append(Paragraph('Achados Detalhados por Categoria', styles['SectionTitle']))

    current_cat = ''
    for a in achados:
        if a['cat'] != current_cat:
            current_cat = a['cat']
            story.append(Paragraph(current_cat, styles['SubSection']))

        sev_nome = {'critica': 'CRÍTICA', 'alta': 'ALTA', 'media': 'MÉDIA', 'baixa': 'BAIXA', 'informativa': 'INFO'}
        sev_label = sev_nome.get(a['sev'], a['sev'].upper())
        sev_color = COR_HEX[a['sev']]
        badge_bg = BADGE_BG.get(a['sev'], colors.HexColor('#F3F4F6'))

        # Achado box
        achado_items = []
        achado_items.append(Paragraph(
            f'<font color="{CORES[a["sev"]]}" size="9"><b>[{sev_label}]</b></font> '
            f'<b>{a["titulo"]}</b>',
            styles['BodyText2']
        ))
        achado_items.append(Paragraph(
            f'📁 <b>{a["arquivo"]}</b> — linhas {a["linhas"]}',
            styles['SmallBody']
        ))
        achado_items.append(Paragraph(esc(a['descricao']), styles['SmallBody']))
        achado_items.append(Paragraph(f'<font name="Courier" size="7.5">{esc(a["trecho"])}</font>', styles['CodeBlock']))
        achado_items.append(Paragraph(f'<b>Impacto:</b> {esc(a["impacto"])}', styles['SmallBody']))
        achado_items.append(Spacer(1, 6))

        story.append(KeepTogether(achado_items))

    story.append(PageBreak())

    # ─── RECOMENDAÇÕES ───
    story.append(Paragraph('Recomendações Priorizadas', styles['SectionTitle']))
    recomendacoes = [
        ('P1 — Imediato', 'Rotacionar TODAS as chaves de API e segredos. Remover fallbacks hardcoded do JWT_SECRET. Gerar senha admin forte. Limpar histórico git com BFG.'),
        ('P1 — Imediato', 'Remover bypass de pagamento via query param e substring de email em produção.'),
        ('P2 — Curto prazo', 'Adicionar authMiddleware nas rotas /admin/register-resource e /email/send. Implementar rate-limiting global.'),
        ('P2 — Curto prazo', 'Criar helper escapeHtml() e aplicar em todos os templates de email. Validar checkoutUrl contra allowlist.'),
        ('P2 — Curto prazo', 'Proteger /resource/recover com verificação de identidade (OTP) e rate-limiting.'),
        ('P3 — Médio prazo', 'Adicionar validação de startup que recusa iniciar com segredos default. CI com linter de segredos (gitleaks, truffleHog).'),
        ('P3 — Médio prazo', 'Implementar Content-Security-Policy no Nginx. Restringir CORS a origens específicas.'),
        ('P3 — Médio prazo', 'Mover data.json com PII para fora do diretório do projeto ou deletar. Adicionar ao .gitignore.'),
    ]
    for i, (prio, desc) in enumerate(recomendacoes, 1):
        story.append(Paragraph(f'<b>{prio}:</b> {desc}', styles['BodyText2']))

    story.append(PageBreak())

    # ─── ISSUES GITHUB ───
    story.append(Paragraph('Issues para o GitHub', styles['SectionTitle']))
    story.append(Paragraph(
        'Abaixo estão as issues formatadas em Markdown, prontas para copiar e colar no GitHub.',
        styles['BodyText2']
    ))
    story.append(Spacer(1, 0.3*cm))

    for issue in issues_github:
        story.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#CBD5E1'), spaceAfter=8))
        story.append(Paragraph(
            f'<b>--- ISSUE {issue["num"]} ---</b>',
            ParagraphStyle('IssueHeader', parent=styles['BodyText2'],
                           textColor=colors.HexColor('#1E293B'), fontSize=10, spaceAfter=4)
        ))
        story.append(Paragraph(f'<b>Título:</b> {issue["titulo"]}', styles['BodyText2']))
        story.append(Paragraph(f'<b>Labels:</b> {issue["labels"]}', styles['SmallBody']))
        story.append(Spacer(1, 4))

        # Render issue body line by line
        for line in issue['descricao'].split('\n'):
            escaped = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(escaped, styles['IssueBlock']))

        story.append(Paragraph(f'<b>--- FIM ISSUE {issue["num"]} ---</b>', styles['BodyText2']))
        story.append(Spacer(1, 0.5*cm))

    # ─── BUILD ───
    def header_footer(canvas, doc):
        canvas.saveState()
        # Header
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#94A3B8'))
        canvas.drawString(2*cm, A4[1] - 1.5*cm, 'Relatório de Auditoria de Segurança — AutoRecurso')
        canvas.drawRightString(A4[0] - 2*cm, A4[1] - 1.5*cm, datetime.now().strftime('%d/%m/%Y'))
        # Footer
        canvas.drawString(2*cm, 1.2*cm, f'Página {doc.page}')
        canvas.drawRightString(A4[0] - 2*cm, 1.2*cm, 'Confidencial')
        # Line
        canvas.setStrokeColor(colors.HexColor('#E2E8F0'))
        canvas.line(2*cm, A4[1] - 1.7*cm, A4[0] - 2*cm, A4[1] - 1.7*cm)
        canvas.line(2*cm, 1.5*cm, A4[0] - 2*cm, 1.5*cm)
        canvas.restoreState()

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f'✅ PDF gerado: {output_path}')
    print(f'   Páginas estimadas: ~{len(story) // 25 + 1}')


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output = os.path.join(script_dir, 'relatorio-auditoria-seguranca.pdf')
    build_pdf(output)
