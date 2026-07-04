# PetNanny · Auditoria LGPD — mapa de dados do produto inteiro

Data: 04/07/2026 · Escopo: petnanny.com.br completo (quiz, hub Meu Cão, APIs, PWA)
**Isto é groundwork técnico, não parecer jurídico.** Quando formalizar a empresa, vale 1h de um advogado de privacidade revisando — o mapa abaixo deixa essa hora barata.

## 1. Mapa de dados por superfície

### Quiz (index.html)
| Dado | Pessoal? | Onde fica | Base legal | Status |
|---|---|---|---|---|
| Respostas do quiz + resultado | Não (session_id anônimo) | localStorage + Google Sheets | Consentimento (termos v1) | ✅ OK — termos existentes cobrem |
| Aceite dos termos | Metadado | localStorage | — | ✅ OK |
| GA4 (eventos, dispositivo) | Pseudonimizado | Google | Legítimo interesse | ✅ Declarado nos termos |

Nota: **não há captura de e-mail no quiz hoje** (verificado no código — nenhum `type="email"`). O consentimento que você lembrava é o aceite dos termos. Se um dia adicionar captura de lead, precisa de checkbox separado e finalidade específica.

### Hub Meu Cão (meu-cao.html + APIs)
| Dado | Pessoal? | Onde fica | Risco | Status |
|---|---|---|---|---|
| Dados do cão (nome, raça, peso, saúde) | Indireto (hábitos do tutor) | localStorage + Sheets (sync) | Baixo | ⚠️ Era descoberto — agora coberto na política v2 |
| **Documentos/fotos** (carteira, exames) | **SIM** — nome/endereço do tutor, CRMV do vet aparecem em carteiras | Processado via Anthropic (EUA); foto fica no aparelho | **Alto** | ⚠️ Transferência internacional — agora declarada (art. 33) na política v2 |
| Conversas com a Nanny | Potencialmente (relatos pessoais) | Anthropic (processamento) + resumo local | Médio | ⚠️ Agora declarado |
| Geolocalização (clima) | SIM (aproximada) | Só no aparelho → Open-Meteo | Baixo (já minimizada: ~1 km, opt-in, desligável) | ✅ Resolvido na leva anterior |
| Token de identidade / magic link | Pseudônimo | localStorage + Sheets | Médio | ⚠️ Declarado como "sync" na política; quando entrar e-mail no spine WhatsApp, atualizar |
| GA4 | Pseudonimizado | Google | Baixo | ✅ URL já é limpa de tokens antes do GA (código existente — bom!) |

### Infra
| Item | Status |
|---|---|
| Vercel logs (IP) | ✅ Declarado na política v2 |
| pnGuard nos endpoints | ✅ Mitiga uso abusivo da API (segurança = obrigação LGPD art. 46) |
| Sheets: planilha com dados de sync | ⚠️ Garantir compartilhamento restrito (só sua conta), 2FA no Google |

## 2. O que foi entregue nesta leva
1. **privacidade.html** — política standalone v2 cobrindo TODO o produto (quiz + hub + IA + clima + operadores + transferência internacional + retenção + direitos + canal). Linkada: rodapé do quiz, dentro dos termos do quiz, rodapé do hub.
2. Microcopy de geolocalização (leva anterior) alinhada: finalidade + minimização + revogação.

## 3. Gaps que restam (priorizados)
- **P0 — Processo de exclusão real**: a política promete exclusão em 15 dias; hoje isso é manual (achar a linha no Sheets). Criar um filtro/rotina no Apps Script pra apagar por identificador. 30 min de trabalho, e a promessa vira verdade.
- **P1 — Aviso no upload de documento**: uma linha no fluxo "Ler carteira": "a foto é processada por IA (Anthropic/EUA) só pra extrair as datas — evite enviar páginas com seus dados pessoais se não precisar". Consentimento contextual no momento certo.
- **P1 — Termos do quiz v1 → apontar pra política v2** (feito o link; numa próxima revisão, alinhar o texto interno dos termos pra não divergir).
- **P2 — Registro de bases legais**: quando formalizar CNPJ, montar o registro de operações (art. 37). O mapa acima já é 80% dele.
- **P2 — DPO/encarregado**: dispensável no porte atual, obrigatório ao crescer; contato@ funciona como canal por ora.

## 4. Princípio que já está certo (manter)
A arquitetura local-first do hub é sua **melhor defesa LGPD**: o grosso dos dados nunca sai do aparelho do tutor. Toda feature nova deve perguntar primeiro "isso precisa mesmo sair do dispositivo?" — o card de clima foi o exemplo do padrão certo (opt-in, minimizado, revogável, sem backend).
