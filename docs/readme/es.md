# iPhone Agent Harness

[English](../../README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · **Español**

Un Harness de código abierto para que la IA opere un iPhone o iPad entre aplicaciones mediante un navegador y un puente Bluetooth ESP32.

[igent.cc](https://igent.cc) · [GitHub](https://github.com/cccat6/iphone-agent-harness)

![Ilustración provisional: navegador, puente ESP32 y teléfono. Próximamente habrá un vídeo/GIF de demostración.](../../apps/web/media/demo-placeholder.svg)

Ilustración provisional: navegador, puente ESP32 y teléfono. Próximamente habrá un vídeo/GIF de demostración.

## Empieza en cinco pasos

Necesitas Safari en iOS/iPadOS 27+, ESP32/C3/S3/C6 con al menos 4 MB de flash, cable USB de datos, la misma red Wi-Fi de 2,4 GHz y una cuenta de IA o API compatible. Para instalar desde el navegador usa Chrome/Edge en ordenador.

1. **Instala el firmware.** Abre el instalador en el ordenador, elige la placa e instala. Lee la información y conserva el enlace del teléfono. Para una placa nueva, entra en su Wi-Fi de configuración, guarda la red habitual y devuelve el teléfono a esa red.

2. **Conecta el teléfono.** Abre el enlace o solicita la información del puente en Harness, guárdala y conecta el ESP32. Empareja iPhone Agent Bridge en Bluetooth de iOS, activa AssistiveTouch y selecciona el teléfono listo. La prueba de ocho dígitos es opcional en el firmware actual; el acceso total por teclado puede estar activado o no. No se necesita código, certificado ni pestaña adicional.

3. **Elige una IA.** En Ajustes → Cuentas/API añade endpoint y clave y carga modelos, o sigue el acceso a ChatGPT. El modelo predeterminado se elige o escribe; todos los encontrados siguen disponibles. Crea una conversación y selecciona modelo y esfuerzo de razonamiento compatible.

4. **Comparte y pide.** Comparte la pantalla y empieza con una tarea breve y segura, como una alarma de prueba. Las preguntas reciben explicación, pedir un plan muestra uno revisable y las órdenes explícitas pueden ejecutarse. Mantén el teléfono desbloqueado y observa los primeros intentos. Detener termina; perder la pantalla compartida pausa.

5. **Revisa el resultado.** La IA verifica antes de terminar y vuelve a Harness por defecto. Desactívalo en Ajustes → Finalización de tarea para permanecer en la aplicación. Comprueba personalmente los resultados importantes.

## Uso diario

- El selector del título de la lista alterna conversaciones y archivo. Desliza para Renombrar/Archivar, o Renombrar/Restaurar/Eliminar en archivo, con confirmación. Busca bajando la lista o con el botón de búsqueda.

- Los mensajes antiguos se cargan al subir. Las respuestas conservan la posición de lectura; «Últimos» vuelve al final. Exporta en el menú e importa en Ajustes; máximo 64 MiB con imágenes.

- Para texto largo instala iPhone Agent Clipboard desde el tutorial. Copia con Atajos o el botón en primer plano. La tarea espera confirmación y revisa el campo de destino antes de pegar.

- 12 habilidades integradas cubren observación, planificación, entrada, recuperación, creación, reloj y corrección de gestos. Usan edición numérica directa cuando existe; si no, pequeños ajustes y espera hasta detenerse.

- Crea, edita y publica habilidades desde ordenador o teléfono. La propiedad usa una identidad criptográfica del navegador, no un UID de iOS. Exporta una copia cifrada antes de cambiar de navegador. Las integradas/descargadas son de solo lectura; se actualizan al recargar conservando activación y versión anterior si falla.

- MCP opcional conecta servidores Streamable HTTP accesibles al navegador, con herramientas autorizadas explícitamente y CORS. No ejecuta stdio ni aloja OAuth remoto completo.

## Datos y límites

Conversaciones, imágenes, claves y tokens se guardan en este navegador. Las credenciales no se exportan con conversaciones ni requieren contraseña de desbloqueo. Los contenidos seleccionados van al modelo. Borrar los datos del sitio los elimina: exporta lo importante. Publicar solo envía el paquete elegido explícitamente.

Supervisa las funciones de hardware experimentales. Gestos, captura en segundo plano, Atajos y varios teléfonos requieren pruebas en tus dispositivos; compilar y probar en escritorio no demuestra estos resultados. Safari puede suspender el fondo. No hay límite global predeterminado de tiempo/pasos, pero cada plan conserva límites. Acceso y renovación de ChatGPT en Safari siguen siendo límites de compatibilidad. Solo hay un par WebRTC activo. La reparación de registro/importación multicliente está preparada en código, aún sin instalar ni validar en hardware.

## Desarrollo y alojamiento propio

Usa Node.js 22.13+. Dos partes: apps/web y firmware/IPhoneAutomationHarness. El sitio estático admite una API opcional de habilidades públicas firmadas. Compartir pantalla requiere HTTPS.

```sh
npm ci
npm test
npm run build
npm run preview
```

Las publicaciones son manuales; los push normales no lanzan GitHub Actions. Consulta la guía para reutilizar firmware y desplegar.

[Guía del teléfono](../acceptance/README.md) · [Arduino](../../firmware/IPhoneAutomationHarness/README.md) · [Arquitectura](../architecture/overview.md) · [Alojamiento propio](../architecture/deployment.md) · [Publicación manual](../architecture/manual-release.md) · [Tutorial del portapapeles](https://igent.cc/shortcuts/clipboard.html)

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
