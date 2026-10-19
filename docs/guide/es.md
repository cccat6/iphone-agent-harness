# Configuración y uso diario

[English](README.md) · [简体中文](zh-Hans.md) · [繁體中文](zh-Hant.md) · [日本語](ja.md) · [Русский](ru.md) · [Deutsch](de.md) · [Français](fr.md) · **Español** · [Proyecto](../../README.md) · [Abrir Harness](https://igent.cc/) · [Arquitectura](../architecture/overview.md)

Necesitas un iPhone o iPad con iOS/iPadOS 27 o posterior, una placa ESP32 compatible, alimentación USB, Wi-Fi local y una cuenta de IA o API compatible. Usa Chrome o Edge en ordenador para instalar firmware. El instalador precompilado no requiere Arduino, Xcode, cuenta de desarrollador ni compilador local.

El teléfono y el puente usan la misma red Wi-Fi habitual. El puente no se enchufa al teléfono: tras configurarlo puede quedar alimentado en un lugar al alcance de Bluetooth. Haz la configuración inicial de Wi-Fi en el ordenador para que el teléfono nunca tenga que unirse al punto de acceso de la placa.

## Contenido

[AssistiveTouch](#accessibility) · [Firmware](#flash) · [Wi-Fi](#wifi) · [Bluetooth](#bluetooth) · [Harness](#open-harness) · [Modelos](#models) · [Conexión y prueba](#bridge) · [Portapapeles](#clipboard) · [Instalar habilidad](#install-skills) · [Crear](#authoring) · [Publicar](#publish)

<a id="accessibility"></a>
## 1. Activa AssistiveTouch

En el teléfono abre **Ajustes → Accesibilidad → Tocar → AssistiveTouch** y actívalo. Esta función convierte la entrada de puntero Bluetooth del puente en interacción con las apps. El acceso total por teclado puede mantener su estado actual; no es necesario para Inicio ni para controlar el puntero.

<a id="flash"></a>
## 2. Instala el firmware ESP32 desde el navegador

1. En el ordenador abre [Instalar firmware](https://igent.cc/flash) en Chrome o Edge.
2. Elige el perfil del chip impreso en la placa. El instalador muestra las variantes ya compiladas. ESP32-C2 necesita al menos **2 MB de flash**; los demás chips de la tabla, **4 MB**. No hacen falta PSRAM, pantalla ni sensores externos.
3. Conecta la placa al ordenador con cable USB **de datos**. Pulsa «Elegir dispositivo USB e instalar» y selecciona esa placa en el selector de puerto serie del navegador.
4. Espera a que terminen instalación y verificación. Si no entra automáticamente en modo descarga, mantén BOOT al conectar o reiniciar, suéltalo y vuelve a intentar.
5. Pulsa «Leer información del dispositivo» y elige la misma placa. La página muestra nombre/contraseña del Wi-Fi de configuración y un enlace para el teléfono. Conserva esos datos para los pasos siguientes.

El USB sirve para instalar, leer ajustes y dar energía. Durante el uso del teléfono basta un adaptador u otra fuente USB; no hay cable entre teléfono y placa.

La única opción **ESP32-C2** del instalador selecciona automáticamente la imagen para cristal de 26 o 40 MHz. La imagen de 2 MB tiene una sola partición de aplicación, sin OTA. C2 usa **USB–UART** (a menudo integrado en la placa), no USB CDC nativo. **ESP32-C5** usa un perfil de flash a 80 MHz y USB CDC nativo.

<a id="wifi"></a>
## 3. Conecta el puente al Wi-Fi habitual

En una placa nueva, hazlo una sola vez:

1. En el **ordenador**, únete temporalmente al Wi-Fi de configuración `iPhone-Harness-…` mostrado por el instalador, con su contraseña indicada.
2. Abre `http://192.168.4.1` e introduce nombre y contraseña de tu Wi-Fi habitual. Una red de 2,4 GHz funciona con todas las variantes compatibles.
3. Espera la confirmación de conexión y devuelve el ordenador a esa red habitual.
4. Mantén el teléfono en la misma red local. No necesita el punto de acceso de la placa ni usar datos móviles para acceder al modelo.

El puente guarda estos datos localmente y se reconecta al encenderse. Si ya estaba configurado, omite este paso. `http://igent.local/settings` permite usar los ajustes de dispositivo disponibles, incluido su nombre local.

<a id="bluetooth"></a>
## 4. Empareja el puente de entrada Bluetooth

En el teléfono abre **Ajustes → Bluetooth** y empareja **iPhone Agent Bridge**. Mantén AssistiveTouch activado. El Bluetooth del sistema entrega entradas a iOS; la red entre navegador y puente entrega órdenes del agente a la placa. Son conexiones distintas.

Si una actualización de firmware cambia los informes HID, elimina el registro anterior en Bluetooth y vuelve a emparejar. Recargar la página o cambiar de modelo normalmente no lo requiere.

<a id="open-harness"></a>
## 5. Abre Web Harness

Abre [igent.cc](https://igent.cc/) en Safari del teléfono. Los iPhone/iPad compatibles entran en Harness; el ordenador muestra inicio, comunidad e instalador. No hace falta app iOS complementaria, perfil de certificado, extensión Safari ni modo desarrollador.

Al iniciar una operación, Safari solicita compartir pantalla. Acéptalo y mantén el teléfono desbloqueado mientras trabaja. Es la solicitud normal de iOS; no necesitas indicadores experimentales de red ni otros métodos de autorización. Terminar la pantalla compartida pausa la tarea. «Continuar» vuelve a solicitarla si hace falta.

<a id="models"></a>
## 6. Configura una API o cuenta ChatGPT

Abre **Ajustes → Cuentas o API → Añadir**. Puedes conservar varias conexiones y cambiar entre sus modelos desde el selector de la conversación.

### Endpoint y clave API

1. Elige API **compatible con OpenAI** o **Anthropic**.
2. Introduce endpoint del proveedor, clave y nombre de conexión. Sigue la indicación del formulario: raíz del servicio o base `/v1`; el adaptador también normaliza URLs completas de operaciones compatibles.
3. Pulsa «Obtener modelos». Selecciona uno predeterminado o escribe su ID. Todos los modelos encontrados siguen disponibles en la conversación.
4. Guarda. Para tareas del teléfono usa un modelo con comprensión de imágenes y llamadas a herramientas. Ajusta el esfuerzo de razonamiento cuando el modelo lo admita.

Las claves se guardan en este navegador. La petición va directamente al proveedor, sin pasar por el host del sitio. El proveedor debe permitir peticiones de navegador desde el sitio que usas.

### Cuenta con suscripción ChatGPT

Primero activa el acceso con código de dispositivo en los ajustes de seguridad de ChatGPT; un espacio gestionado puede necesitar que lo habilite el administrador. En Harness elige ChatGPT/Codex e inicia el acceso. Abre la página oficial de verificación que muestra el formulario, escribe el código y completa allí la autenticación. Regresa a Harness, pulsa el botón de finalización, carga modelos y guarda. Las credenciales permanecen locales y el adaptador las renueva. Es una conexión por suscripción, no una clave API OpenAI ordinaria; el servicio oficial debe ser accesible desde el navegador. Consulta las [instrucciones OpenAI de autenticación por código](https://learn.chatgpt.com/docs/auth#preferred-device-code-authentication-beta).

<a id="bridge"></a>
## 7. Conecta el puente y prueba la entrada si quieres

1. Abre «Dispositivos» desde la lista o el estado del puente en una conversación.
2. Si aún no hay información guardada, pulsa «Obtener información del puente», abre su página local y usa el enlace de retorno. Importa dirección y datos públicos de WebRTC. El enlace del teléfono del instalador aporta lo mismo.
3. Pulsa «Conectar puente ESP32» y selecciona el teléfono emparejado y listo si es necesario. Con los datos guardados, la próxima vez empiezas directamente por Conectar sin repetir Wi-Fi.
4. Para comprobar el teclado nativo, pulsa una vez «Iniciar prueba de entrada» y conserva página y campo en primer plano. La placa escribe ocho dígitos que el navegador confirma automáticamente. Es opcional en el firmware actual.

«Actualizar» solo lee el estado. Puente conectado, Bluetooth del teléfono conectado y entrada lista son estados diferentes. Si está inicializándose, espera un momento y actualiza. Una prueba rechazada explícitamente por límite de frecuencia muestra cuenta atrás y puede reintentarse una vez; no se reenvía a ciegas una entrada de resultado físico desconocido. Los errores muestran estado y motivo.

Prueba algo breve como «Abre Reloj y crea una alarma a las 7:00». Acepta compartir y pasa a la app objetivo. El agente observa, actúa y verifica, y vuelve por defecto a esta conversación. Desactiva **Ajustes → Finalización de tarea → Volver a Harness** para dejar abierta la app objetivo.

<a id="clipboard"></a>
## 8. Configura la copia con Atajos

1. En el teléfono abre el [tutorial del portapapeles](https://igent.cc/shortcuts/clipboard.html) y descarga el atajo firmado.
2. Añádelo en Atajos de Apple con el nombre exacto **iPhone Agent Clipboard**.
3. Conecta el puente. Cuando el agente prepare texto, pulsa «Copiar con Atajos». Si iOS pide que el atajo acceda a la URL local del puente, permite el acceso: es el permiso propio del atajo.
4. Regresa después de copiar. Harness espera el recibo y comprueba app y campo de destino antes de pegar.

El navegador entrega el texto por partes al puente y este lo devuelve al atajo en una respuesta HTTP local. No tiene que guardar el texto completo. Sin trabajo pendiente, el atajo no devuelve texto y deja intacto el portapapeles. También está disponible «Copiar y continuar» en primer plano, sin atajo.

<a id="install-skills"></a>
## 9. Instala una habilidad de la comunidad

En el teléfono abre **Ajustes → Habilidades → Comunidad**, o la [comunidad web](https://igent.cc/skills). Lee las instrucciones y pulsa «Añadir localmente». Las integradas aparecen junto a las publicaciones y ya están disponibles localmente. Puedes activar o desactivar cada habilidad instalada.

Recargar actualiza las integradas y busca versiones nuevas de instalaciones comunitarias sin modificar. Conserva activación y cambios locales. Una tarea activa mantiene las versiones con que empezó; las actualizaciones sirven para las siguientes. Las descargas siguen siendo de solo lectura y conservan el autor original.

<a id="authoring"></a>
## 10. Crea y mejora tu propia habilidad

En ordenador abre [Habilidades](https://igent.cc/skills) y elige «Crear tu habilidad» bajo «Crear y publicar». En teléfono usa **Ajustes → Habilidades → Crear**. Introduce nombre, slug en minúsculas, descripción breve e instrucciones Markdown, y guarda el borrador local.

También puedes pedir a Harness que cree o mejore tu habilidad. Describe objetivo, condiciones de uso, controles, qué muestra una captura de éxito y cómo ajustar tras un fallo. Las descargas e integradas permanecen de solo lectura.

La propiedad es una identidad de firma generada por el navegador, disponible en ordenador e iOS, no un UID iOS. Antes de cambiar de navegador o dispositivo, exporta el archivo de habilidad y una copia cifrada de «Identidad del creador». Restaura la identidad e importa tu archivo para seguir editando como el mismo autor.

<a id="publish"></a>
## 11. Comparte una habilidad

En la comunidad elige «Publicar» en tu borrador; en teléfono abre su panel de compartir y «Publicar en comunidad». Revisa y confirma. La identidad local firma el paquete público. Editar y publicar otra vez crea la siguiente versión; otros usuarios la reciben al actualizar sus copias instaladas.

Usa [Issues](https://github.com/cccat6/iphone-agent-harness/issues) para errores y sugerencias, y [PR](https://github.com/cccat6/iphone-agent-harness/pulls) para código, documentación y traducciones. Comparte habilidades personalizadas mediante la comunidad web, no como PR de código.

## Conversaciones y alojamiento propio

El título de lista alterna conversaciones y archivo. Deslizar permite Renombrar/Archivar, o Renombrar/Restaurar/Eliminar en archivo. Los mensajes antiguos cargan al subir; las respuestas conservan la lectura. «Últimos» vuelve a la salida actual.

Conversaciones, imágenes guardadas y credenciales permanecen en este navegador. Exporta desde el menú e importa en Ajustes; las exportaciones excluyen credenciales. El host sirve páginas y habilidades públicas; datos elegidos para modelos/MCP van directamente a esos servicios. También puedes [alojar Web Harness por tu cuenta](../architecture/deployment.md).
