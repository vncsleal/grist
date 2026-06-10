---
title: Política de Privacidade
updated: "Última atualização: 8 de junho de 2026"
---

## Nosso Compromisso com a Privacidade

O Quillby foi projetado para rodar localmente na sua máquina. Acreditamos que privacidade é uma funcionalidade, não um complemento. Esta política explica como seus dados são tratados ao usar o Quillby, o que permanece na sua máquina e o que — se algo — sai dela. Está em conformidade com a **Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)** e reflete nosso compromisso com a proteção de dados desde a concepção.

## Controlador de Dados

O controlador de dados — a entidade responsável por decidir como seus dados pessoais são tratados — é o mantenedor do projeto Quillby:

- **Projeto:** Quillby (servidor MCP de código aberto)
- **Mantenedor:** Vncsleal
- **Contato:** Abra uma issue no [GitHub](https://github.com/vncsleal/quillby)

## Dados que Coletamos

**O Quillby não coleta nenhum dado pessoal.** É uma aplicação local-first. Todos os dados que você cria ou configura permanecem na sua máquina:

- **Dados de workspace** (feeds, briefings, cards, rascunhos, memória, exemplos de voz) são armazenados em `~/.quillby/` no seu sistema de arquivos local.
- **Log de auditoria.** O Quillby mantém um log de auditoria local em `~/.quillby/audit.log` que registra operações realizadas (ex.: buscas de feed, geração de briefings, chamadas a provedores). Este log permanece na sua máquina e nunca é transmitido.
- **Sem armazenamento em nuvem.** Não operamos servidores que recebam ou armazenem seus dados de workspace.
- **Sem telemetria.** O Quillby não coleta análises, dados de uso, relatórios de falha ou qualquer informação sobre como você usa o software.
- **Sem conta.** Você não precisa criar uma conta, fornecer um e-mail ou fazer login para usar o Quillby.

## Base Legal para o Tratamento (LGPD Art. 7 e 10)

Como o Quillby não processa dados pessoais em nossos servidores, a base legal para a operação local do software é o **legítimo interesse** (Art. 7, IX — LGPD): o tratamento é realizado exclusivamente no seu próprio dispositivo, sob seu controle, e é necessário para o funcionamento do software.

Se você configurar voluntariamente um provedor terceiro (IA, geração de mídia, etc.), a base legal passa a ser o **seu consentimento** (Art. 7, I — LGPD), que você concede ao ativar a integração. Você pode revogar este consentimento a qualquer momento removendo a configuração do provedor.

## O Que Sai da Sua Máquina

O Quillby pode se comunicar opcionalmente com serviços externos se você os configurar explicitamente:

- **Busca de feeds.** Ao executar um briefing diário ou descobrir feeds, o Quillby busca conteúdo dos feeds RSS, comunidades Reddit e sites que você configurou — requisições HTTP padrão, sem diferença de abrir essas páginas no navegador.
- **MCP Sampling.** Se seu cliente de IA suportar MCP Sampling, o Quillby pode delegar geração de texto ao seu cliente (ex.: AI client). Isso permanece no seu ambiente local e está sujeito à política de privacidade do seu cliente.
- **APIs de provedores terceiros.** Se você configurar um provedor de geração de mídia (OpenAI, ElevenLabs, Replicate, etc.), sua chave de API é armazenada no keychain do sistema ou em arquivo criptografado. Os dados enviados a esses provedores são regidos por suas respectivas políticas de privacidade.

## Transferências Internacionais de Dados (LGPD Art. 33)

O Quillby por si só não transfere seus dados internacionalmente — ele roda inteiramente na sua máquina. No entanto, se você configurar um provedor terceiro sediado fora do Brasil (ex.: OpenAI nos EUA), os dados enviados a esse provedor podem ser transferidos internacionalmente. Tais transferências são baseadas no seu consentimento explícito (Art. 33, I — LGPD) e estão sujeitas à política de privacidade do provedor.

## Segurança das Chaves de API

As chaves de API de provedores são armazenadas de forma segura na sua máquina:

- **macOS:** As chaves são armazenadas no Keychain do sistema (criptografia com suporte de hardware).
- **Outras plataformas:** As chaves são criptografadas em repouso usando AES-256-GCM com uma chave derivada de um segredo específico da máquina.
- As chaves nunca são enviadas para os servidores do Quillby (não temos nenhum).
- Você pode revogar ou excluir as chaves armazenadas a qualquer momento nas configurações do provedor.

## Retenção de Dados

Como todos os dados são armazenados localmente na sua máquina, a retenção está totalmente sob seu controle:

- **Dados de workspace** são retidos até que você os exclua ou desinstale o software. Nenhum dado é retido em nosso lado porque nenhum é coletado.
- **Chaves de API** podem ser revogadas ou excluídas a qualquer momento através das configurações do provedor ou do keychain do sistema.
- **Log de auditoria** é retido localmente em `~/.quillby/audit.log` até que você o exclua ou rotacione. Não contém dados pessoais.
- **Cache e arquivos temporários** gerados durante a operação podem ser excluídos a qualquer momento.

## Seus Direitos sob a LGPD (Art. 18)

Como titular de dados no Brasil, você tem os seguintes direitos em relação aos seus dados pessoais. Como o Quillby não coleta nem armazena dados pessoais em nossos servidores, exercer esses direitos é simples:

- **Confirmação e acesso:** Você pode inspecionar todos os dados armazenados localmente em `~/.quillby/`.
- **Correção:** Você pode editar ou atualizar qualquer dado local diretamente.
- **Anonimização, bloqueio ou exclusão:** Você pode excluir qualquer arquivo local ou desinstalar o software completamente.
- **Portabilidade de dados:** Todos os dados são armazenados em formatos padrão (JSON, Markdown) e podem ser copiados livremente.
- **Informação sobre compartilhamento:** Esta política divulga todas as integrações com terceiros (veja “O Que Sai da Sua Máquina”).
- **Revogação do consentimento:** Você pode revogar o consentimento para processamento por terceiros a qualquer momento removendo as configurações do provedor.

Para exercer qualquer um desses direitos, basta gerenciar os dados diretamente na sua máquina ou abrir uma issue no [GitHub](https://github.com/vncsleal/quillby) para assistência. De acordo com o Art. 19 da LGPD, as solicitações serão respondidas em até **15 dias** a partir do recebimento.

## Privacidade de Crianças

O Quillby não é direcionado a crianças menores de 13 anos. Não coletamos intencionalmente nenhuma informação de crianças.

## Encarregado (Data Protection Officer — LGPD Art. 41)

Para dúvidas relacionadas à privacidade, reclamações ou para exercer seus direitos sob a LGPD, o mantenedor do projeto atua como contato de proteção de dados:

- **Contato:** Abra uma issue no [GitHub](https://github.com/vncsleal/quillby)
- **Prazo de resposta:** Até 15 dias conforme Art. 19 da LGPD

Para atendimento mais rápido, inclua “Privacidade” no título da issue.

## Cookies

O site institucional do Quillby define dois cookies funcionais:

- **`quillby-lang`** — lembra sua preferência de idioma (expira em 30 dias).
- **`quillby-cookie-dismissed`** — lembra que você dispensou o aviso de cookies (expira em 1 ano).

Nenhum desses cookies contém dados pessoais. Nenhum cookie de rastreamento, análise ou publicidade é utilizado.

## Alterações a Esta Política

Podemos atualizar esta política à medida que o Quillby evolui. Alterações materiais serão comunicadas através das notas de atualização do software. O uso continuado após as alterações constitui aceitação da política atualizada.

## Lei Aplicável

Esta Política de Privacidade é regida pelas leis da República Federativa do Brasil, especificamente pela Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
