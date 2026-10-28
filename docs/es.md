# Nederlandse Spoorwegen

## Presentación

Esta integración trae **NS**, los ferrocarriles neerlandeses, a Gladys. Da los **próximos trenes en tiempo real, con su retraso y su vía**, en las estaciones que elijas (tres en el formulario, hasta 10 más con un botón), filtrados por tipo de tren y dirección. También sigue las **incidencias** de cada estación: incidentes (avería de señalización, tren averiado), obras y alertas (tormenta, huelga). Cada estación se convierte en un dispositivo para mostrar en un panel y usar en escenas.

Los datos proceden de la **API oficial de NS** (`gateway.apiportal.ns.nl`), con tu propia clave gratuita. Cada estación seguida se lee con una petición, cada minuto por defecto (cada 10 minutos mientras ninguna estación anuncia un tren en la próxima media hora, de noche). Las incidencias se leen cada 5 minutos. La lista de estaciones de NS la guarda la integración y la vuelve a leer una vez por semana. NS permite 300 peticiones cada 5 minutos por clave: la integración siempre se queda por debajo.

NS da la **hora estimada** de cada tren: el retraso es la diferencia con la hora prevista. Se muestran los **cambios de vía** y los **trenes suprimidos**. Los nombres de estaciones, los mensajes y las incidencias quedan en inglés, tal como los escribe NS.

Es una integración **en la nube**: contacta con `gateway.apiportal.ns.nl` con tu clave. Nada más sale de tu red.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Una clave gratuita de la API de NS: crea una cuenta en [apiportal.ns.nl](https://apiportal.ns.nl/), abre **Products**, suscríbete a **Ns-App** (gratuito) y copia la **clave principal** que aparece en tu perfil.

## Configuración

| Campo                     | Qué escribir                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Clave de API              | La clave principal de tu suscripción «Ns-App» (32 caracteres).                                                 |
| Estación 1, 2, 3          | El código de la estación («UT», «ASD», los códigos de las pantallas de NS) o su nombre («Utrecht Centraal»).   |
| Tipos de tren             | Solo estos trenes: «IC», «SPR», «IC \| ICE». Vacío: todos los trenes.                                          |
| Dirección                 | Solo los trenes que van a estas estaciones o paran en ellas: «Amersfoort \| Zwolle». Vacío: todas direcciones. |
| Lectura de las estaciones | Cada 30 segundos, minuto, 2 minutos o 5 minutos.                                                               |
| Idioma de los textos      | Nombres de los dispositivos, resúmenes y salidas de las escenas. Los textos de NS quedan en inglés.            |

El botón **Buscar una estación** da las estaciones que contienen unas palabras, con su código («Den Haag Centraal [GVC]»). Un nombre también sirve («Utrecht», «Den Bosch»); cuando dos estaciones lo comparten, escribe el nombre completo o el código. **Probar la conexión** comprueba la clave y lee cada estación de inmediato.

La **dirección** mira el destino y las estaciones en las que para después el tren: «Amersfoort» conserva el Intercity a Zwolle que para en Amersfoort.

Más estaciones que las tres del formulario (casa, trabajo, escuela…): **Añadir una estación** toma los mismos tres campos — estación, tipos de tren, dirección — y sigue hasta 10 estaciones más. **Listar las estaciones** muestra todas las estaciones seguidas, numeradas; **Quitar una estación** toma ese número (o el nombre). Las estaciones añadidas se guardan en la configuración de Gladys, así que siguen sus copias de seguridad.

## Uso

### Dispositivos

En la pestaña **Descubrir**, crea los dispositivos que quieras, **NS \<estación\>**:

- el próximo tren como texto («IC 3529 → Venlo · 11 min (+8 min de retraso) · vía 15 (cambiada)»);
- la espera del próximo tren y del siguiente (minutos), y el retraso del próximo (minutos);
- el tráfico como texto («Servicio alterado: Utrecht - Amersfoort: fewer trains») y el número de incidencias en curso.

De noche, sin ningún tren, las esperas conservan su último valor.

### Incidencias

NS publica tres tipos: **incidencias** (incidentes), **obras** (previstas) y **alertas** (mensajes nacionales). El estado de una estación es el más grave en curso: servicio normal, obras, servicio alterado o incidencia grave. Las obras que empiezan en los próximos tres días se muestran como próximas.

### Widgets del panel

![El widget Salidas NS de Utrecht Centraal y el widget Incidencias NS de dos estaciones (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-nederlandse-spoorwegen/main/docs/assets/widgets.es.png)

- **Salidas NS**: el panel de salidas de una estación: una fila por tren, con su hora prevista, su tipo, su destino, su retraso («+8») y su vía. La fila se vuelve naranja cuando el tren lleva 5 minutos de retraso o más o cambia de vía, roja cuando se suprime. El ajuste **Trenes mostrados** fija el número de filas. Elige una estación seguida, o escribe cualquier estación (y tipos de tren) en los ajustes del widget. Con **Varias estaciones**, un mismo widget muestra varios dispositivos de estación.
- **Incidencias NS**: el estado de tus estaciones, luego las incidencias y obras en curso y próximas, con su periodo. Toca una tarjeta para ver el texto completo. Con **Toda la red**, las incidencias de toda la red neerlandesa.

### Escenas

Disparadores, una vez por cambio (la primera lectura solo sirve de referencia):

- **NS: tren a punto de salir**: un tren de una estación seguida sale dentro de 2, 5, 10, 15, 20 o 30 minutos, contado según su hora estimada.
- **NS: tren suprimido**: un tren de las dos próximas horas en una estación seguida se suprime.
- **NS: tren con retraso**: el retraso de un tren de las dos próximas horas llega a 5, 10, 15 o 30 minutos (el umbral más alto alcanzado). Marca 5, 10, 15 y 30 para cualquier retraso de 5 minutos o más.
- **NS: cambio de vía**: un tren de las dos próximas horas sale de otra vía.
- **NS: incidencia en una estación**: empieza una incidencia, unas obras o una alerta que afecta a una estación seguida.
- **NS: fin de incidencia**: ha terminado.

Cada uno da una frase lista para usar, `{{triggerEvent.data.summary}}`, y sus valores (tren, destino, hora, vía, retraso, título, causa…). Las acciones **NS: próximos trenes** y **NS: incidencias de una estación** devuelven el mismo tipo de valores, para ponerlos en un mensaje o comprobarlos en una condición.

Ejemplos:

- Cuando el Intercity a Amersfoort sale de Utrecht Centraal dentro de 10 minutos → encender en verde la lámpara de la entrada.
- Cuando tu tren se suprime, lleva 15 minutos de retraso o cambia de vía → enviar el resumen a tu teléfono.
- Cada día laborable a las 7:30 → leer los próximos trenes de tu estación y que los anuncie el altavoz de la cocina.

### Transporte

Solo nube: los datos vienen de Internet. Solo se piden a la API de NS las estaciones que sigues, una a una.

## Solución de problemas

- **«NS rechaza la clave de API»**: comprueba que copiaste la clave principal del producto **Ns-App** y que la suscripción está activa en apiportal.ns.nl.
- **«Desconocido o ambiguo»**: usa **Buscar una estación** y copia el nombre exacto o el código.
- **«Demasiadas peticiones a NS»**: la clave se comparte con otra aplicación, o se leen demasiadas estaciones cada 30 segundos; elige una lectura menos frecuente.
- **Ningún tren**: de noche la red duerme; la estación se lee cada 10 minutos.
- **«No se puede contactar con NS»**: la integración lo vuelve a intentar en cada lectura; los últimos trenes se quedan en los widgets.
- **Para informar de un problema**: pulsa **Diagnóstico** y copia las líneas que empiezan por «NS diagnostic» de la pestaña Registros en una issue de GitHub o una respuesta en el foro, con las versiones de Gladys y de la integración. La clave nunca aparece ahí.
