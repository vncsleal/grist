export const languages = {
  en: 'English',
  'pt-br': 'Português (Brasil)',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'en';

export const ui = {
  en: {
    'meta.home.title': 'Quillby — Your AI Content Agent',
    'meta.home.desc':
      'Quillby scans the internet for what matters in your niche, delivers a daily brief, and writes publish-ready drafts in your voice. Free. Runs locally.',
    'meta.blog.title': 'Blog — Quillby',
    'meta.blog.desc': 'Tutorials, guides, case studies, and updates from the Quillby team.',

    'nav.how-it-works': 'How it works',
    'nav.capabilities': 'Capabilities',
    'nav.who-its-for': 'Who it\'s for',
    'nav.github': 'GitHub',
    'nav.install-free': 'Install free',
    'nav.lang-label': 'PT-BR',
    'nav.menu-toggle': 'Toggle menu',
    'nav.menu-label': 'Menu',

    'hero.title': 'You read the brief.',
    'hero.title-em': 'It writes the post.',
    'hero.sub':
      'Quillby scans the internet for what matters in your niche, delivers a daily brief, and writes publish-ready drafts in your voice.',
    'hero.cta': 'Install free',
    'hero.ghost': 'See how it works',
    'hero.note': 'Free · Local · Works with any AI client',

    'strip.marketing': 'Marketing',
    'strip.copywriting': 'Copywriting',
    'strip.content-creation': 'Content Creation',
    'strip.freelancers': 'Freelancers',
    'strip.business-owners': 'Business Owners',
    'strip.niche-specialists': 'Niche Specialists',

    'problem.heading': 'Consistent content is a',
    'problem.heading-em': 'full-time job you didn\'t sign up for.',
    'problem.sub':
      'It\'s not that you lack ideas. It\'s that finding, filtering, and writing takes hours you don\'t have — every single day.',
    'problem.before-label': 'Before Quillby',
    'problem.after-label': 'With Quillby',
    'problem.before-1-strong': '45 minutes',
    'problem.before-1-text':
      ' scanning feeds, newsletters, and Twitter to find one thing worth writing about.',
    'problem.before-2-strong': 'Blank page paralysis.',
    'problem.before-2-text':
      ' You know your subject. You don\'t know where to start.',
    'problem.before-3-strong': 'Generic AI output.',
    'problem.before-3-text':
      ' You try ChatGPT and it sounds like a LinkedIn HR bot.',
    'problem.before-4-strong': 'Posting irregularly',
    'problem.before-4-text':
      ' because “finding something to say” isn\'t part of your job.',
    'problem.after-1-text':
      'Ask your AI <strong>“what should I post today?”</strong> and get a ranked brief of what’s relevant.',
    'problem.after-2-strong': 'One-shot drafts',
    'problem.after-2-text':
      ' sourced from real articles, structured as your kind of post.',
    'problem.after-3-strong': 'Sounds like you',
    'problem.after-3-text':
      ' — not a template. Quillby learns your voice from examples you approve.',
    'problem.after-4-strong': 'Publish consistently',
    'problem.after-4-text':
      ' without adding a single new tool, tab, or workflow to your day.',

    'how.label': 'How it works',
    'how.heading': 'Three conversations. Done.',
    'how.step-1-title': 'Install & configure',
    'how.step-1-desc':
      'Double-click the installer, restart your AI client. It asks about your niche and tone. You answer once.',
    'how.step-1-user': 'You',
    'how.step-1-user-text':
      'Set me up as a content creator for the marketing space.',
    'how.step-1-ai-text':
      'Got it. I\'ll track marketing news, ad trends, and brand case studies. What platforms do you post on?',
    'how.step-2-title': 'Get your daily brief',
    'how.step-2-desc':
      'Every morning, a curated summary of what\'s relevant to your niche. Scan it in two minutes.',
    'how.step-2-user': 'You',
    'how.step-2-user-text': 'Give me today\'s brief.',
    'how.step-2-ai-text':
      'Here\'s what\'s trending today: LinkedIn\'s algorithm update favors long-form posts, a major brand study on short-form video ROI, and three competitor campaigns worth noting…',
    'how.step-3-title': 'Draft in your voice',
    'how.step-3-desc':
      'Pick a story, ask for the post. Quillby writes a publish-ready draft based on the real article, in your established voice.',
    'how.step-3-user': 'You',
    'how.step-3-user-text':
      'Write a LinkedIn post about the algorithm update.',
    'how.step-3-ai-text':
      'Draft ready — 180 words, strong opening hook, practical advice, ends with a question to drive comments. Want me to adjust the tone?',

    'caps.label': 'Capabilities',
    'caps.heading': 'From monitoring your niche to',
    'caps.heading-em': 'publishing in your voice.',
    'caps.monitor-title': 'Monitor your niche',
    'caps.monitor-desc':
      'Discover and follow RSS feeds, Reddit communities, and niche blogs. Get a daily brief of what matters.',
    'caps.draft-title': 'Draft in your voice',
    'caps.draft-desc':
      'Generate publish-ready posts for LinkedIn, Twitter, blogs, and newsletters. Every draft matches your established tone.',
    'caps.voice-title': 'Learn your style',
    'caps.voice-desc':
      'Save voice examples, style preferences, and content guidelines per workspace. Quillby adapts to you over time.',
    'caps.workspace-title': 'Organize by client',
    'caps.workspace-desc':
      'Separate workspaces per client or brand. Each has its own memory, sources, voice profile, and content queue.',
    'caps.plan-title': 'Plan ahead',
    'caps.plan-desc':
      'Create content plans, track progress with a task board, and run multi-stage campaigns — all inside your AI client.',
    'caps.team-title': 'Team-ready',
    'caps.team-desc':
      'Share workspaces with team members. Each person gets their own role, access level, and workspace settings.',

    'camp.label': 'Campaigns & planning',
    'camp.heading': 'One post is easy.',
    'camp.heading-em': 'A month of them needs a plan.',
    'camp.campaigns-title': 'Campaigns',
    'camp.campaigns-desc':
      'Design multi-stage campaigns with automatic handoffs between stages. Save and reuse successful campaign structures as templates. Quillby moves through each stage automatically — you review the results.',
    'camp.board-title': 'Task board',
    'camp.board-desc':
      'See what\'s queued, in progress, and completed — all inside your AI client. Every campaign stage creates tasks automatically.',
    'camp.calendar-title': 'Content calendar',
    'camp.calendar-desc':
      'A weekly view of your upcoming posts, briefs, and deadlines. The today queue shows what needs your attention right now.',

    'personas.label': 'Who it\'s for',
    'personas.heading': 'Built for people who create content',
    'personas.heading-em': 'alongside everything else.',
    'personas.copywriter-name': 'Freelance Copywriter',
    'personas.copywriter-desc':
      'Multiple clients, each with their own voice. One workspace per client. Separate briefs, drafts in the right tone.',
    'personas.entrepreneur-name': 'Business Owner',
    'personas.entrepreneur-desc':
      'You know your market cold, but posting consistently? There\'s never time. Quillby keeps your brand visible without the grind.',
    'personas.marketer-name': 'Marketing Professional',
    'personas.marketer-desc':
      'Track competitors, surface trends, spot case studies. Turn all of it into content your audience actually reads.',
    'personas.niche-name': 'Niche Specialist',
    'personas.niche-desc':
      'Law, finance, health, education, tech. Any field where consistent content builds authority — and silence erodes it.',

    'install.label': 'Get started',
    'install.heading': 'Three minutes to your',
    'install.heading-em': 'first draft.',
    'install.macos-tab': 'macOS',
    'install.windows-tab': 'Windows',
    'install.npx-tab': 'npx',
    'install.macos-cta': 'Download for Mac',
    'install.macos-note':
      'Classic package installer — double-click and follow the prompts.',
    'install.windows-cta': 'Download for Windows',
    'install.npx-command': 'npx -y @vncsleal/quillby quillby-mcp',
    'install.copied-label': 'Copied!',
    'install.copy-command': 'Copy command',
    'install.npx-note':
      'Works on any platform with <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">Node.js</a> installed. No download needed — npx runs it directly.',
    'install.step-1-title': 'Install Quillby',
    'install.step-1-detail': 'Choose your platform on the left. No account needed.',
    'install.step-2-title': 'Restart your AI client',
    'install.step-2-detail':
      'Quillby appears automatically the next time you open your AI client.',
    'install.step-3-title': 'Configure your niche',
    'install.step-3-detail':
      'Your AI client asks two questions. Answer once — that\'s the setup.',

    'trust.runs-local': 'Runs on your machine',
    'trust.no-account': 'No account needed',
    'trust.free-open-source': 'Free and open source',

    'faq.label': 'FAQ',
    'faq.heading': 'Common questions',
    'faq.q-1': 'Do I need to know how to code?',
    'faq.a-1':
      'No. If you can have a conversation with an AI assistant, you can use Quillby.',
    'faq.q-2': 'Does it work for any niche?',
    'faq.a-2':
      'Yes. Tech, law, finance, health, education, marketing — any field with content online.',
    'faq.q-3': 'I have multiple clients. Will they mix?',
    'faq.a-3':
      'No. Each workspace has its own memory and sources. Client A never bleeds into Client B.',
    'faq.q-4': 'Is my data safe?',
    'faq.a-4':
      'Everything runs on your machine. Nothing leaves it. The code is open source and auditable.',
    'faq.q-5': 'Is it free?',
    'faq.a-5':
      'Local mode is completely free. Always will be. A Cloud mode with shared workspaces and a team dashboard is in development.',
    'faq.q-6': 'Do I need a specific AI client?',
    'faq.a-6':
      'Yes. Quillby works with any MCP-compatible AI client. It gives your AI assistant new abilities — scanning feeds, drafting posts, planning campaigns — without leaving the chat.',
    'faq.q-7': 'Does it learn my writing style?',
    'faq.a-7':
      'Yes. Every draft you save becomes a voice example. Over time Quillby adapts to your tone, vocabulary, and sentence rhythm. Different workspaces can have different voices.',
    'faq.q-8': 'Can I plan content ahead of time?',
    'faq.a-8':
      'Yes. Quillby has a campaign system for multi-stage content series, a task board to track progress, and a calendar to see what\'s publishing when. All inside your AI client.',
    'faq.q-9': 'Can it generate images or audio?',
    'faq.a-9':
      'Quillby can generate images and audio if you connect a supported service like OpenAI or ElevenLabs. This is an optional add-on — the core brief-to-draft workflow works with nothing else to configure.',
    'faq.q-10': 'Is Quillby open source?',
    'faq.a-10':
      'Yes. MIT licensed. The full source is on <a href="https://github.com/vncsleal/quillby" target="_blank" rel="noopener noreferrer" class="faq-link">GitHub</a>. You can inspect it, fork it, or contribute.',

    'cta.heading': 'Stop reading feeds.',
    'cta.heading-em': 'Start shipping content.',
    'cta.sub': 'Install in three minutes. Your first brief, right after.',
    'cta.cta': 'Install Quillby free',

    'cookie.text':
      'This site uses a functional cookie to remember your language preference. No personal data is collected.',
    'cookie.link': 'Learn more',
    'cookie.dismiss': 'Got it',

    'footer.nav-label': 'Footer navigation',
    'footer.tagline': 'Your AI content agent.',
    'footer.product': 'Product',
    'footer.how-it-works': 'How it works',
    'footer.who-its-for': 'Who it\'s for',
    'footer.install': 'Install',
    'footer.faq': 'FAQ',
    'footer.resources': 'Resources',
    'footer.github': 'GitHub',
    'footer.legal': 'Legal',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    'footer.bottom': 'Free · Open source · Local-first',

    'blog.title': 'Blog',
    'blog.intro':
      'Coming soon — tutorials, guides, case studies, and updates.',
  },

  'pt-br': {
    'meta.home.title': 'Quillby — Seu Agente de Conteúdo AI',
    'meta.home.desc':
      'O Quillby varre a internet pelo que importa pro seu nicho, entrega um resumo curado e escreve rascunhos prontos pra publicar na sua voz. Grátis. Roda localmente.',
    'meta.blog.title': 'Blog — Quillby',
    'meta.blog.desc':
      'Tutoriais, guias, estudos de caso e atualizações da equipe Quillby.',

    'nav.how-it-works': 'Como funciona',
    'nav.capabilities': 'Capacidades',
    'nav.who-its-for': 'Para quem é',
    'nav.github': 'GitHub',
    'nav.install-free': 'Instalar grátis',
    'nav.lang-label': 'EN',
    'nav.menu-toggle': 'Alternar menu',
    'nav.menu-label': 'Menu',

    'hero.title': 'Você lê o resumo.',
    'hero.title-em': 'Ele escreve o post.',
    'hero.sub':
      'O Quillby varre a internet pelo que importa pro seu nicho, entrega um resumo diário e escreve rascunhos prontos pra publicar na sua voz.',
    'hero.cta': 'Instalar grátis',
    'hero.ghost': 'Como funciona',
    'hero.note': 'Grátis · Local · Funciona com qualquer cliente de IA',

    'strip.marketing': 'Marketing',
    'strip.copywriting': 'Copywriting',
    'strip.content-creation': 'Criação de Conteúdo',
    'strip.freelancers': 'Freelancers',
    'strip.business-owners': 'Empreendedores',
    'strip.niche-specialists': 'Especialistas de Nicho',

    'problem.heading': 'Criar conteúdo consistente é um',
    'problem.heading-em':
      'trabalho em tempo integral que você não pediu.',
    'problem.sub':
      'Não é falta de ideia. É que encontrar, filtrar e escrever toma horas que você não tem — todo santo dia.',
    'problem.before-label': 'Antes do Quillby',
    'problem.after-label': 'Com o Quillby',
    'problem.before-1-strong': '45 minutos',
    'problem.before-1-text':
      ' vasculhando feeds, newsletters e Twitter pra achar um tópico.',
    'problem.before-2-strong': 'Paralisia da página em branco.',
    'problem.before-2-text':
      ' Você sabe do assunto, mas não sabe por onde começar.',
    'problem.before-3-strong': 'Texto AI genérico.',
    'problem.before-3-text':
      ' Você tenta o ChatGPT e parece um robô do LinkedIn.',
    'problem.before-4-strong': 'Publicação irregular',
    'problem.before-4-text':
      ' porque “achar o que dizer” não faz parte do seu trabalho.',
    'problem.after-1-text':
      'Pergunte ao seu assistente “o que eu posto hoje?” e receba um resumo do que é relevante.',
    'problem.after-2-strong': 'Rascunhos prontos',
    'problem.after-2-text':
      ' baseados em artigos reais, estruturados no seu estilo.',
    'problem.after-3-strong': 'Parece com você',
    'problem.after-3-text':
      ' — não um template. O Quillby aprende sua voz com exemplos que você aprova.',
    'problem.after-4-strong': 'Publique consistentemente',
    'problem.after-4-text':
      ' sem adicionar uma única ferramenta, aba ou fluxo novo ao seu dia.',

    'how.label': 'Como funciona',
    'how.heading': 'Três conversas. Pronto.',
    'how.step-1-title': 'Instale e configure',
    'how.step-1-desc':
      'Clique duas vezes no instalador, reinicie seu cliente de IA. Ele pergunta seu nicho e seu tom. Você responde uma vez.',
    'how.step-1-user': 'Você',
    'how.step-1-user-text':
      'Me configura como criador de conteúdo de marketing.',
    'how.step-1-ai-text':
      'Entendi! Vou acompanhar notícias de marketing, tendências de anúncios e cases de marca. Em quais plataformas você posta?',
    'how.step-2-title': 'Resumo diário',
    'how.step-2-desc':
      'Todo dia, um resumo do que saiu de relevante pro seu nicho. Você escaneia em 2 minutos.',
    'how.step-2-user': 'Você',
    'how.step-2-user-text': 'Me dá o resumo de hoje.',
    'how.step-2-ai-text':
      'Aqui estão as tendências de hoje: LinkedIn atualizou o algoritmo favorecendo posts longos, um estudo grande sobre ROI de vídeo curto, e três campanhas de concorrentes que vale a pena comentar…',
    'how.step-3-title': 'Rascunho na hora',
    'how.step-3-desc':
      'Escolheu um tópico? Peça o post. O Quillby escreve um rascunho na sua voz, baseado no artigo real.',
    'how.step-3-user': 'Você',
    'how.step-3-user-text':
      'Escreve um post sobre a atualização do LinkedIn.',
    'how.step-3-ai-text':
      'Rascunho pronto — 180 palavras, abertura com gancho, dicas práticas, termina com pergunta pra gerar comentários. Quer ajustar o tom?',

    'caps.label': 'Capacidades',
    'caps.heading': 'De monitorar seu nicho a',
    'caps.heading-em': 'publicar na sua voz.',
    'caps.monitor-title': 'Monitore seu nicho',
    'caps.monitor-desc':
      'Descubra e siga feeds RSS, comunidades do Reddit e blogs especializados. Receba um resumo diário do que importa.',
    'caps.draft-title': 'Rascunhe na sua voz',
    'caps.draft-desc':
      'Gere posts prontos para LinkedIn, Twitter, blogs e newsletters. Cada rascunho combina com seu tom estabelecido.',
    'caps.voice-title': 'Aprenda seu estilo',
    'caps.voice-desc':
      'Salve exemplos de voz, preferências de estilo e diretrizes de conteúdo por workspace. O Quillby se adapta a você com o tempo.',
    'caps.workspace-title': 'Organize por cliente',
    'caps.workspace-desc':
      'Workspaces separados por cliente ou marca. Cada um com sua própria memória, fontes, perfil de voz e fila de conteúdo.',
    'caps.plan-title': 'Planeje com antecedência',
    'caps.plan-desc':
      'Crie planos de conteúdo, acompanhe o progresso com um quadro de tarefas e execute campanhas de múltiplos estágios — tudo dentro do seu cliente de IA.',
    'caps.team-title': 'Pronto para equipe',
    'caps.team-desc':
      'Compartilhe workspaces com membros da equipe. Cada pessoa tem seu próprio papel, nível de acesso e configurações.',

    'camp.label': 'Campanhas & planejamento',
    'camp.heading': 'Um post é fácil.',
    'camp.heading-em': 'Um mês deles precisa de um plano.',
    'camp.campaigns-title': 'Campanhas',
    'camp.campaigns-desc':
      'Crie campanhas de múltiplos estágios com transições automáticas entre etapas. Salve e reutilize estruturas de sucesso como modelos. O Quillby avança por cada estágio — você revisa os resultados.',
    'camp.board-title': 'Quadro de tarefas',
    'camp.board-desc':
      'Veja o que está na fila, em andamento e concluído — tudo dentro do seu cliente de IA. Cada estágio de campanha cria tarefas automaticamente.',
    'camp.calendar-title': 'Calendário de conteúdo',
    'camp.calendar-desc':
      'Uma visão semanal dos seus próximos posts, resumos e prazos. A fila do dia mostra o que precisa da sua atenção agora.',

    'personas.label': 'Para quem é',
    'personas.heading': 'Feito para quem cria conteúdo',
    'personas.heading-em': 'junto com tudo o mais.',
    'personas.copywriter-name': 'Copywriter Freelancer',
    'personas.copywriter-desc':
      'Vários clientes, cada um com sua voz. Um workspace por cliente. Resumos separados, rascunhos no tom certo.',
    'personas.entrepreneur-name': 'Empreendedor',
    'personas.entrepreneur-desc':
      'Você entende do seu mercado, mas postar consistentemente? Nunca tem tempo. O Quillby mantém sua marca visível sem o esforço.',
    'personas.marketer-name': 'Profissional de Marketing',
    'personas.marketer-desc':
      'Monitore concorrentes, identifique tendências e transforme tudo em conteúdo que sua audiência realmente lê.',
    'personas.niche-name': 'Especialista de Nicho',
    'personas.niche-desc':
      'Direito, finanças, saúde, educação, tech. Qualquer área onde conteúdo consistente constrói autoridade — e o silêncio a derruba.',

    'install.label': 'Comece agora',
    'install.heading': 'Três minutos até seu',
    'install.heading-em': 'primeiro rascunho.',
    'install.macos-tab': 'macOS',
    'install.windows-tab': 'Windows',
    'install.npx-tab': 'npx',
    'install.macos-cta': 'Baixar para Mac',
    'install.macos-note':
      'Instalador .pkg — clique duas vezes e siga as instruções.',
    'install.windows-cta': 'Baixar para Windows',
    'install.npx-command': 'npx -y @vncsleal/quillby quillby-mcp',
    'install.copied-label': 'Copiado!',
    'install.copy-command': 'Copiar comando',
    'install.npx-note':
      'Funciona em qualquer plataforma com <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">Node.js</a>. Não precisa baixar — o npx executa diretamente.',
    'install.step-1-title': 'Instale o Quillby',
    'install.step-1-detail': 'Escolha sua plataforma ao lado. Sem cadastro.',
    'install.step-2-title': 'Reinicie seu cliente de IA',
    'install.step-2-detail':
      'O Quillby aparece automaticamente na próxima vez que você abrir seu cliente de IA.',
    'install.step-3-title': 'Configure seu nicho',
    'install.step-3-detail':
      'Seu cliente de IA faz duas perguntas. Você responde uma vez — e está pronto.',

    'trust.runs-local': 'Roda na sua máquina',
    'trust.no-account': 'Sem cadastro',
    'trust.free-open-source': 'Grátis e open source',

    'faq.label': 'FAQ',
    'faq.heading': 'Dúvidas comuns',
    'faq.q-1': 'Precisa saber programar?',
    'faq.a-1':
      'Não. Se você sabe conversar com um assistente de IA, você sabe usar o Quillby.',
    'faq.q-2': 'Funciona com qualquer nicho?',
    'faq.a-2':
      'Sim. Tech, direito, finanças, saúde, educação, marketing — qualquer área com conteúdo online.',
    'faq.q-3': 'E se eu tiver mais de um cliente?',
    'faq.a-3':
      'Não. Cada workspace tem sua própria memória e fontes. Cliente A não mistura com cliente B.',
    'faq.q-4': 'Meus dados ficam seguros?',
    'faq.a-4':
      'Tudo roda na sua máquina. Nada sai dela. O código é open source e auditável.',
    'faq.q-5': 'É pago?',
    'faq.a-5':
      'O modo local é completamente grátis. Sempre será. Um modo Cloud com workspaces compartilhados e dashboard está em desenvolvimento.',
    'faq.q-6': 'Precisa de um cliente de IA específico?',
    'faq.a-6':
      'Sim. O Quillby funciona com qualquer cliente de IA compatível com MCP. Ele dá ao seu assistente de IA novas habilidades — ler feeds, escrever posts, planejar campanhas — sem sair do chat.',
    'faq.q-7': 'Ele aprende meu estilo de escrita?',
    'faq.a-7':
      'Sim. Cada rascunho que você salva vira um exemplo de voz. Com o tempo o Quillby se adapta ao seu tom, vocabulário e ritmo de frases. Workspaces diferentes podem ter vozes diferentes.',
    'faq.q-8': 'Posso planejar conteúdo com antecedência?',
    'faq.a-8':
      'Sim. O Quillby tem um sistema de campanhas para séries de conteúdo em múltiplos estágios, um quadro de tarefas para acompanhar o progresso e um calendário para ver o que vai publicar quando. Tudo dentro do seu cliente de IA.',
    'faq.q-9': 'Consegue gerar imagens ou áudio?',
    'faq.a-9':
      'O Quillby pode gerar imagens e áudio se você conectar um serviço compatível como OpenAI ou ElevenLabs. Isso é um complemento opcional — o fluxo principal de resumo-para-rascunho funciona sem nada adicional.',
    'faq.q-10': 'O Quillby é open source?',
    'faq.a-10':
      'Sim. Licenciado sob MIT. O código fonte completo está no <a href="https://github.com/vncsleal/quillby" target="_blank" rel="noopener noreferrer" class="faq-link">GitHub</a>. Você pode inspecionar, fazer fork ou contribuir.',

    'cta.heading': 'Pare de rolar o feed.',
    'cta.heading-em': 'Comece a publicar conteúdo.',
    'cta.sub': 'Instale em três minutos. Seu primeiro resumo logo depois.',
    'cta.cta': 'Instalar Quillby grátis',

    'cookie.text':
      'Este site utiliza um cookie funcional para lembrar sua preferência de idioma. Nenhum dado pessoal é coletado.',
    'cookie.link': 'Saiba mais',
    'cookie.dismiss': 'OK',

    'footer.nav-label': 'Navegação do rodapé',
    'footer.tagline': 'Seu agente de conteúdo AI.',
    'footer.product': 'Produto',
    'footer.how-it-works': 'Como funciona',
    'footer.who-its-for': 'Para quem é',
    'footer.install': 'Instalar',
    'footer.faq': 'FAQ',
    'footer.resources': 'Recursos',
    'footer.github': 'GitHub',
    'footer.legal': 'Legal',
    'footer.privacy': 'Política de Privacidade',
    'footer.terms': 'Termos de Serviço',
    'footer.bottom': 'Grátis · Open source · Local-first',

    'blog.title': 'Blog',
    'blog.intro':
      'Em breve — tutoriais, guias, estudos de caso e atualizações.',
  },
} as const;

export type TranslationKey = keyof typeof ui[typeof defaultLang];
