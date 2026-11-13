# LOLA — LGPD e proteção de dados: controles de lançamento
Atualizado em 13/11/2026. Este documento é uma lista operacional; não é declaração de conformidade, parecer jurídico ou substituto de validação pela controladora.

## Regra de lançamento
A vitrine pode ser disponibilizada como **catálogo informativo**, sem capturar pedidos reais, pagamentos ou dados pessoais para fluxo de compra enquanto os itens abaixo estiverem pendentes. Respeitar os termos do provedor de hospedagem e não oferecer venda simulada.

## Responsáveis e transparência (pendente)
- [ ] Identificar a pessoa física ou jurídica controladora e confirmar dados cadastrais exibidos ao consumidor (nome/razão social, registro aplicável, endereço e contato).
- [ ] Publicar canal de privacidade funcional para requisições de titulares; verificar identidade antes de acesso/alteração/exclusão.
- [ ] Avaliar obrigação de encarregado ou enquadramento como agente de pequeno porte, mantendo canal de atendimento mesmo em caso de dispensa.
- [ ] Validar e publicar política de privacidade específica, por finalidade/base legal, categorias, compartilhamentos, operadores, conservação e eventual transferência internacional.
- [ ] Revisar termos de venda, CDC, política de trocas, prazos e dados da oferta.

## Inventário de dados e retenção
- [ ] Documentar informações de navegação, conta, contato, checkout, endereço, pedidos, pagamentos e logs: origem, finalidade, base legal, destinatários, prazo e critérios de descarte.
- [ ] Estabelecer retenção por categoria, inclusive requisitos legais/fiscais e exercício regular de direitos; **não presumir 90 dias para todos os dados**.
- [ ] Mapear subprocessadores (hospedagem, e-mail, frete, gateway, ferramentas de chat e analytics); revisar contratos e localidade dos dados.
- [ ] Implementar e testar rotinas programadas de eliminação/anonimização onde legalmente cabíveis, com logs sem dados pessoais sensíveis.
- [ ] Não incluir credenciais, tokens, endereços ou identificadores pessoais em URLs e logs públicos.

## Direitos do titular (art. 18)
- [ ] Disponibilizar confirmação, acesso e correção.
- [ ] Avaliar anonimização, bloqueio e eliminação quando aplicáveis, sem apagar registros sob obrigação legal.
- [ ] Documentar solicitações de portabilidade, compartilhamento, informação, oposição e revogação de consentimento.
- [ ] Testar autenticação de titular e segregação de contas. Evitar expor dados de terceiros em respostas de API.
- [ ] Definir processo interno, responsáveis e SLA seguindo a LGPD e regulamentações vigentes, registrando decisões.

## Segurança e incidentes
- [ ] HTTPS, CSP, cookies Secure/HttpOnly/SameSite conforme contexto e CSRF, autenticação e autorização; nenhum segredo no bundle.
- [ ] Segregar loja e BFF do Admin, restringir o servidor de dados; não publicar painel como bundle estático autossuficiente.
- [ ] Executar análise de dependências, CodeQL, testes de integração, revisão de logs, rate limits e backups com **teste de restauração**.
- [ ] Definir plantão e procedimento para identificar, conter, registrar e avaliar incidentes e eventual comunicação à ANPD/titulares no prazo normativo aplicável.
- [ ] Registrar evidências das avaliações e manter revisão periódica de acesso/credenciais.

## Cookies e chat
- [ ] Inventariar cookies e localStorage efetivamente utilizados no domínio final.
- [ ] Caso sejam instalados rastreadores não essenciais, definir base legal e controles de preferência antes da ativação.
- [ ] Assistente local: impedir retenção/eco de dados sensíveis desnecessários. Qualquer habilitação de Gemini/terceiro exige aviso detalhado, avaliação de transferência e controles adequados.

## Operação e disponibilidade
- [ ] Implantar usando conta controlada pelo proprietário, plano Free com limites monitorados e nenhuma opção de cobrança por consumo habilitada por engano.
- [ ] Aplicar migrations D1 verificadas e manter cópia de segurança consistente; implementar rollback e healthcheck; registrar limites e alarmes.
- [ ] Não prometer 100% uptime, imunidade a banimento ou ausência de advertências; monitorar uso aceitável, abuso, tráfego, disponibilidade e validade de domínio.
- [ ] Manter compras reais **desabilitadas** até estoque, preços reais, identidade do recebedor, webhooks e testes de ponta a ponta.

Fontes oficiais: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares e https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022
