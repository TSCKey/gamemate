# Política de privacidade

Esta é uma tradução para sua conveniência. A [versão em inglês](../PRIVACY.md) é a vinculativa.

Versão 2 · Última atualização: 4 de novembro de 2026

Esta política explica o que acontece com os seus dados pessoais quando você usa o GameMate. Ela foi escrita para atender ao Regulamento Geral sobre a Proteção de Dados da UE (RGPD), à lei alemã de proteção de dados em telecomunicações e serviços digitais (TDDDG) e à Lei de Proteção de Dados Pessoais do Reino da Arábia Saudita (PDPL).

## 1. Quem é o responsável

**Omar Abulebda**, o fornecedor do GameMate.
E-mail: [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com)

## 2. Em resumo

- O GameMate roda no seu PC. **Não recebemos, coletamos nem armazenamos nenhum dos seus dados.** Não há servidor do GameMate, conta, publicidade, análise nem rastreamento.
- Tudo o que o GameMate guarda fica no seu PC, na sua pasta de usuário do Windows.
- O GameMate só se conecta a serviços de outras empresas quando você usa um recurso que precisa deles. Os recursos que enviam seus dados para outro lugar (Google Gemini, pesquisa na web, consultas on-line, busca das wikis dos seus jogos) ficam **desativados até que você os ative**, e você pode desativá-los a qualquer momento. Você pode ativar a busca dos seus jogos e as consultas on-line na tela que o GameMate mostra depois que você aceita os Termos de uso, ou qualquer um desses recursos mais tarde em **Configurações**.
- **Apagar meus dados** em **Configurações → Privacidade e aspectos legais** remove tudo o que o GameMate guardou no seu PC.

## 3. O que o GameMate guarda no seu PC

O GameMate guarda o seguinte na pasta dele no seu perfil de usuário do Windows, que só a sua conta do Windows pode ler. Guardar isso é necessário para oferecer os recursos que você usa (§ 25 (2) n.º 2 TDDDG).

| O quê                                                                                                                   | Por quê                                                            | Por quanto tempo                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Suas configurações, inclusive quando você aceitou estes documentos e deu cada consentimento                             | Para lembrar suas escolhas e como registro dos seus consentimentos | Até você mudá-las ou apagar seus dados                                           |
| Sua chave de API do Gemini, se você adicionar uma, criptografada pelo Windows                                           | Para usar o Gemini                                                 | Até você removê-la, retirar seu consentimento ao Gemini ou apagar seus dados     |
| Modelos de IA, o mecanismo de IA do GameMate, modelos de fala e vozes que você baixou                                   | Para rodar a IA no seu PC                                          | Até você removê-los ou apagar seus dados                                         |
| Jogos encontrados ou adicionados: nome, pasta ou programa, endereço da wiki                                             | Para ajudar no jogo que você está jogando                          | Até você retirar esse consentimento ou apagar seus dados                         |
| Um registro do que o GameMate fez (por exemplo, iniciar a IA ou procurar atualizações), sem suas perguntas ou respostas | Para encontrar e corrigir problemas                                | Cerca de 1 MB; as entradas mais antigas são sobrescritas; apagado com seus dados |

Suas conversas, capturas de tela, gravações de voz e o que o companheiro percebeu ficam **somente na memória** e somem quando você fecha o chat, desliga o companheiro ou sai do GameMate. Capturas de tela e gravações de voz nunca são salvas no disco.

## 4. O que o GameMate faz no seu PC

- **Sua tela** só é capturada quando você envia uma pergunta com captura de tela, pressiona o atalho do jogo com as capturas ativadas ou enquanto o companheiro estiver configurado para observar seu jogo. Você escolhe isso no aplicativo; o companheiro vem desativado.
- **Seu microfone** só é usado enquanto a entrada de voz está ativada e você pressiona o atalho de voz ou 🎤. Sua fala é transformada em texto no seu PC.
- **O modelo de IA** que roda no seu PC (o mecanismo do próprio GameMate, ou o Ollama, se você usá-lo) recebe suas perguntas e capturas de tela somente no seu PC.

## 5. Recursos opcionais que precisam do seu consentimento

Estes recursos ficam desativados até que você os ative. Ativar um deles é o seu consentimento ao que está descrito aqui (art. 6 (1) (a) RGPD, § 25 (1) TDDDG, PDPL). Você pode retirar cada consentimento a qualquer momento desativando o recurso; isso interrompe o recurso e não afeta nada do que foi feito antes. Você também pode ativar a busca dos seus jogos e as consultas on-line na tela que o GameMate mostra depois que você aceita os Termos de uso.

### Encontrar seus jogos (Configurações → Jogos)

O GameMate lê as listas de jogos do Steam, Epic Games, Battle.net e Riot no seu PC, suas pastas de modpacks do CurseForge e o nome do programa em primeiro plano. Isso fica no seu PC. Para encontrar a wiki de cada jogo, **somente o nome do jogo** é enviado ao wiki.gg e ao Fandom. Retirar esse consentimento também apaga a lista de jogos que o GameMate encontrou.

### Consultas on-line (Configurações → IA e on-line)

Quando uma pergunta é sobre algo em um jogo, o GameMate envia **o tema** (por exemplo, "Ender Dragon") à wiki desse jogo (como minecraft.wiki, uma wiki do Fandom ou uma wiki do wiki.gg) e, para mods de Minecraft, o nome do mod ao Modrinth, e baixa o texto da página e as imagens que mostra a você. A sua pergunta em si não é enviada.

### Pesquisa na web (Configurações → IA e on-line)

Disponível apenas enquanto o Gemini estiver ativado. Para perguntas sobre o que está em alta (o meta, patches, temporadas) ou o que os jogadores recomendam, e quando a wiki não tem resposta, o GameMate ou a IA monta uma curta **consulta de pesquisa** com as palavras-chave da sua pergunta e o nome do jogo (por exemplo, "Overwatch characters currently meta"), e o GameMate envia somente essa consulta ao Google pela API do Gemini, com a sua chave de API. Sua conversa, capturas de tela e outras perguntas não são enviadas junto. O Google pesquisa na web (inclusive em fóruns como o Reddit) e devolve um resumo, as páginas que usou e suas sugestões de pesquisa, que o GameMate mostra com a resposta. O Google processa a consulta de acordo com os termos da API do Gemini e com a sua política de privacidade (veja Google Gemini abaixo). As pesquisas contam para a cota gratuita do Google Search da sua chave de API; se o faturamento estiver ativado para a sua chave, o Google pode cobrar as pesquisas além dela.

### Google Gemini (Configurações → IA e on-line)

Se você escolher o Gemini para as respostas ou para o companheiro, o GameMate envia ao Google: suas perguntas, a conversa até ali, as capturas de tela que você anexa ou que o companheiro tira, o que o companheiro percebeu recentemente e a sua chave de API. O Google trata esses dados de acordo com os [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) e a [Política de Privacidade do Google](https://policies.google.com/privacy), como controlador independente. Dependendo da sua conta do Google, o Google pode usar esses dados para melhorar seus serviços. O Google exige que você tenha pelo menos 18 anos.

## 6. Conexões que não são consentimentos opcionais

- **Os downloads que você inicia** (modelos de IA, modelos de fala e a voz natural do Hugging Face, o mecanismo de IA do GameMate do GitHub) se conectam a esses serviços quando você clica em **Baixar**, porque você os pediu (art. 6 (1) (b) RGPD). Marcar um download nessa tela e clicar em **Continuar** também o inicia.
- **A busca por atualizações** pergunta ao GitHub qual é a versão mais recente do GameMate, logo depois de ele iniciar e a cada poucas horas, e baixa uma nova versão se houver. Fazemos isso para entregar correções de segurança e melhorias (nosso interesse legítimo, art. 6 (1) (f) RGPD). Você pode desativar isso em **Configurações → Geral**. O GameMate não procura atualizações antes de você aceitar os Termos de uso.

Como qualquer conexão na internet, essas solicitações mostram ao serviço o seu endereço IP e informações técnicas básicas (como o nome e a versão do aplicativo). Nós nunca recebemos essas informações.

## 7. Quem recebe dados

Somente os serviços que você usa pelo GameMate, cada um como controlador independente, de acordo com a sua própria política de privacidade: Google (Gemini), as wikis de jogos que você consulta (por exemplo, Fandom, wiki.gg, minecraft.wiki), Modrinth, Hugging Face e GitHub (que pertence à Microsoft). Não vendemos nem compartilhamos seus dados com ninguém, porque nunca os temos.

## 8. Transferências para outros países

Alguns desses serviços têm sede, ou tratam dados, nos Estados Unidos ou em outros países fora da UE e fora da Arábia Saudita. Os dados só chegam a eles quando você usa o recurso que se conecta a eles. Para transferências a partir da UE, essas empresas se baseiam em garantias previstas no RGPD, como o EU-US Data Privacy Framework ou cláusulas contratuais-padrão. Se você mora na Arábia Saudita, usar esses recursos significa que os seus dados são transferidos para fora do Reino a seu pedido.

## 9. Seus direitos

Pelo RGPD, você tem direito de acessar seus dados (art. 15), de corrigi-los (art. 16), de apagá-los (art. 17), de limitar o tratamento (art. 18), de recebê-los em formato portátil (art. 20), de se opor ao tratamento baseado em interesses legítimos (art. 21) e de retirar qualquer consentimento a qualquer momento (art. 7 (3)). Pela PDPL, você tem direito de ser informado, de acessar seus dados e obter uma cópia, de corrigi-los, completá-los ou atualizá-los, de destruí-los e de retirar o seu consentimento.

Como tudo o que o GameMate guarda está no seu próprio PC, você pode exercer a maioria desses direitos diretamente no GameMate: ver e mudar suas escolhas nas Configurações, desativar recursos opcionais e usar **Apagar meus dados**. Para dados mantidos pelo Google, pelas wikis, pelo Hugging Face ou pelo GitHub, entre em contato com esses serviços. Para qualquer outra coisa, escreva para [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com).

## 10. Reclamações

Você pode reclamar a uma autoridade de proteção de dados, em especial a do lugar onde você mora ou trabalha:

- **Na UE:** a sua autoridade nacional de proteção de dados ([lista das autoridades da UE](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en)). Na Alemanha, é a autoridade de proteção de dados do seu estado.
- **Na Arábia Saudita:** a Saudi Data & AI Authority (SDAIA), que supervisiona a PDPL ([sdaia.gov.sa](https://sdaia.gov.sa)).

## 11. Crianças e adolescentes

O GameMate se destina a pessoas a partir de 16 anos, ou mais novas com a permissão de um dos pais ou de um responsável legal. O Gemini é só para pessoas a partir de 18 anos, como o Google exige.

## 12. Nenhuma decisão automatizada

O GameMate não toma decisões sobre você que tenham efeitos jurídicos ou efeitos igualmente significativos. A IA apenas responde às suas perguntas.

## 13. Mudanças nesta política

Se mudarmos esta política, a nova versão vem com uma atualização do GameMate, e o GameMate a mostra a você antes de continuar. Você sempre pode ler a versão atual em **Configurações → Privacidade e aspectos legais**.

## 14. Traduções

Esta política também está disponível em outros idiomas no GameMate. As traduções são para sua conveniência. Se uma tradução for diferente da versão em inglês, prevalece a versão em inglês.
