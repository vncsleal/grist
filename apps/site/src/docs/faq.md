---
title: FAQ
description: Perguntas frequentes sobre o Quillby
order: 5
---

## Preciso de internet pra usar o Quillby?

Parcialmente. O Quillby é um app local que roda no seu computador. Ele só precisa de internet para buscar artigos das suas fontes (RSS, Reddit, Medium). O processamento e a geração de rascunhos são feitos localmente.

## Funciona sem o Claude?

Sim e não. O Quillby é um MCP server — ele funciona com qualquer cliente MCP compatível: Claude Desktop, VS Code, Cursor, Claude Code. Se você usa outro cliente de IA, verifique se ele suporta o protocolo MCP.

## Meus dados ficam seguros?

Sim. O Quillby roda **localmente** no seu computador. Seus workspaces, perfis, fontes e rascunhos ficam na pasta `~/.quillby/` no seu disco. Nenhum dado é enviado para servidores externos a menos que você configure explicitamente uma API de provedor (como ElevenLabs para geração de áudio).

## Posso usar com mais de um cliente ou projeto?

Sim. Crie um workspace pra cada cliente, projeto, newsletter ou marca pessoal. Cada workspace tem seu próprio perfil, memória, fontes e rascunhos — tudo separado.

## Quanto custa?

O Quillby é **gratuito** no modo Local. Sempre será. O Cloud mode (hospedado, com mais funcionalidades) terá planos pagos quando for lançado.

## Posso adicionar minhas próprias fontes?

Sim. O Quillby descobre fontes automaticamente baseado no seu perfil, mas você pode adicionar RSS feeds específicos a qualquer momento.

## O Quillby funciona em Windows ou Linux?

Sim. Além do macOS, o Quillby tem instaladores para Windows (.exe) e Linux (curl), além do pacote npm. Veja o guia de [instalação](/docs/instalar).

## E se eu quiser acessar de vários dispositivos?

O modo Local é para um computador só. Se você precisa de acesso multi-dispositivo ou quer compartilhar workspaces com sua equipe, o [Cloud mode](/docs/cloud) está sendo preparado.
