# Sistema de Control de Asistencia con ESP32 y Dashboard Web

Este proyecto es un sistema completo para el control de asistencia de personal, compuesto por un dispositivo físico basado en ESP32 para el registro de huellas dactilares y un dashboard web para la visualización y análisis de los datos.

## Características

### Reloj Checador (ESP32)

*   **Registro por Huella Dactilar:** Sistema biométrico para registrar entradas y salidas.
*   **Teclado Matricial:** Para navegación en menús y configuración.
*   **Pantalla OLED:** Muestra la hora, el estado del sistema y menús interactivos.
*   **Conectividad Wi-Fi:** Se conecta a internet para sincronizar la hora y enviar los registros a la nube.
*   **Modo Offline:** Capacidad de operar sin conexión a internet (aunque el envío de datos se pausa).
*   **Gestión de Usuarios:** Menú de administrador protegido por PIN para registrar, eliminar e identificar usuarios.
*   **Almacenamiento Local:** Guarda la información de los usuarios (ID, nombre) en la memoria flash del ESP32 (SPIFFS).

### Dashboard de Asistencia (HTML, CSS, JavaScript)

*   **Visualización de Datos:** Muestra todos los registros de asistencia en una tabla paginada y con filtros.
*   **Dashboard Interactivo:** Ofrece gráficos y estadísticas sobre las horas trabajadas, puntualidad y tipos de registro.
*   **Análisis por Trabajador:** Permite analizar en detalle la asistencia de un trabajador específico.
*   **Configuración Personalizada:** Permite definir horarios de trabajo, tolerancias y perfiles de usuario.
*   **Integración con Google Sheets:** Los datos se obtienen de una hoja de cálculo de Google a través de un Google Apps Script.

## Cómo Funciona

1.  **Registro:** Un usuario coloca su huella en el sensor del dispositivo ESP32.
2.  **Identificación:** El dispositivo identifica al usuario y determina si es una entrada o una salida.
3.  **Envío de Datos:** El ESP32 envía la información del registro (ID de usuario, nombre, tipo de registro y timestamp) a un Google Apps Script.
4.  **Almacenamiento en la Nube:** El Google Apps Script recibe los datos y los almacena en una hoja de cálculo de Google.
5.  **Visualización:** El dashboard web solicita los datos al mismo Google Apps Script, los procesa y los muestra de forma gráfica e interactiva.

## Puesta en Marcha

### Prerrequisitos

*   **Hardware (Reloj Checador):**
    *   ESP32
    *   Sensor de huellas dactilares (ej. FPM10A)
    *   Pantalla OLED (128x64)
    *   Teclado matricial 4x4
    *   Cables y protoboard

*   **Software:**
    *   Arduino IDE o PlatformIO (con las librerías correspondientes)
    *   Una cuenta de Google

### Configuración

#### 1. Google Apps Script

1.  Crea una nueva **Hoja de Cálculo** en Google Sheets.
2.  Ve a `Extensiones > Apps Script`.
3.  Pega el código del script que interactúa con el ESP32 y el dashboard.
4.  Implementa el script como una **aplicación web** y otorga los permisos necesarios.
5.  Copia la **URL de la aplicación web**.

#### 2. Reloj Checador (ESP32)

1.  Abre el proyecto `reloj_checador_ino` en tu IDE de Arduino.
2.  Instala las librerías necesarias (revisar los `#include` en el archivo `.ino`).
3.  En el archivo `config.h`, pega la URL de tu Google Apps Script en la variable `SCRIPT_URL`.
4.  Carga el código a tu placa ESP32.

#### 3. Dashboard Web

1.  Abre el archivo `script.js`.
2.  Pega la URL de tu Google Apps Script en la constante `SCRIPT_URL`.
3.  Abre el archivo `index.html` en un navegador web.

## Contribuciones

Las contribuciones son bienvenidas. Si deseas mejorar este proyecto, por favor, abre un "issue" para discutir los cambios propuestos o envía un "pull request".

## Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.
