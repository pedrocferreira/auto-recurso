import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Google Ads suspendeu a conta por "Práticas comerciais inaceitáveis": a LP não pode
// prometer resultado, sugerir caráter oficial/jurídico nem esconder quem opera o serviço.
const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8');
const visible = ['App.tsx', 'LegalNotice.tsx', 'TermsOfUse.tsx', 'index.html'].map(read).join('\n');

describe('conformidade da LP com a política do Google Ads', () => {
    it.each([
        'RECURSO OFICIAL', 'documento oficial', 'Inteligência Artificial Jurídica', 'IA Especialista',
        'Defesa Especializada', 'CABEÇALHO JURÍDICO', 'melhor fundamentação', 'recursos profissionais',
        'multas anuladas', 'Anule', 'anular multa',
    ])('não contém "%s"', (frase) => {
        expect(visible).not.toContain(frase);
    });

    it('avisa que não há vínculo com órgãos de trânsito nem advocacia', () => {
        const n = read('LegalNotice.tsx');
        expect(n).toContain('Não somos escritório de advocacia');
        expect(n).toContain('vínculo com DETRAN');
        expect(n).toContain('não garantimos o resultado');
    });

    it('o rodapé exibe o aviso e a identificação do responsável', () => {
        expect(read('App.tsx').match(/<LegalNotice \/>/g)?.length).toBe(2);
        expect(read('support.ts')).toContain('export const OPERATOR');
    });

    it('o prompt do servidor não faz a IA se passar por advogado', () => {
        const s = read('server/index.ts');
        expect(s).not.toContain('Advogado Especialista');
        expect(s).toContain('NÃO se apresente como advogado');
    });
});
