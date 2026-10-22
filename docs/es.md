# Kimai

El control de tiempo de su [Kimai](https://www.kimai.org) en Gladys: el
cronómetro en marcha, las horas del día, de la semana y del mes. Una escena
inicia un cronómetro cuando se sienta en su escritorio o llega a la oficina,
lo detiene cuando se va, y le avisa cuando ya ha trabajado bastante por hoy;
un toque en el panel detiene el cronómetro o cambia de proyecto.

> **Se agradecen los comentarios.** Esta integración se ha probado contra un
> servidor Kimai real (imagen Docker `kimai/kimai2:apache` 2.70.2 con
> MariaDB, octubre de 2026), aún no en el uso diario, ni contra Kimai Cloud.
> Si algo no funciona como se describe, indíquelo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-kimai/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un **Kimai 2**, autoalojado y accesible desde Gladys (la imagen Docker
  escucha en el puerto 8001), o una cuenta de **Kimai Cloud**.
- Un **token de API** del usuario de Kimai cuyo tiempo controla. En Kimai:
  su avatar (arriba a la derecha) → **Editar** → **Acceso API** → **Crear**,
  dele un nombre (`Gladys`). Copie el token: Kimai solo lo muestra una vez.

  Antes de Kimai 2.14 no había tokens de API, solo una **contraseña de API**
  (misma pantalla). Sigue funcionando: rellene el campo **Usuario** y ponga
  la contraseña de API en el campo del token. Kimai considera este método
  obsoleto.

La integración ve los registros de tiempo, proyectos y actividades de este
usuario, e inicia y detiene cronómetros **en su nombre**. Basta con un
usuario normal (sin rol de administrador).

## Instalación

1. En Gladys, **Integraciones** → instale **Kimai**.
2. En la pantalla **Configuración**, rellene:
   - **Dirección**: la dirección de Kimai, por ejemplo
     `http://192.168.1.20:8001`, `https://kimai.example.org` detrás de un
     proxy inverso (se conserva un prefijo como `/kimai`), o
     `acme.kimai.cloud`. La dirección copiada del navegador también sirve;
   - **Token de API**.
3. Opciones:
   - **Límite diario, en horas**: al superarlo, el desencadenante **Límite
     diario de Kimai alcanzado** se activa, una vez al día: `8`, `7.5`, `7,5`
     o `7:30`. 8 horas por defecto; vacío: inactivo;
   - **Aceptar certificados autofirmados**: para una dirección `https://` con
     certificado autofirmado, solo en su propio servidor;
   - **Intervalo de actualización**: de 30 segundos a 5 minutos (1 minuto por
     defecto): lo que tarda en verse en Gladys un cronómetro iniciado o
     detenido en Kimai. Las duraciones avanzan cada minuto sea cual sea el
     intervalo;
   - **Idioma de los nombres de funciones**: los nombres dados a las
     funciones al añadir el dispositivo (francés por defecto), y los textos
     enviados a las escenas.
4. Guarde y luego **Probar la conexión**: la integración lee Kimai e indica
   su versión, el usuario y las horas del día.
5. En la pestaña **Descubrimiento**, añada el dispositivo **Kimai _usuario_**.

## Dispositivos

Un dispositivo, **Kimai _usuario_** (el alias del usuario en Kimai, o su
nombre de usuario), con seis funciones:

| Función                   | Lo que indica                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Cronómetro en marcha`    | encendido mientras un cronómetro funciona. Un interruptor: apagado lo detiene, encendido reanuda la última entrada |
| `Proyecto actual`         | `Proyecto · Actividad` del cronómetro en marcha; si no, `Ningún cronómetro`                                        |
| `Duración del cronómetro` | minutos desde el inicio del cronómetro en marcha; si no, 0                                                         |
| `Horas hoy`               | horas de las entradas que empezaron hoy, el cronómetro en marcha incluido                                          |
| `Horas esta semana`       | igual, desde el primer día de la semana (lunes, o domingo si así lo indica el perfil de Kimai)                     |
| `Horas este mes`          | igual, desde el primer día del mes                                                                                 |

«Hoy» es el día en la zona horaria de Gladys. Una entrada cuenta para el día
en que **empieza**, como en los informes de Kimai: una entrada de 23:00 a
01:00 pertenece al primer día. Las pausas se descuentan, como en Kimai.

«Reanudar la última entrada» inicia un nuevo cronómetro con el proyecto, la
actividad y la descripción de la última entrada detenida, como el botón de
reinicio de Kimai.

## Panel

El widget **Cronómetro de Kimai** muestra dos mosaicos (hoy, esta semana; el
primero en naranja al superar el límite diario), el cronómetro en marcha con
su duración, y hasta cuatro botones: **Detener** mientras un cronómetro
funciona, si no **Reanudar**, y luego los tres últimos pares de proyecto y
actividad: un toque cambia al momento a ese proyecto (el cronómetro en marcha
se detiene).

Las funciones también pueden ir al panel como las de cualquier dispositivo:
el interruptor `Cronómetro en marcha` es entonces un botón de inicio/parada.

## Escenas

### Disparadores

- **Cronómetro de Kimai iniciado**: se ha iniciado un cronómetro, desde
  Gladys, la aplicación web de Kimai, la aplicación móvil u otro sitio.
- **Cronómetro de Kimai detenido**: se ha detenido un cronómetro, con su
  duración.
- **Límite diario de Kimai alcanzado**: las horas del día han superado el
  **Límite diario** de la configuración. Una vez al día, con un minuto de
  retraso como mucho, incluso con el cronómetro en marcha.

Filtros, para los dos primeros: el nombre del proyecto y el de la actividad
(nombres exactos; vacío: cualquiera). Información transmitida a las
acciones: el número de la entrada, el proyecto, la actividad, el cliente, la
descripción, y la duración en minutos de un cronómetro detenido. Para el
límite: las horas del día, el límite, si hay un cronómetro en marcha y su
proyecto.

Kimai se lee cada 30 segundos a 5 minutos: un cronómetro iniciado o detenido
en Kimai activa su disparador en ese plazo (al momento si viene de Gladys).
Un cronómetro iniciado y detenido entre dos lecturas no activa nada. Un
reinicio de la integración no activa nada dos veces, y un cronómetro
detenido mientras estaba parada activa su disparador al volver.

### Acciones

- **Iniciar un cronómetro de Kimai**: el **proyecto** y la **actividad** por
  su nombre (sin distinguir mayúsculas ni acentos) o su número, y una
  descripción opcional. La actividad es del proyecto o global. **Detener el
  cronómetro en marcha**: marcado, primero se detiene el cronómetro en
  marcha; sin marcar, se mantiene y no se inicia nada (Kimai solo permite un
  cronómetro a la vez por defecto; si permite varios, el nuevo se inicia al
  lado). Resultados: el número de la entrada, el proyecto, la actividad.
- **Detener el cronómetro de Kimai**: detiene el cronómetro en marcha, si lo
  hay (sin error si no hay ninguno). Resultados: el número de cronómetros
  detenidos, la duración en minutos, el proyecto, la actividad.
- **Alternar el cronómetro de Kimai**: detiene el cronómetro en marcha; si
  no hay ninguno, inicia el proyecto y la actividad indicados, o reanuda la
  última entrada si están vacíos. Resultados: si hay un cronómetro en marcha
  después, la duración del detenido, el proyecto, la actividad.

Los campos aceptan variables de escena.

### Ideas de escenas

- Un botón en el escritorio ejecuta **Alternar el cronómetro de Kimai**: una
  pulsación para empezar la jornada, otra para terminarla.
- Cuando el teléfono llega a la oficina, **Iniciar un cronómetro de Kimai**
  con `Oficina` / `Desarrollo` y **Detener el cronómetro en marcha** marcado;
  cuando se va, **Detener el cronómetro de Kimai**.
- **Límite diario de Kimai alcanzado**: atenuar la lámpara del escritorio y
  enviar «Basta por hoy: {{triggerEvent.data.hours_today}} h» por Telegram.
- Cuando el ordenador se apaga (un dispositivo ping), **Detener el
  cronómetro de Kimai**.

## Solución de problemas

- **«Kimai no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys (`http://<dirección>:8001` abre Kimai en un navegador).
- **«Token de API rechazado»**: el token se ha borrado, ha caducado o está
  mal copiado. Con la antigua contraseña de API, compruebe también el
  **Usuario**; con un token de API, deje **Usuario** vacío.
- **«No hay ninguna API de Kimai en esta dirección»**: la dirección
  responde, pero no con la API de Kimai: compruebe el puerto, o el prefijo
  detrás de un proxy inverso.
- **«La dirección redirige»**: introduzca la dirección `https://`.
- **«Ningún proyecto visible tiene este nombre o número»**: el proyecto está
  oculto, es de un cliente oculto, o el usuario no está en el equipo que lo
  ve.
- **«Ya hay un cronómetro en marcha»**: marque **Detener el cronómetro en
  marcha** en la acción, o use **Alternar el cronómetro de Kimai**.
- **Las horas no coinciden con la pantalla de Kimai**: Gladys cuenta el día
  en su zona horaria, Kimai en la del perfil del usuario: configure la misma.
- Registros: `LOG_LEVEL=debug` en el contenedor muestra cada lectura.

## Límites

- Un usuario por integración: el del token. Seguir a varios usuarios
  requeriría una integración de Gladys para cada uno (hoy no es posible), o
  un token de administrador (no admitido).
- Kimai se lee cada 30 segundos a 5 minutos, dos solicitudes por lectura
  (los cronómetros en marcha, las entradas desde el inicio del mes o de la
  semana, 250 por página, hasta 10 páginas), más los proyectos, actividades
  y clientes cada 30 minutos. No se usan los webhooks de Kimai (un plugin).
- La integración inicia y detiene cronómetros, y reanuda la última entrada;
  no modifica, borra ni exporta entradas, e ignora etiquetas, tarifas y
  presupuestos.
- Probada con Kimai 2.70.2. Las versiones 2.x anteriores deberían funcionar,
  pero no se han probado, como tampoco Kimai Cloud. Kimai 1 no está
  admitido.
- Gladys no guarda ningún dato de Kimai fuera de `/data/kimai-state.json`
  (los cronómetros vistos por última vez y el día del último aviso de
  límite, para que ningún evento se active dos veces).
- Desarrollada sin un Kimai de uso diario: se agradecen los comentarios.
- Sin relación con Kimai.
