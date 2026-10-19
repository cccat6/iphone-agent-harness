# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · **Español**

Un entorno de código abierto para que un agente de IA maneje el iPhone y el iPad entre distintas apps, desde el navegador y mediante un controlador Bluetooth ESP32.

Diseñado para **Safari en iOS/iPadOS 27 o posterior**. En el iPhone y el iPad abre el Harness; en el ordenador ofrece la presentación, la comunidad de habilidades y el instalador de firmware ESP32.

Guía de uso: [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Las pantallas principales y las acciones habituales.

El sitio está en [igent.cc](https://igent.cc). Harness se conecta al puente ESP32 de la red local mediante **WebRTC Direct** desde la misma página. No requiere otra pestaña de conexión, un código de conexión ni instalar certificados. Importa los datos una vez desde el enlace de configuración USB o los ajustes del dispositivo; después puedes conectarte desde Harness. El firmware que integra RTC y Bluetooth está en validación con hardware real. Consulta la [guía de conexión y los resultados](../architecture/secure-lan.md).

## Funciones

- **Conversaciones:** mensajes e imágenes locales, búsqueda, cambio de nombre, fijado, archivo e importación y exportación de archivos. Conversación, planificación y ejecución comparten un mismo chat. Pedir un plan no inicia acciones. El título se genera automáticamente a partir de la primera petición; se conservan los nombres elegidos manualmente y los importados.
- **Cuentas o API:** varias conexiones, endpoints compatibles con OpenAI y Anthropic, carga y cambio de modelos. El adaptador y la interfaz de acceso a la suscripción de ChatGPT están implementados; el inicio de sesión real en Safari sigue pendiente de verificación. Los modelos compatibles permiten elegir el esfuerzo de razonamiento, que se guarda por separado para cada cuenta y modelo.
- **Contexto:** resúmenes automáticos del modelo con un umbral ajustable de **750 000 tokens** por defecto. El historial completo permanece en el dispositivo.
- **Imágenes:** compresión JPEG con tres niveles de calidad y las dimensiones originales.
- **Habilidades:** diez habilidades integradas, creación y edición de las propias, descargas y publicación en la comunidad. La dirección oficial ya está configurada. El Harness puede ayudarte a escribir y mejorar tus habilidades mediante el chat.
- **MCP:** varios servidores Streamable HTTP, selección independiente de herramientas y uso de las herramientas autorizadas durante la ejecución.

Las conversaciones se guardan en el navegador; los mensajes e imágenes elegidos se envían al servicio de modelo seleccionado. Las claves API y los datos de acceso se guardan en este navegador, separados de las conversaciones y sus archivos exportados. No hace falta una contraseña de desbloqueo. Borrar los datos del sitio también elimina estas credenciales.

El endpoint de la API admite una base como `https://api.example.com/v1` o la URL completa `/chat/completions`; los servicios compatibles con Anthropic también admiten `/v1/messages`. El editor indica el prefijo necesario. Tras cargar la lista, elige o escribe el modelo predeterminado en el mismo campo. Todos los modelos encontrados siguen disponibles en la conversación.

## Proyecto y desarrollo local

Las dos partes del producto son `apps/web/` (sitio, Harness y comunidad) y `firmware/IPhoneAutomationHarness/` (firmware Arduino). También puedes alojar el sitio por tu cuenta.

Usa Node.js 22.13 o posterior:

```sh
npm ci
npm test
npm run build
npm run preview
```

La vista previa de ordenador usa localhost; compartir la pantalla del teléfono requiere HTTPS. Despliega `build/site` con las [rutas documentadas](../architecture/deployment.md#self-hosted-page-routing). La [guía de Arduino](../../firmware/IPhoneAutomationHarness/README.md) explica las placas y la compilación.

**Publicaciones manuales:** los pushes normales no activan GitHub Actions. Bajo petición, el flujo reutiliza el firmware sin cambios, compila las versiones ESP32/C3/S3/C6 modificadas y publica los mismos binarios en Releases y en el sitio. [Configuración de publicaciones](../architecture/manual-release.md).

[Arquitectura](../architecture/system-blueprint.md) · [Acciones y capturas](../architecture/actions.md) · [Cuentas y MCP](../architecture/auth-and-backends.md) · [Autoría de habilidades](../architecture/skill-community.md) · [Idiomas](../architecture/localization.md)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
