<p align="center"><img src="../media/logo-card.svg" width="128" height="128" alt="iPhone Agent Harness"></p>

<h1 align="center">iPhone Agent Harness</h1>

<p align="center"><strong>Deja que la IA maneje tu iPhone.</strong></p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="zh-Hans.md">简体中文</a> · <a href="zh-Hant.md">繁體中文</a> · <a href="ja.md">日本語</a> · <a href="ru.md">Русский</a> · <a href="de.md">Deutsch</a> · <a href="fr.md">Français</a> · <strong>Español</strong>
</p>

<p align="center">
  <a href="https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml"><img src="https://github.com/cccat6/iphone-agent-harness/actions/workflows/checks.yml/badge.svg" alt="CI"></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/iOS%20%2F%20iPadOS-27%2B-111827" alt="iOS / iPadOS 27+">
  <img src="https://img.shields.io/badge/ESP32-C2%20%C2%B7%20C3%20%C2%B7%20C5%20%C2%B7%20C6%20%C2%B7%20S3%20%C2%B7%20Classic-cf4a2b" alt="ESP32 C2, C3, C5, C6, S3, Classic">
</p>

<p align="center">
  <a href="https://igent.cc/">📱 Harness</a> ·
  <a href="https://igent.cc/flash">⚡ Instalador web</a> ·
  <a href="../guide/es.md">📖 Guía completa</a> ·
  <a href="https://igent.cc/skills">🧩 Comunidad</a> ·
  <a href="../architecture/overview.md">🗺️ Arquitectura</a>
</p>

Pide al iPhone que lea una pantalla, escriba texto, ajuste un control o siga un flujo breve entre aplicaciones. Un pequeño ESP32 alimentado aporta la entrada Bluetooth; Safari gestiona la conversación y captura.

- **Instala desde el navegador.** Elige tu ESP32 e instala el firmware con Chrome o Edge en el ordenador.
- **El teléfono sigue inalámbrico.** Deja el puente alimentado en una estantería dentro del alcance de Bluetooth.
- **Tu Wi-Fi habitual.** Conecta el teléfono y el puente a la misma red de casa u oficina y empieza una tarea en Safari.

<table>
<tr><th>Pedir comida</th><th>Configurar una alarma</th></tr>
<tr>
<td width="50%" align="center">

https://github.com/user-attachments/assets/7601869f-7cc6-445e-b64d-0073a8bf657d

</td>
<td width="50%" align="center">

https://github.com/user-attachments/assets/d72669a6-e150-40d7-ba2f-1d9586d9c2ea

</td>
</tr>
</table>

**La IA pide comida a domicilio desde el iPhone.** El agente selecciona bebidas MIXUE, ajusta el hielo y el azúcar y llega al resumen del pedido. Al final se muestra la entrega.


## ⚙️ Cómo funciona

Safari envía la pantalla y contexto elegido a tu IA. Harness valida el plan, lo transmite al ESP32 por WebRTC local y el puente actúa como ratón/teclado Bluetooth. La siguiente observación confirma el resultado.

```mermaid
flowchart LR
  subgraph Phone["iPhone / iPad"]
    Harness["Safari · Harness"]
    Apps["Apps de iPhone / iPad"]
    Storage[("Almacenamiento local del navegador<br/>Conversaciones · imágenes · claves")]
    Apps -->|Compartir pantalla| Harness
    Harness <--> Storage
    Shortcut["Atajos de Apple<br/>Portapapeles de iOS"]
  end
  Harness <-->|API / MCP| AI["Tu IA elegida"]
  Harness <-->|Suscripción de ChatGPT| Relay["Relé sin estado"]
  Relay <--> AI
  Harness <-->|WebRTC · Wi-Fi local| Bridge["Puente ESP32"]
  Bridge -->|Teclado / ratón Bluetooth| Apps
  Bridge -->|HTTP local · texto| Shortcut
  Shortcut -->|Copia confirmada| Harness
```

[Arquitectura](../architecture/overview.md)

## 🔌 Elige una placa

Para una compra nueva, recomendamos **C6, S3 o C3**. Elige una placa de desarrollo completa con USB y antena integrada; este proyecto no necesita soldadura ni periféricos externos. Graba el firmware una vez con un cable USB de datos y el [instalador web](https://igent.cc/flash), configura el Wi-Fi y empareja Bluetooth. Después basta con alimentarla por USB.

| Chip | Modelos / términos de búsqueda | Amazon EE. UU.: por placa en lote¹ | Taobao: presupuesto por placa¹ |
|---|---|---|---|
| **ESP32-C6** | `ESP32-C6 SuperMini` · `ESP32-C6-Zero` · `ESP32-C6-DevKitM-1` · `ESP32-C6-DevKitC-1` · `ESP32-C6-WROOM-1 N8` | US$4–8 | ¥25–45 |
| **ESP32-S3** | `ESP32-S3-DevKitC-1 N8R2 / N8R8 / N16R8` · `ESP32-S3 SuperMini` · `ESP32-S3-Zero` · `ESP32-S3-WROOM-1 N16R8` | US$6–9 | ¥15–40 |
| **ESP32-C3** | `ESP32-C3 SuperMini` · `ESP32-C3-MINI` · `ESP32-C3-Zero` · `ESP32-C3-DevKitM-1` · `ESP32-C3-MINI-1 N4` | US$3–5 | ¥6–20 |

Añade **`development board USB-C`** en Amazon o **`开发板 Type-C 板载天线`** en Taobao. Al buscar módulos WROOM/MINI, incluye «placa de desarrollo» para evitar comprar un módulo suelto, un adaptador o una placa de expansión.

¹ Presupuestos orientativos de placas básicas, octubre de 2026. Amazon: precio por placa en lotes de 3–5; se compra el lote completo. Una sola placa suele costar US$9–13. Taobao: estimaciones indexadas, no precios finales verificados por variante. Revisa envío e impuestos; los kits oficiales pueden costar más.

**Sin limitar marcas ni nombres comerciales.** Otras placas con el mismo chip pueden usar el firmware correspondiente si tienen SPI Flash estándar (DIO) de **al menos 4 MB** y permiten grabar por USB. La PSRAM es opcional; los controles especiales de antena o alimentación pueden necesitar adaptación. También se admiten **C2** (2 MB mínimo, selección automática de 26/40 MHz), **C5 y ESP32 clásico**. S2, H2, P4 y C61 no están incluidos en el firmware actual. Son términos de búsqueda, no una lista de todas las variantes probadas.

## 🚀 Configura y prueba

La guía completa cubre cada paso:

1. **[Accesibilidad](../guide/es.md#accessibility)**

2. **[Instalar firmware](../guide/es.md#flash)**

3. **[Wi-Fi](../guide/es.md#wifi)**

4. **[Bluetooth](../guide/es.md#bluetooth)**

5. **[Abrir Harness](../guide/es.md#open-harness)**

6. **[Configurar IA](../guide/es.md#models)**

7. **[Conectar/probar puente](../guide/es.md#bridge)**

8. **[Atajo del portapapeles](../guide/es.md#clipboard)**

9. **[Habilidad comunitaria](../guide/es.md#install-skills)**

10. **[Crear habilidad](../guide/es.md#authoring)**

11. **[Publicar](../guide/es.md#publish)**

## 💬 Conversaciones, planes y habilidades

Haz preguntas, prepara planes o encarga una tarea al agente en la misma conversación. Puedes renombrar, archivar, buscar y exportar conversaciones. Lee el historial mientras se ejecuta una tarea y vuelve a la última respuesta cuando quieras.

Las habilidades ayudan con las tareas habituales del teléfono y mejoran los toques, la escritura y los gestos. Añádelas desde la comunidad o pide a Harness que te ayude a crear las tuyas. También puedes conectar herramientas MCP en Ajustes.

Pantallas reales de Harness con datos de ejemplo.

<table>
  <tr><th>Tus conversaciones</th><th>Conversación de ejemplo</th><th>Habilidades</th></tr>
  <tr>
    <td><img src="../../apps/web/media/sessions-example.jpg" width="240" alt="Tus conversaciones"></td>
    <td><img src="../../apps/web/media/conversation-example.jpg" width="240" alt="Conversación de ejemplo"></td>
    <td><img src="../../apps/web/media/skills-example.jpg" width="240" alt="Habilidades"></td>
  </tr>
</table>

Un puente admite dos conexiones independientes de Harness. Si usas dos teléfonos, selecciona el correspondiente en cada página y realiza la prueba de entrada opcional en cada uno para confirmar la vinculación.

## 📋 Textos largos en varios idiomas

La escritura habitual y los atajos de teclado usan el teclado Bluetooth del puente. Para textos largos o multilingües, **iPhone Agent Clipboard** copia el contenido con Atajos de Apple y el agente lo pega en el campo elegido.

El navegador envía el texto al ESP32 en pequeños bloques por WebRTC local. El puente los transmite en una única respuesta HTTP al atajo, que coloca el texto completo en el portapapeles del iPhone.

[Configurar el portapapeles](../guide/es.md#clipboard)

## 🔒 Datos y privacidad

Las sesiones, capturas y credenciales se guardan en el navegador; las API normales se conectan directamente. Por CORS, ChatGPT usa el relé Cloudflare del proyecto o uno propio sin estado para el contexto seleccionado, imágenes, respuestas y un token temporal. La aplicación de relé no guarda estos datos ni registra contenidos o credenciales.

La reutilización de capturas sube cada imagen elegida una vez a DeepSeek o Claude y después envía su ID. Los archivos del proveedor caducan en una hora. La opción se configura para cada conexión API.

## 🤝 Contribuye

Comparte ideas y problemas en [Issues](https://github.com/cccat6/iphone-agent-harness/issues) o mejoras mediante un [pull request](https://github.com/cccat6/iphone-agent-harness/pulls). Publica tus propias habilidades en la [comunidad](https://igent.cc/skills).

[MIT License](../../LICENSE) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)

## 💛 Agradecimientos

Gracias a [onehumanbeing/esp32-iphone-agent](https://github.com/onehumanbeing/esp32-iphone-agent) por la inspiración.
