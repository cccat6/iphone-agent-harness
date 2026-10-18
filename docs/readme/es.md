# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · **Español**

Un entorno de código abierto para que un agente de IA maneje el iPhone y el iPad entre distintas apps, desde el navegador y mediante un puente Bluetooth HID basado en ESP32.

La plataforma objetivo es **Safari en iOS/iPadOS 27 o posterior**. En el iPhone y el iPad se abre el Harness por defecto; en escritorio aparecen la página principal, la comunidad de Skills y las páginas de configuración y firmware del ESP32. No se prevé una app nativa ni una versión para Android.

## Estado actual

La aplicación web, el transporte LAN autenticado y la configuración del dispositivo están implementados. El sitio y la comunidad Skill con firmas están desplegados en [igent.cc](https://igent.cc). La validación del firmware de producto en un dispositivo real sigue en curso: compilar, ejecutar pruebas en ordenador y simular el navegador no confirma el control del teléfono ni la conexión de Safari a la red local.

Experimentos independientes con iPhone 12/iOS 27.0.1 confirmaron la captura de otras apps, respuestas diferidas y en streaming en segundo plano, además de cuatro llamadas cortas reales a DeepSeek con ambos protocolos compatibles. Un firmware experimental anterior también verificó teclado, Home, puntero y deslizamiento. Estos resultados no validan el producto nuevo ni garantizan ejecución ilimitada en segundo plano. Véanse el [informe](../research/background-api.md) y los [límites del firmware](../architecture/firmware-implementation.md).

## Funciones incluidas

- **Conversaciones locales:** IndexedDB, archivos adjuntos, importación y exportación, modos de conversación, planificación y tarea, y cancelación. El contexto y las imágenes elegidos se envían al proveedor de IA configurado; el proyecto no mantiene una base de conversaciones en la nube.
- **Modelos y cuentas:** APIs compatibles con OpenAI/Anthropic, consulta de modelos y varios perfiles. Están implementados el código de dispositivo, la renovación de tokens y el adaptador Responses para la suscripción Codex. El inicio de sesión real en Safari y el CORS de los endpoints antiguos siguen sin validar; un error no se muestra como conexión correcta.
- **Contexto e imágenes:** umbrales y objetivo de compresión, reserva de respuesta, límite de imágenes y resúmenes mediante modelo o extractos. Los tokens son estimaciones. Se ajustan el lado máximo y la calidad JPEG, conservando escala y tiempos. Los aciertos de caché dependen del proveedor.
- **10 Skills integrados:** observación de pantalla, observación temporal, planificación, navegación, entrada de texto, desplazamiento de listas, arrastrar y soltar, recuperación, selección de métodos para desafíos de verificación y creación de Skills. Las herramientas son fijas; no se instalan plugins ejecutables.
- **Autoría y comunidad:** identidad local P-256, copia cifrada y restauración en otro dispositivo. Solo se editan Skills propios; las descargas de la comunidad son de solo lectura. Publicar exige una acción explícita. La API comunitaria opcional **está desplegada en el sitio oficial** y solo guarda paquetes que el usuario decide publicar.

Las credenciales permanecen en memoria por defecto. Pueden guardarse cifradas localmente y desbloquearse con una frase de contraseña; no forman parte del sitio estático. Más detalles en las [notas de suscripción](../research/codex-subscription.md).

## Ejecución local

El producto tiene dos partes: `apps/web/` y `firmware/IPhoneAutomationHarness/`. La comunidad y su API opcional pertenecen a Web. El sitio se puede alojar por cuenta propia y no necesita servidor comunitario para el uso local.

Se requiere Node.js 22.13 o posterior:

```sh
npm ci
npm test
npm run build
npm run preview
```

La vista previa de escritorio usa localhost; compartir la pantalla del teléfono requiere **HTTPS**. Se puede desplegar `build/site` en Cloudflare o un servidor HTTPS con el [enrutamiento de páginas](../architecture/deployment.md#self-hosted-page-routing) descrito. La [guía Arduino](../../firmware/IPhoneAutomationHarness/README.md) explica las herramientas de compilación.

[Arquitectura](../architecture/system-blueprint.md) · [Gestos y sincronización](../architecture/actions.md) · [Autoría de Skills](../architecture/skill-community.md) · [Idiomas](../architecture/localization.md)

Aún faltan pruebas reales de configuración Wi-Fi segura, asociación con el teléfono correcto, acceso de Safari al ESP32 local, deslizamiento con inercia y aislamiento de dos teléfonos en un C3. mDNS no resuelve por sí solo HTTPS ni la autenticación.

Lista completa de aceptación: [English](../acceptance/README.md) · [简体中文](../acceptance/zh-Hans.md). Incluye todas las funciones y contenidos, las pruebas de escritorio y los pasos del teléfono aplazados. El equipo del proyecto se encarga de la preparación en el ordenador y de la verificación final de publicación.

En Mac pasaron HTTPS con validación de CA/DNS y el emparejamiento del propietario mediante el cliente del producto con el C3 real. No se enviaron entradas al teléfono. La imagen final y Safari/el teléfono requieren aceptación por separado. [Informe del cliente real](../research/device-client-live-verification.json).

Las publicaciones se ejecutan solo bajo petición explícita; un push normal no activa Actions. Se reutiliza el firmware sin cambios, se compilan las versiones ESP32/C3/S3/C6 modificadas y se publican los mismos binarios en Releases y en el sitio web. [Proceso y configuración del token](../architecture/manual-release.md).

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
