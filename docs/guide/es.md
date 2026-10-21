# Configuración y uso diario

[English](README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · **Español** · [Proyecto](../../README.md) · [Abrir Harness](https://igent.cc/) · [Arquitectura](../architecture/overview.md)

Necesitas un iPhone o iPad con iOS/iPadOS 27+, una placa ESP32, alimentación USB, Wi-Fi y una cuenta de IA o clave API. Instala el firmware con Chrome o Edge en un ordenador.

El teléfono y el puente usan la misma red Wi-Fi. Después de configurarlo, deja el puente alimentado dentro del alcance de Bluetooth.

## Contenido

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [Wi-Fi](#wifi) · [Bluetooth](#bluetooth) · [Harness](#open-harness) · [Modelos](#models) · [Conexión y prueba](#bridge) · [Portapapeles](#clipboard) · [Instalar habilidad](#install-skills) · [Crear](#authoring) · [Publicar](#publish)

<a id="accessibility"></a>
## 1. Activa AssistiveTouch

En el iPhone, abre **Ajustes → Accesibilidad → Tocar → AssistiveTouch** y actívalo. Así, el puente puede tocar y arrastrar elementos con el puntero.

<a id="flash"></a>
## 2. Instala el firmware ESP32 desde el navegador

1. Abre el [instalador web](https://igent.cc/flash) en Chrome o Edge en un ordenador.
2. Selecciona el chip indicado en la placa. C2 necesita al menos **2 MB de flash**; los demás chips de la lista, al menos **4 MB de flash SPI estándar**.
3. Conecta la placa con un cable USB de datos. Pulsa **Elegir dispositivo USB e instalar**, selecciona la placa y espera a que termine.
4. Pulsa **Leer información del dispositivo**, elige la misma placa y guarda los datos de Wi-Fi y el enlace de conexión para el teléfono.

Si no empieza, mantén BOOT pulsado al volver a conectar el USB, suéltalo y reintenta. La versión C2 de 26 o 40 MHz se elige automáticamente. Después, alimenta la placa para manejar el teléfono de forma inalámbrica.

<a id="wifi"></a>
## 3. Conecta el puente al Wi-Fi habitual

1. En el ordenador, conéctate al Wi-Fi `iPhone-Harness-…` del instalador con la contraseña mostrada.
2. Abre `http://192.168.4.1` e introduce el nombre y la contraseña de tu Wi-Fi habitual. Una red de 2,4 GHz funciona con todos los chips compatibles.
3. Cuando el puente se conecte, devuelve el ordenador al Wi-Fi habitual. El teléfono debe estar en esa misma red.

El puente recuerda la red y se reconecta al encenderse. Solo hace falta configurarlo al empezar o al cambiar de red. Después puedes modificar los ajustes en `http://igent.local/settings`.

<a id="bluetooth"></a>
## 4. Empareja el puente de entrada Bluetooth

En el teléfono, abre **Ajustes → Bluetooth** y empareja **iPhone Agent Bridge**. Mantén AssistiveTouch activado.

Bluetooth permite que el puente maneje el teléfono. La conexión Wi-Fi entre Harness y el puente se configura en el paso 7.

<a id="open-harness"></a>
## 5. Abre Web Harness

Abre [igent.cc](https://igent.cc/) en Safari en tu iPhone o iPad para entrar directamente en Harness.

Cuando pidas una acción, permite compartir pantalla y mantén el teléfono desbloqueado. Después puedes cambiar de app. Al dejar de compartir, la tarea se pausa. Pulsa **Compartir pantalla y continuar** en Harness para compartir de nuevo y reanudarla.

<a id="models"></a>
## 6. Configura una API o cuenta ChatGPT

Abre **Ajustes → Cuentas o API → Añadir**. Puedes guardar varias conexiones y cambiar de modelo en la conversación.

**Con una clave API**

1. Elige **Compatible con OpenAI** o **Compatible con Anthropic**, según tu proveedor.
2. Introduce un nombre, el endpoint de la API y la clave. Por ejemplo, `https://api.example.com/v1`. También sirve una dirección completa con `/chat/completions` o `/messages` para el tipo de API elegido.
3. Pulsa **Obtener modelos**, elige el predeterminado o escribe su nombre. Los demás también estarán disponibles en las conversaciones.
4. Guarda. Para manejar el teléfono, elige un modelo que acepte imágenes y llamadas a herramientas. Si ofrece esfuerzo de razonamiento, puedes ajustarlo en el selector.

**Con una cuenta ChatGPT**

Elige «Suscripción de ChatGPT» en Harness y pulsa «Continuar con ChatGPT». Abre la página oficial y autoriza el acceso. Después, el navegador indicará que no puede abrir la dirección de retorno local (`127.0.0.1`); es normal. Copia la URL completa de la barra de direcciones, vuelve a Harness, pégala en «Dirección de retorno» y pulsa «Completar inicio de sesión». Elige un modelo de la lista obtenida y guarda la cuenta. Las credenciales se guardan en este navegador. Las conexiones Codex existentes se conservan; la suscripción de ChatGPT se añade como una cuenta independiente. [Referencia de autorización de OpenAI](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Las sesiones, capturas y credenciales se guardan en el navegador. Las API normales se conectan directamente al proveedor. Las suscripciones de ChatGPT usan el relé sin estado del proyecto o uno propio por las restricciones CORS del navegador: por él pasan el contexto seleccionado, imágenes, respuestas y un token de acceso de corta duración. La aplicación de relé no los almacena ni registra el contenido o las credenciales. El inicio de sesión y la renovación de tokens siguen directamente del navegador a OpenAI; los tokens de renovación e ID no pasan por el relé. MCP se conecta a los servidores configurados; solo las habilidades que publiques llegan a la comunidad.

En las opciones avanzadas de ChatGPT, **Configuración de conexión avanzada → URL de tu servicio de reenvío** usa por defecto `https://igent.cc/api/openai`. Puedes indicar el prefijo de tu propio relé. Puedes guardar la cuenta sin obtener la lista de modelos y consultarla después.

Para alojar solo el relé, configura `ALLOWED_ORIGINS` en `wrangler.relay.jsonc` con el origen web (varios separados por comas), ejecuta `npx wrangler deploy --config wrangler.relay.jsonc` e introduce la URL publicada seguida de `/api/openai` en **Configuración de conexión avanzada → URL de tu servicio de reenvío**. Solo ofrece `GET /api/openai/models` y `POST /api/openai/responses`. No necesita clave OpenAI, base de datos ni KV y funciona también con Harness alojado. El relé se ejecuta por defecto en `aws:us-east-1`; puedes ajustar la región en su configuración según el servicio de destino.

### Ubicación

Activa el acceso en **Ajustes → Ubicación**. El navegador solicita tu ubicación de inmediato para que puedas dar permiso mientras tienes los ajustes abiertos. Después, el agente llama a `phone_get_location` cuando la tarea lo necesita y envía la ubicación recién obtenida al modelo seleccionado. Es la ubicación del dispositivo donde está abierto Harness.

<a id="bridge"></a>
## 7. Conecta el puente y prueba la entrada si quieres

1. Abre **Dispositivos** desde la lista de conversaciones o toca el estado del puente dentro de una conversación.
2. La primera vez, pulsa **Obtener información del puente**. En su página, usa el enlace de vuelta a Harness. También sirve el enlace para el teléfono del instalador.
3. Pulsa **Conectar puente ESP32** y selecciona el teléfono emparejado si se solicita. La próxima vez puedes usar la conexión guardada.
4. Para comprobar la escritura, pulsa **Iniciar prueba de entrada** y quédate en la página. El puente escribe ocho dígitos y Harness los comprueba. Puedes saltarte esta prueba.

Un puente admite dos conexiones independientes de Harness. Si usas dos teléfonos, selecciona el correspondiente en cada página y realiza la prueba de entrada opcional en cada uno para confirmar la vinculación.

Si el teléfono no está listo, comprueba Bluetooth, espera un momento y pulsa **Actualizar**.

Prueba «Abre Reloj y pon una alarma a las 7:00». Permite compartir la pantalla. En **Ajustes → Volver a Harness**, elige por separado **Al terminar una tarea** y **Cuando se necesite mi intervención**. Ambas opciones están activadas por defecto. Si hace falta una respuesta, confirmación o ayuda con un problema, el Agent vuelve a la conversación actual y espera tu respuesta.

### Uso del contexto

Toca el anillo a la izquierda del área de entrada para ver los tokens usados, los restantes y la capacidad de contexto del modelo. Las estimaciones llevan el símbolo ≈. El botón de compresión resume el contexto anterior para las siguientes solicitudes y conserva el historial del chat.

<a id="clipboard"></a>
## 8. Configura la copia con Atajos

1. Abre la [guía del portapapeles](https://igent.cc/shortcuts/clipboard.html) en el teléfono e instala el atajo.
2. Conserva el nombre **iPhone Agent Clipboard**.
3. Conecta el puente en Harness. Cuando el texto esté listo, elige **Copiar con Atajos**. Permite el acceso al puente si iOS lo solicita.
4. Vuelve a Harness tras copiar para pegar en el campo deseado.

Sirve para textos largos y varios idiomas. Con Harness en pantalla, también puedes usar **Copiar y continuar**.

<a id="install-skills"></a>
## 9. Instala una habilidad de la comunidad

Abre **Ajustes → Habilidades → Comunidad** o la [comunidad](https://igent.cc/skills). Lee la descripción y elige **Añadir en local**. Puedes activar o desactivar cada habilidad en tu lista.

Las integradas ya están instaladas. Al recargar la página se buscan actualizaciones y se conservan tus preferencias. Las versiones nuevas se usan a partir de la siguiente tarea.

<a id="authoring"></a>
## 10. Crea y mejora tu propia habilidad

En el ordenador, abre [Habilidades](https://igent.cc/skills) y elige **Crear tu propia habilidad**. En el teléfono: **Ajustes → Habilidades → Crear**. Introduce un nombre, un identificador breve en minúsculas, una descripción y las instrucciones; después guarda.

También puedes pedir a Harness que escriba o mejore tu habilidad. Explica cuándo usarla, qué pasos seguir y cómo comprobar el resultado. Para adaptar una habilidad comunitaria, crea la tuya y conserva la original de su autor.

Antes de cambiar de navegador, exporta tus habilidades y guarda una copia de tu **Identidad de autor**. Importa ambas en el nuevo navegador para seguir publicando con el mismo autor.

<a id="publish"></a>
## 11. Comparte una habilidad

Abre una habilidad tuya y elige **Publicar** en la web o **Publicar en la comunidad** en el teléfono. Revisa el contenido y confirma. Vuelve a publicarla después de editarla para actualizarla.

Otros usuarios podrán añadirla desde el catálogo. Para errores e ideas, [abre un Issue](https://github.com/cccat6/iphone-agent-harness/issues); para mejoras de código o documentación, [envía un pull request](https://github.com/cccat6/iphone-agent-harness/pulls).

## Gestiona tus conversaciones

Toca el título de la lista para cambiar entre **Conversaciones** y **Archivadas**. Desliza para renombrar o archivar; en el archivo puedes restaurar o eliminar. Desplázate arriba para leer el historial y pulsa **Últimos** para volver a la respuesta más reciente.

Exporta una conversación desde su menú e importa el archivo en Ajustes. Incluye mensajes e imágenes. Las cuentas y claves se guardan por separado en el navegador.
