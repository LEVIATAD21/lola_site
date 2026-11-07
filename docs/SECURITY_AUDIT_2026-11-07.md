# LOLA — Auditoria de segurança e estado de entrega
**Data:** 07/11/2026  
**Escopo autorizado:** somente `LEVIATAD21/lola_site` e `LEVIATAD21/lola_site_admin`.

## Resumo executivo

As branches de trabalho implementam a conexão do painel administrativo ao catálogo e ao estoque reais da loja. O navegador fala apenas com o BFF do LOLA Admin; o BFF encaminha operações de uma allowlist ao Data Server do LOLA Site, mantendo a chave administrativa fora do bundle do navegador.

**Não é uma certificação de segurança nem uma declaração de prontidão total para produção.** Ainda faltam teste integrado entre os dois processos reais, upload persistente de imagens, módulos administrativos adicionais, autenticação multiusuário/MFA e persistência transacional multi-instância.

## Arquitetura implementada

```text
Navegador do operador
        |
        | HTTPS / sessão HttpOnly / CSRF
        v
LOLA Admin — frontend + BFF Express (servidor separado)
        |
        | TLS quando remoto / x-admin-key / allowlist de IP
        v
LOLA Site — Data Server privado
        |
        +-- CatalogStore persistente
        +-- InventoryStore (fonte autoritativa do saldo)
        |
        v
LOLA Site — vitrine pública lê somente o catálogo/estoque necessário
```

- O segredo `LOLA_ADMIN_API_KEY` existe somente nos processos de servidor.
- O BFF restringe método e caminho; não funciona como proxy genérico.
- O Admin não usa mais seed/localStorage para os dados operacionais do catálogo.
- O Data Server continua exigindo chave administrativa e allowlist de IP nas rotas privilegiadas.

## Controles e correções concluídos

### Lola Site
- Catálogo persistente com operações de criação, atualização e exclusão.
- Estoque lido da autoridade `InventoryStore`, não do campo auxiliar salvo no catálogo.
- Snapshot público de estoque aceita somente IDs encontrados no catálogo obtido pelo canal interno autenticado.
- Exclusão recusada quando há saldo físico, venda, reserva ou hold; evita descartar estoque e histórico.
- Validação de imagem recusa `javascript:`, HTTP sem TLS, URL protocol-relative, credenciais em URL e caminhos de traversal.
- Limite de requisições aplicado também ao fallback de arquivos da SPA.
- Testes HTTP cobrem autenticação administrativa, allowlist, CRUD e integridade do estoque.
- Consulta pública de rastreamento funciona também no modo de servidores separados, pelo canal interno HMAC assinado; a resposta é projetada para conter apenas logística e usa `Cache-Control: no-store`.
- A consulta de rastreamento confirma que o pré-pedido ainda existe; exclusão revoga o token e remove o registro de rastreio.
- O logger da vitrine mascara tokens bearer de rastreamento nos caminhos; tokens não são gravados em logs de acesso.
- Teste TLS usa CA de teste e SAN de IP; não desativa validação de certificado.

### Lola Admin
- Login com credenciais configuradas no servidor.
- Cookie de sessão HttpOnly, SameSite=Strict e Secure em produção.
- CSRF obrigatório em mutações.
- Limite de tentativas de login e de operações autenticadas no BFF.
- Allowlist explícita de endpoints upstream, timeout, limite de resposta e recusa de redirects.
- Logout revoga a sessão no servidor; a UI não esconde falha de logout.
- Scanner de build confirma que marcadores de segredo/chave não entram no bundle.
- Exportação CSV neutraliza fórmulas de planilha.
- Página administrativa recebe `noindex`; exemplo Nginx fornece TLS, CSP, HSTS e headers adicionais.

## Evidências de CI e análise estática

| Repositório | Evidência | Resultado |
|---|---|---|
| Lola Site | CI da branch de integração | 470 testes aprovados; TypeScript, auditoria de dependências e build aprovados |
| Lola Site | `npm audit` | 0 vulnerabilidades reportadas na execução |
| Lola Site | CodeQL | análise concluída; SARIF arquivado |
| Lola Admin | CI da branch de integração | 13 testes aprovados; TypeScript, build e scanner do bundle aprovados |
| Lola Admin | `npm audit` | 0 vulnerabilidades reportadas na execução |
| Lola Admin | CodeQL | 0 resultados no SARIF analisado |

**Nota CodeQL do Site:** existe um resultado informativo `js/missing-rate-limiting` no fallback da SPA. O handler usa o middleware próprio `limitRead`, configurado para 300 requisições por minuto por IP; o analisador não reconheceu esse middleware customizado. Foi conferido manualmente. Não é uma confirmação de ausência de risco em outras rotas.

**Topologia do Data Server:** por padrão, `LOLA_BIND_HOST` é `127.0.0.1`; para receber o BFF em outro host, deve ser definido para o IP privado da interface. Em produção, bind coringa é recusado por padrão. Configure `LOLA_ADMIN_ALLOWED_IPS` para o IP que o Data Server enxerga do BFF, `LOLA_INTERNAL_SECRET` compartilhado somente entre Site público e Data Server, TLS do Data Server e firewall restritivo. A chave HMAC interna e a chave administrativa são segredos distintos.

## Limitações que ainda bloqueiam a declaração de produção

1. **Teste E2E entre processos:** ainda não foi executado um teste automatizado que inicie simultaneamente o BFF real do Admin e o Data Server real do Site. Cada lado possui testes HTTP próprios, mas o contrato precisa ser exercitado em conjunto.
2. **Sessões:** o mapa de sessões do BFF é em memória. Reinício invalida sessões e múltiplas instâncias não compartilham estado.
3. **Identidade:** há operador único via variáveis de ambiente; sem MFA, RBAC, gestão de usuários e revogação individual.
4. **Persistência:** catálogo e estoque usam arquivos e pressupõem processo único; não há transação distribuída, locking multi-instância nem escala horizontal segura.
5. **Imagens:** o Admin aceita URL de imagem. Upload binário, inspeção real de MIME, decodificação, antivírus, storage e limpeza de órfãos ainda não existem.
6. **Catálogo:** estado de publicação/arquivamento ainda não é um campo de domínio; os produtos existentes são tratados como publicados.
7. **Módulos:** listagem de pré-pedidos, busca de clientes, anonimização/exclusão LGPD e resumo operacional de até 100 registros recentes estão conectados; notificações, configurações e interface administrativa de rastreamento ainda não. A consulta pública de rastreamento já funciona no modo dividido. Os relatórios exibem valores solicitados, não receita conciliada, pois pagamentos não estão integrados.
8. **Auditoria:** há log de acesso administrativo, mas ainda falta trilha de auditoria por ação/operador com before/after e retenção definida.
9. **Dependências:** o Admin ainda não tem `package-lock.json` versionado; o CI gera e arquiva um lockfile temporário, mas a instalação não é totalmente reproduzível até o lock ser incorporado.
10. **Produção:** nenhum deploy foi realizado nesta auditoria; TLS, firewall, IP allowlist, segredos e backups precisam ser configurados no ambiente real.

## Próximas prioridades

### P0 — antes de usar com dados reais
- Executar teste E2E real Admin BFF ↔ Site Data Server.
- Versionar lockfile do Admin e trocar instalação por `npm ci`.
- Confirmar configuração de HTTPS, proxy reverso, firewall e allowlist com o IP de saída do BFF.
- Criar backups e procedimento testado de restauração dos arquivos de dados.
- Definir gestão de segredos e rotação da chave administrativa.

### P1 — segurança operacional
- Migrar catálogo/estoque para banco transacional com migrações, constraints e concorrência.
- Adicionar sessão compartilhada/revogável, MFA e RBAC.
- Registrar trilha de auditoria de cada mutação administrativa.
- Implementar pipeline de upload seguro e storage persistente.
- Implementar publicação/arquivamento e regras de retenção de produtos.

### P2 — completar o painel
- Completar notificações, configurações e interface de rastreamento; evoluir relatórios somente após integração de pagamentos.
- Testes de carga controlados e observabilidade/alertas.
- Revisão manual de segurança antes da abertura pública.

## GitHub

- [LOLA Site — PR de integração](https://github.com/LEVIATAD21/lola_site/pull/16)
- [LOLA Admin — PR de integração](https://github.com/LEVIATAD21/lola_site_admin/pull/13)
- [LOLA Site — checklist mestre](https://github.com/LEVIATAD21/lola_site/issues/15)
- [LOLA Admin — checklist mestre](https://github.com/LEVIATAD21/lola_site_admin/issues/12)

**Política de branch:** alterações mantidas nas branches de trabalho. Nenhum merge em `main` e nenhum deploy realizado nesta etapa.


**Validação de infraestrutura:** o exemplo Nginx ainda precisa passar por `nginx -t` no host de destino antes do deploy.
