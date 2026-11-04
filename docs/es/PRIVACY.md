# Política de privacidad

Esta es una traducción para tu comodidad. La [versión en inglés](../PRIVACY.md) es la vinculante.

Versión 2 · Última actualización: 4 de noviembre de 2026

Esta política explica qué ocurre con tus datos personales cuando usas GameMate. Está redactada para cumplir el Reglamento General de Protección de Datos de la UE (RGPD), la ley alemana de protección de datos en telecomunicaciones y servicios digitales (TDDDG) y la Ley de Protección de Datos Personales del Reino de Arabia Saudí (PDPL).

## 1. Quién es el responsable

**Omar Abulebda**, el proveedor de GameMate.
Correo electrónico: [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com)

## 2. En resumen

- GameMate se ejecuta en tu PC. **No recibimos, recopilamos ni almacenamos ninguno de tus datos.** No hay servidor de GameMate, ni cuenta, ni publicidad, ni analítica, ni seguimiento.
- Todo lo que GameMate guarda se queda en tu PC, en tu carpeta de usuario de Windows.
- GameMate solo se conecta a servicios de otras empresas cuando usas una función que los necesita. Las funciones que envían tus datos a otro lugar (Google Gemini, búsqueda web, consultas en línea, búsqueda de las wikis de tus juegos) están **desactivadas hasta que las activas**, y puedes desactivarlas en cualquier momento.
- **Borrar mis datos** en **Ajustes → Privacidad y aspectos legales** elimina todo lo que GameMate guardó en tu PC.

## 3. Qué guarda GameMate en tu PC

GameMate guarda lo siguiente en su carpeta de tu perfil de usuario de Windows, que solo puede leer tu cuenta de Windows. Guardarlo es necesario para ofrecer las funciones que usas (§ 25 (2) n.º 2 TDDDG).

| Qué                                                                                                                        | Para qué                                                            | Cuánto tiempo                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tus ajustes, incluido cuándo aceptaste estos documentos y diste cada consentimiento                                        | Para recordar tus elecciones y como registro de tus consentimientos | Hasta que los cambies o borres tus datos                                    |
| Tu clave API de Gemini, si añades una, cifrada por Windows                                                                 | Para usar Gemini                                                    | Hasta que la quites, retires tu consentimiento de Gemini o borres tus datos |
| Los modelos de IA, el motor de IA de GameMate, los modelos de voz y las voces que descargaste                              | Para ejecutar la IA en tu PC                                        | Hasta que los quites o borres tus datos                                     |
| Juegos encontrados o añadidos: nombre, carpeta o programa, dirección de la wiki                                            | Para ayudarte con el juego al que juegas                            | Hasta que retires ese consentimiento o borres tus datos                     |
| Un registro de lo que hizo GameMate (por ejemplo, iniciar la IA o buscar actualizaciones), sin tus preguntas ni respuestas | Para encontrar y corregir problemas                                 | Unos 1 MB; las entradas antiguas se sobrescriben; se borra con tus datos    |

Tus conversaciones, capturas de pantalla, grabaciones de voz y lo que el compañero notó se **guardan solo en memoria** y desaparecen cuando cierras el chat, apagas el compañero o sales de GameMate. Las capturas de pantalla y las grabaciones de voz nunca se guardan en el disco.

## 4. Qué hace GameMate en tu PC

- **Tu pantalla** solo se captura cuando envías una pregunta con una captura de pantalla, pulsas el atajo del juego con las capturas activadas, o mientras el compañero está configurado para observar tu juego. Tú lo eliges en la aplicación; el compañero está desactivado por defecto.
- **Tu micrófono** solo se usa mientras la entrada de voz está activada y pulsas el atajo de voz o 🎤. Tu voz se convierte en texto en tu PC.
- **El modelo de IA** que se ejecuta en tu PC (el motor propio de GameMate, u Ollama si lo usas) recibe tus preguntas y capturas solo en tu PC.

## 5. Funciones opcionales que necesitan tu consentimiento

Estas funciones están desactivadas hasta que las activas. Activar una supone tu consentimiento a lo que se describe aquí (art. 6 (1) (a) RGPD, § 25 (1) TDDDG, PDPL). Puedes retirar cada consentimiento en cualquier momento desactivando la función; esto detiene la función y no afecta a nada de lo hecho antes.

### Encontrar tus juegos (Ajustes → Juegos)

GameMate lee las listas de juegos de Steam, Epic Games, Battle.net y Riot en tu PC, tus carpetas de modpacks de CurseForge y el nombre del programa en primer plano. Esto se queda en tu PC. Para encontrar la wiki de cada juego, **solo se envía el nombre del juego** a wiki.gg y Fandom. Retirar este consentimiento también borra la lista de juegos que encontró GameMate.

### Consultas en línea (Ajustes → IA y en línea)

Cuando una pregunta trata sobre algo de un juego, GameMate envía **el tema** (por ejemplo, «Ender Dragon») a la wiki de ese juego (como minecraft.wiki, una wiki de Fandom o una wiki de wiki.gg) y, en el caso de mods de Minecraft, el nombre del mod a Modrinth, y descarga el texto de la página y las imágenes que te muestra. Tu pregunta en sí no se envía.

### Búsqueda web (Ajustes → IA y en línea)

Solo disponible mientras Gemini está activado. Para preguntas sobre lo que está de actualidad (el meta, los parches, las temporadas) o lo que recomiendan los jugadores, y cuando la wiki no tiene respuesta, GameMate o la IA forma una breve **consulta de búsqueda** con las palabras clave de tu pregunta y el nombre del juego (por ejemplo, «Overwatch characters currently meta»), y GameMate envía solo esa consulta a Google a través de la API de Gemini con tu clave API. Tu conversación, tus capturas y tus otras preguntas no se envían con ella. Google busca en la web (incluidos foros como Reddit) y devuelve un resumen, las páginas que usó y sus sugerencias de búsqueda, que GameMate muestra con la respuesta. Google procesa la consulta según los términos de la API de Gemini y su política de privacidad (consulta Google Gemini más abajo). Las búsquedas cuentan para la cuota gratuita de Google Search de tu clave API; si la facturación está activada para tu clave, Google puede cobrar las búsquedas que la superen.

### Google Gemini (Ajustes → IA y en línea)

Si eliges Gemini para las respuestas o para el compañero, GameMate envía a Google: tus preguntas, la conversación hasta ese momento, las capturas que adjuntas o que toma el compañero, lo que el compañero notó recientemente y tu clave API. Google trata estos datos según los [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) y la [Política de privacidad de Google](https://policies.google.com/privacy), como responsable independiente. Según tu cuenta de Google, Google puede usar estos datos para mejorar sus servicios. Google exige que tengas al menos 18 años.

## 6. Conexiones que no son consentimientos opcionales

- **Las descargas que inicias** (modelos de IA, modelos de voz y la voz natural desde Hugging Face, el motor de IA de GameMate desde GitHub) se conectan a esos servicios cuando haces clic en **Descargar**, porque tú las pediste (art. 6 (1) (b) RGPD).
- **La búsqueda de actualizaciones** pide a GitHub la última versión de GameMate, poco después de que se inicia y cada pocas horas, y descarga una nueva versión si la hay. Lo hacemos para ofrecer correcciones de seguridad y mejoras (nuestro interés legítimo, art. 6 (1) (f) RGPD). Puedes desactivarla en **Ajustes → General**. GameMate no busca actualizaciones antes de que hayas aceptado los Términos de uso.

Como cualquier conexión en internet, estas solicitudes muestran al servicio tu dirección IP e información técnica básica (como el nombre y la versión de la aplicación). Nosotros nunca recibimos esta información.

## 7. Quién recibe datos

Solo los servicios que usas a través de GameMate, cada uno como responsable independiente según su propia política de privacidad: Google (Gemini), las wikis de juegos que consultas (por ejemplo, Fandom, wiki.gg, minecraft.wiki), Modrinth, Hugging Face y GitHub (que pertenece a Microsoft). No vendemos ni compartimos tus datos con nadie, porque nunca los tenemos.

## 8. Transferencias a otros países

Algunos de estos servicios tienen su sede, o tratan datos, en Estados Unidos u otros países fuera de la UE y fuera de Arabia Saudí. Los datos solo les llegan cuando usas la función que se conecta con ellos. Para las transferencias desde la UE, estas empresas se basan en garantías del RGPD, como el EU-US Data Privacy Framework o las cláusulas contractuales tipo. Si vives en Arabia Saudí, usar estas funciones significa que tus datos se transfieren fuera del Reino a petición tuya.

## 9. Tus derechos

Según el RGPD, tienes derecho a acceder a tus datos (art. 15), a rectificarlos (art. 16), a que se supriman (art. 17), a limitar su tratamiento (art. 18), a recibirlos en un formato portátil (art. 20), a oponerte al tratamiento basado en intereses legítimos (art. 21) y a retirar cualquier consentimiento en cualquier momento (art. 7 (3)). Según la PDPL, tienes derecho a ser informado, a acceder a tus datos y obtener una copia, a que se corrijan, completen o actualicen, a que se destruyan y a retirar tu consentimiento.

Como todo lo que GameMate guarda está en tu propio PC, puedes ejercer la mayoría de estos derechos directamente en GameMate: ver y cambiar tus elecciones en Ajustes, desactivar funciones opcionales y usar **Borrar mis datos**. Para los datos que tienen Google, las wikis, Hugging Face o GitHub, contacta con esos servicios. Para cualquier otra cosa, escríbenos a [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com).

## 10. Reclamaciones

Puedes presentar una reclamación ante una autoridad de protección de datos, en particular la del lugar donde vives o trabajas:

- **En la UE:** tu autoridad nacional de protección de datos ([lista de autoridades de la UE](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en)). En Alemania, es la autoridad de protección de datos de tu estado federado.
- **En Arabia Saudí:** la Saudi Data & AI Authority (SDAIA), que supervisa la PDPL ([sdaia.gov.sa](https://sdaia.gov.sa)).

## 11. Menores

GameMate está pensado para personas de 16 años o más, o menores con el permiso de un padre, una madre o un tutor legal. Gemini es solo para personas de 18 años o más, como exige Google.

## 12. Sin decisiones automatizadas

GameMate no toma decisiones sobre ti que tengan efectos jurídicos o efectos igualmente significativos. La IA solo responde a tus preguntas.

## 13. Cambios en esta política

Si cambiamos esta política, la nueva versión llega con una actualización de GameMate, y GameMate te la muestra antes de que continúes. Siempre puedes leer la versión vigente en **Ajustes → Privacidad y aspectos legales**.

## 14. Traducciones

Esta política también está disponible en otros idiomas en GameMate. Las traducciones son para tu comodidad. Si una traducción difiere de la versión en inglés, prevalece la versión en inglés.
